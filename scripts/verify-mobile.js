#!/usr/bin/env node
// This guard runs from Gradle preBuild as well as the CLI. Staging/copying is
// explicit; a build never silently hides stale input by updating it itself.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inventory(dir, prefix = '') {
  const result = {};
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.posix.join(prefix, item.name), absolute = path.join(dir, item.name);
    if (item.isDirectory()) Object.assign(result, inventory(absolute, file));
    else if (item.isFile()) result[file] = digest(fs.readFileSync(absolute));
    else throw Error(`Unexpected asset type: ${file}`);
  }
  return result;
}
function inputs(root) {
  return Object.fromEntries(['package.json', 'package-lock.json', 'capacitor.config.json',
    'scripts/sync-mobile.js', 'scripts/vendor-mobile.js', 'scripts/verify-mobile.js'].map(file =>
    [file, digest(fs.readFileSync(path.join(root, file)))]));
}
function stampBundle(root, www) {
  const files = inventory(www);
  delete files['bundle-manifest.json'];
  fs.writeFileSync(path.join(www, 'bundle-manifest.json'), JSON.stringify({ format: 1, inputs: inputs(root), files }, null, 2) + '\n');
}
function same(actual, expected, label) {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  const wrong = [...keys].filter(key => actual[key] !== expected[key]);
  if (wrong.length) throw Error(`${label}: missing, changed or stale assets: ${wrong.join(', ')}. Run npm run cap:sync.`);
}
function verifyVendor(root, www) {
  const manifest = JSON.parse(fs.readFileSync(path.join(www, 'shared/vendor/manifest.json')));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  for (const name of Object.keys(pkg.dependencies).filter(name => name.startsWith('@capacitor/') && !['@capacitor/android', '@capacitor/ios'].includes(name)).concat('@supabase/supabase-js'))
    if (!manifest.packages[name]) throw Error(`Missing vendor package metadata: ${name}`);
  for (const [name, meta] of Object.entries(manifest.packages)) {
    const installed = lock.packages[meta.installedPath];
    if (!installed || installed.version !== meta.version || installed.integrity !== meta.integrity)
      throw Error(`Vendor/lock version mismatch: ${name}. Run npm ci and npm run vendor:mobile.`);
    if (pkg.dependencies[name] && pkg.dependencies[name] !== meta.version) throw Error(`Runtime version is not pinned: ${name}`);
  }
  for (const name of ['@capacitor/core', '@capacitor/android', '@capacitor/ios']) {
    if (pkg.dependencies[name] !== pkg.dependencies['@capacitor/core']) throw Error(`Native/core version mismatch: ${name}`);
  }
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (lock.packages['node_modules/' + name]?.version !== version) throw Error(`Package/lock mismatch: ${name}`);
    const installedFile = path.join(root, 'node_modules', name, 'package.json');
    if (!fs.existsSync(installedFile) || JSON.parse(fs.readFileSync(installedFile)).version !== version)
      throw Error(`Installed dependency mismatch: ${name}. Run npm ci.`);
  }
}
function verifyAndroidResources(root) {
  const base = path.join(root, 'android/app/src/main');
  const resources = inventory(path.join(base, 'res'));
  const required = ['xml/file_paths.xml', 'values/styles.xml', 'values/strings.xml',
    'mipmap-anydpi-v26/ic_launcher.xml', 'mipmap-anydpi-v26/ic_launcher_round.xml', 'drawable/splash.png'];
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const icon of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) required.push(`mipmap-${density}/${icon}.png`);
    for (const orientation of ['land', 'port']) required.push(`drawable-${orientation}-${density}/splash.png`);
  }
  for (const file of required) if (!resources[file]) throw Error(`Missing Android icon/splash/resource: ${file}`);
  const defined = new Set();
  let xml = fs.readFileSync(path.join(base, 'AndroidManifest.xml'), 'utf8');
  for (const file of Object.keys(resources)) {
    const type = file.split('/')[0].split('-')[0], name = path.basename(file, path.extname(file));
    if (type !== 'values') defined.add(`${type}/${name}`);
    const absolute = path.join(base, 'res', file);
    if (file.endsWith('.xml')) {
      const text = fs.readFileSync(absolute, 'utf8'); xml += '\n' + text;
      if (type === 'values') for (const match of text.matchAll(/<(string|style|color|dimen|bool|integer)\b[^>]*name="([^"]+)"/g)) defined.add(`${match[1]}/${match[2]}`);
    }
    if (file.endsWith('.png')) {
      const bytes = fs.readFileSync(absolute);
      if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20))
        throw Error(`Invalid Android PNG: ${file}`);
    }
  }
  // Capacitor's Android library supplies these theme colors. Include its
  // official resource definitions rather than treating them as app assets.
  const libraryColors = fs.readFileSync(path.join(root, 'node_modules/@capacitor/android/capacitor/src/main/res/values/colors.xml'), 'utf8');
  for (const match of libraryColors.matchAll(/<color\b[^>]*name="([^"]+)"/g)) defined.add(`color/${match[1]}`);
  for (const match of xml.matchAll(/@(mipmap|drawable|xml|string|style|color|dimen|bool|integer)\/([\w.]+)/g))
    if (!defined.has(`${match[1]}/${match[2]}`)) throw Error(`Unresolved Android resource: ${match[0]}`);
  if (!/@style\/AppTheme.NoActionBarLaunch/.test(xml) || !/@drawable\/splash/.test(xml)) throw Error('Missing Android launch splash configuration');
}
function verifyMobile({ root = ROOT, www = path.join(root, 'mobile/www'), android = false } = {}) {
  const { auditBundle } = require('./sync-mobile.js');
  auditBundle(www);
  const stamp = JSON.parse(fs.readFileSync(path.join(www, 'bundle-manifest.json')));
  same(stamp.inputs, inputs(root), 'Packaging inputs');
  const staged = inventory(www); delete staged['bundle-manifest.json'];
  same(staged, stamp.files, 'Staged bundle');
  const live = {};
  for (const dir of ['admin', 'shared']) for (const [file, hash] of Object.entries(inventory(path.join(root, dir)))) live[`${dir}/${file}`] = hash;
  // The root redirect is generated by the audited, input-hashed sync script.
  live['index.html'] = stamp.files['index.html'];
  same(stamp.files, live, 'Source versus staging');
  verifyVendor(root, www);
  if (android) {
    const copied = inventory(path.join(root, 'android/app/src/main/assets/public'));
    // Capacitor supplies these two Cordova compatibility files at copy time.
    delete copied['cordova.js']; delete copied['cordova_plugins.js'];
    same(copied, inventory(www), 'Android copied bundle');
    const plugins = JSON.parse(fs.readFileSync(path.join(root, 'android/app/src/main/assets/capacitor.plugins.json')));
    for (const name of Object.keys(JSON.parse(fs.readFileSync(path.join(www, 'shared/vendor/manifest.json'))).packages).filter(n => n.startsWith('@capacitor/') && n !== '@capacitor/core' && n !== '@capacitor/synapse'))
      if (!plugins.some(plugin => plugin.pkg === name)) throw Error(`Missing Android registration: ${name}`);
    const sourceConfig = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json')));
    const copiedConfig = JSON.parse(fs.readFileSync(path.join(root, 'android/app/src/main/assets/capacitor.config.json')));
    if (JSON.stringify(sourceConfig) !== JSON.stringify(copiedConfig)) throw Error('Stale Android Capacitor configuration. Run npm run cap:sync.');
    verifyAndroidResources(root);
  }
  return { files: Object.keys(stamp.files).length, android };
}
module.exports = { inventory, stampBundle, verifyMobile, verifyAndroidResources, verifyVendor };
if (require.main === module) {
  try { const report = verifyMobile({ android: process.argv.includes('--android') }); console.log(`Verified ${report.files} fresh assets${report.android ? ', Android copy and resources' : ''}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
