import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, cpSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { verifyMobile, verifyAndroidResources, verifyVendor } = require('../scripts/verify-mobile.js');
const { auditBundle } = require('../scripts/sync-mobile.js');
const root = mkdtempSync(join(tmpdir(), 'nova-packaging-'));
const repo = new URL('../', import.meta.url).pathname;
for (const file of ['admin', 'shared', 'scripts', 'package.json', 'package-lock.json', 'capacitor.config.json', 'mobile/www', 'android/app/src/main']) {
  mkdirSync(join(root, file, '..'), { recursive: true });
  cpSync(join(repo, file), join(root, file), { recursive: true });
}
symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'), 'dir');
const www = join(root, 'mobile/www');
const results = [];
function check(name, fn) { try { fn(); results.push({ name, ok: true }); } catch (error) { results.push({ name, error: error.message }); } }
function mutate(file, fn, probe) {
  const absolute = join(root, file), before = readFileSync(absolute);
  try { fn(absolute, before); probe(); } finally { writeFileSync(absolute, before); }
}
const verify = () => verifyMobile({ root, www, android: true });
try {
  check('Every vendor runtime file can be committed despite generic dist ignores', () => {
    const manifest=JSON.parse(readFileSync(join(repo,'shared/vendor/manifest.json')));
    const paths=Object.keys(manifest.files).map(file=>'shared/vendor/'+file).concat('shared/vendor/manifest.json');
    const result=spawnSync('git',['check-ignore','--no-index','--stdin'],{cwd:repo,input:paths.join('\n')+'\n',encoding:'utf8'});
    assert.equal(result.status,1,result.stdout || result.stderr);assert.equal(result.stdout,'');
  });
  check('Current source, staging and Android copy pass the production build guard', () => assert.ok(verify().files > 100));
  check('A source edit after sync is rejected', () => mutate('admin/js/field.js', (p,b) => writeFileSync(p, b + '\n// newer source\n'), () => assert.throws(verify, /Source versus staging.*field.js/)));
  check('Stale staged JS is rejected by the actual CLI used by Gradle', () => mutate('mobile/www/admin/js/field.js', (p,b) => writeFileSync(p, b + '\n// stale staging\n'), () => assert.throws(() => execFileSync(process.execPath, [join(root, 'scripts/verify-mobile.js'), '--android'], { stdio: 'pipe' }), error => String(error.stderr).includes('Staged bundle:') && String(error.stderr).includes('field.js'))));
  check('Stale Android assets cannot pass the build guard', () => mutate('android/app/src/main/assets/public/admin/js/field.js', (p,b) => writeFileSync(p, b + '\n// stale copy\n'), () => assert.throws(verify, /Android copied bundle.*field.js/)));
  check('A copied bundle with extra obsolete files is rejected', () => {
    const file = join(root, 'android/app/src/main/assets/public/obsolete.js'); writeFileSync(file, 'old');
    try { assert.throws(verify, /Android copied bundle.*obsolete.js/); } finally { rmSync(file); }
  });
  check('Changing packaging configuration requires a new sync', () => mutate('capacitor.config.json', (p,b) => writeFileSync(p,b + '\n'), () => assert.throws(verify, /Packaging inputs.*capacitor.config/)));
  check('Removing a lazy plugin is caught even before it is requested', () => mutate('mobile/www/shared/vendor/@capacitor/app/dist/esm/index.js', p => rmSync(p), () => assert.throws(() => auditBundle(www), /capacitor\/app/)));
  check('Corrupting a vendor file is rejected by its recorded hash', () => mutate('mobile/www/shared/vendor/@supabase/auth-js/dist/module/index.js', (p,b) => writeFileSync(p,b + '\n'), () => assert.throws(() => auditBundle(www), /changed vendor asset/)));
  check('Vendor version drift from the lockfile is rejected', () => mutate('package-lock.json', (p,b) => { const l = JSON.parse(b); l.packages['node_modules/@capacitor/app'].version='8.0.0'; writeFileSync(p, JSON.stringify(l)); }, () => assert.throws(() => verifyVendor(root,www), /Vendor\/lock version mismatch/)));
  check('Floating runtime versions are rejected', () => mutate('package.json', (p,b) => { const v=JSON.parse(b); v.dependencies['@capacitor/core']='^8.5.2'; writeFileSync(p,JSON.stringify(v)); }, () => assert.throws(() => verifyVendor(root,www), /not pinned/)));
  check('Stale native Capacitor configuration is rejected', () => mutate('android/app/src/main/assets/capacitor.config.json', (p,b) => { const v=JSON.parse(b); v.server.androidScheme='http'; writeFileSync(p,JSON.stringify(v)); }, () => assert.throws(verify, /Stale Android Capacitor configuration/)));
  check('Missing native plugin registration is rejected', () => mutate('android/app/src/main/assets/capacitor.plugins.json', (p,b) => writeFileSync(p, JSON.stringify(JSON.parse(b).filter(v=>v.pkg!=='@capacitor/app'))), () => assert.throws(verify, /Missing Android registration.*app/)));
  check('Missing launcher density asset is rejected', () => mutate('android/app/src/main/res/mipmap-hdpi/ic_launcher.png', p => rmSync(p), () => assert.throws(() => verifyAndroidResources(root), /Missing Android icon/)));
  check('Missing splash variant is rejected', () => mutate('android/app/src/main/res/drawable-port-xxhdpi/splash.png', p => rmSync(p), () => assert.throws(() => verifyAndroidResources(root), /Missing Android icon\/splash/)));
  check('Empty PNG resources are rejected', () => mutate('android/app/src/main/res/drawable/splash.png', p => writeFileSync(p,''), () => assert.throws(() => verifyAndroidResources(root), /Invalid Android PNG/)));
  check('Unresolved manifest icons are rejected', () => mutate('android/app/src/main/AndroidManifest.xml', (p,b) => writeFileSync(p,b.toString().replace('@mipmap/ic_launcher"','@mipmap/missing_icon"')), () => assert.throws(() => verifyAndroidResources(root), /Unresolved Android resource/)));
  check('Missing Android manifest is rejected', () => mutate('android/app/src/main/AndroidManifest.xml', p => rmSync(p), () => assert.throws(() => verifyAndroidResources(root), /ENOENT/)));
  check('Gradle preBuild depends on the production guard', () => assert.match(readFileSync(join(repo,'android/app/build.gradle'),'utf8'), /commandLine 'node', 'scripts\/verify-mobile.js', '--android'[\s\S]*tasks.named\('preBuild'\).configure \{ dependsOn verifyNovaAssets \}/));
} finally { rmSync(root,{recursive:true,force:true}); }
for (const r of results) console.log(`${r.ok?'PASS':'FAIL'} - ${r.name}${r.error?'\n  '+r.error:''}`);
console.log(`\n${results.filter(r=>r.ok).length}/${results.length} passed`);
if(results.some(r=>!r.ok)) process.exitCode=1;
