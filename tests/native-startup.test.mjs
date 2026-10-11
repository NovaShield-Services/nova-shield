import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { default: pw } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright/index.js');
const browser = await pw.chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium' });
const BASE = 'http://localhost:8743';
const evidence = process.env.STARTUP_EVIDENCE || join(tmpdir(), 'nova-native-startup-evidence');
mkdirSync(evidence, { recursive: true });
const results = [];
async function check(name, fn) { if (process.env.STARTUP_ONLY && !name.includes(process.env.STARTUP_ONLY)) return; try { await fn(); results.push({name,ok:true}); console.log('PASS - '+name); } catch(error) { results.push({name,error:error.message}); console.log('FAIL - '+name+'\n  '+error.message); } }
async function fixture(fn, { offline=true, width=390, theme='light', native=false }={}) {
  const context = await browser.newContext({ viewport:{width,height:844},colorScheme:theme,serviceWorkers:'block' });
  context.setDefaultTimeout(7000);
  const external=[];
  await context.route('**/*',route=> {
    if(new URL(route.request().url()).origin===BASE) return route.continue();
    external.push(route.request().url()); return route.abort('internetdisconnected');
  });
  await context.addInitScript(({offline,native}) => {
    Object.defineProperty(navigator,'onLine',{get:()=>offline?false:true});
    if(native) window.androidBridge={postMessage() {}};
    if(sessionStorage.getItem('inject-quota')==='yes') indexedDB.open=()=>{throw new DOMException('Injected storage quota failure','QuotaExceededError');};
  },{offline,native});
  if (process.env.STARTUP_BREAK === 'cdn') {
    for (const file of ['shared/supabase.js','admin/js/lib/native.js']) {
      const body=execFileSync('git',['show',`d33d17e:${file}`],{encoding:'utf8'});
      await context.route(`**/${file}`,route=>route.fulfill({contentType:'application/javascript',body}));
    }
  }
  if (process.env.STARTUP_BREAK === 'handler') {
    const body=execFileSync('git',['show','d33d17e:admin/field.html'],{encoding:'utf8'});
    await context.route('**/admin/field.html',route=>route.fulfill({contentType:'text/html',body}));
  }
  if (process.env.STARTUP_BREAK === 'singleton') {
    const body=readFileSync(new URL('../shared/supabase.js',import.meta.url),'utf8').replace('clients.get(clientKey) || createClient','createClient');
    await context.route('**/shared/supabase.js*',route=>route.fulfill({contentType:'application/javascript',body}));
  }
  if (process.env.STARTUP_BREAK === 'access') {
    const body=readFileSync(new URL('../admin/js/field.js',import.meta.url),'utf8').replace('if (error) throw error;', '// previous authorization fallback');
    await context.route('**/admin/js/field.js',route=>route.fulfill({contentType:'application/javascript',body}));
  }
  if (process.env.STARTUP_BREAK === 'wrap') {
    const body=execFileSync('git',['show','d33d17e:admin/css/admin.css'],{encoding:'utf8'});
    await context.route('**/admin/css/admin.css',route=>route.fulfill({contentType:'text/css',body}));
  }
  const page=await context.newPage();
  try { await fn({context,page,external}); } finally { await context.close(); }
}
async function load(page,path='/mobile/www/admin/field.html') {
  await page.goto(BASE+path);
  await page.getByRole('heading',{name:'Work unavailable offline'}).waitFor();
}
async function seed(page) {
  return page.evaluate(async()=>{
    // Anonymous cold startup cannot create new owned actions. Seed legacy
    // records directly: the startup controller must still preserve them.
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ns-field-outbox');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('queue','readwrite');const store=tx.objectStore('queue');
      store.add({type:'updateProperty',args:{id:'fixture-property',patch:{notes:'preserve this exact payload'}},label:'Save Property Passport',createdAt:1});
      store.add({type:'uploadJobPhoto',args:{jobId:'fixture-job',file:new File(['photo-bytes'],'photo.jpg',{type:'image/jpeg'}),opts:{kind:'before'}},label:'Photo upload',createdAt:2});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    await (await import('/mobile/www/admin/js/lib/offline-queue.js')).count();
    window.dispatchEvent(new Event('offline'));
    return await read();
    async function read(){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ns-field-outbox');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('queue').objectStore('queue').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
  });
}
async function snapshot(page) {
  return page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ns-field-outbox');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try {const records=await new Promise((resolve,reject)=>{const r=db.transaction('queue').objectStore('queue').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      return await Promise.all(records.map(async r=>({...r,args:Object.fromEntries(await Promise.all(Object.entries(r.args).map(async([k,a])=>[k,a instanceof Blob?{name:a.name,type:a.type,text:await a.text()}:a])))})));
    }finally{db.close();}
  });
}
async function retry(page) {
  await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'Retry startup',exact:true}).click()]);
  await page.getByRole('heading',{name:'Work unavailable offline'}).waitFor();
}
for(const path of ['/admin/field.html','/mobile/www/admin/field.html']) {
  await check(`Cold ${path} loads offline without any external request`,()=>fixture(async({page,external})=>{
    await load(page,path); assert.deepEqual(external,[]);
    assert.match(await page.locator('#view').innerText(),/No recent work is saved for this account/);
    await page.locator('#syncBadge').click();await page.getByText('Offline — nothing waiting to sync',{exact:true}).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('Loading…'));
  }));
}
await check('A plain desktop browser still reaches sign in using the real local SDK',()=>fixture(async({page})=>{
  await page.goto(BASE+'/admin/index.html');await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  assert.equal(await page.locator('[role="alert"]').count(),0);
},{offline:false}));
await check('Source, staged and query alias paths share one actual Supabase client/auth instance',()=>fixture(async({page})=>{
  await load(page);
  const identity=await page.evaluate(async()=>{
    const a=await import('/shared/supabase.js');const b=await import('/mobile/www/shared/supabase.js');const c=await import('/shared/supabase.js?alias=probe');
    return {same:a.supabase===b.supabase&&b.supabase===c.supabase,sameAuth:a.supabase.auth===c.supabase.auth,size:globalThis[Symbol.for('nova-shield.supabase.clients')].size,session:(await a.getSession()).session};
  });assert.deepEqual(identity,{same:true,sameAuth:true,size:1,session:null});
}));
await check('Public-site API keeps its anonymous SDK query behavior',()=>fixture(async({context,page})=>{
  await load(page);let calls=0;
  await context.route('https://*/rest/v1/services?**',route=>{calls++;const url=new URL(route.request().url());assert.equal(url.searchParams.get('active'),'eq.true');assert.equal(url.searchParams.get('parent_key'),'is.null');return route.fulfill({contentType:'application/json',body:JSON.stringify([{id:'public-fixture',key:'roof',name:'Roof'}])});});
  const result=await page.evaluate(async()=>{const api=await import('/site/js/lib/site-api.js');const rows=await api.listPublicServices();const again=await api.listPublicServices();return{rows,cached:rows===again};});
  assert.deepEqual(result,{rows:[{id:'public-fixture',key:'roof',name:'Roof'}],cached:true});assert.equal(calls,1);
}));
await check('The real SDK preserves authenticated getSession and admin RPC behavior',()=>fixture(async({context,page})=>{
  await context.route('https://*/auth/v1/user',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({id:'auth-fixture',aud:'authenticated',role:'authenticated',email:'staff@example.test'})}));
  let rpcCalls=0;
  await context.route('https://*/rest/v1/rpc/is_admin',route=>{
    rpcCalls++;assert.equal(route.request().method(),'POST');
    assert.ok(route.request().headers().authorization.startsWith('Bearer '));
    return route.fulfill({contentType:'application/json',body:'true'});
  });
  await load(page);
  const identity=await page.evaluate(async()=>{
    const module=await import('/shared/supabase.js');
    const encode=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:'auth-fixture',exp:Math.floor(Date.now()/1000)+3600})+'.fixture';
    const {error}=await module.supabase.auth.setSession({access_token:token,refresh_token:'fixture-refresh'});
    if(error)throw error;
    const session=await module.getSession();return{user:session.session.user.id,admin:session.isAdmin};
  });
  assert.deepEqual(identity,{user:'auth-fixture',admin:true});assert.equal(rpcCalls,1);
}));
await check('A failed access RPC with a saved session shows Retry rather than an authorization verdict',()=>fixture(async({context,page})=>{
  await context.route('https://*/auth/v1/user',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({id:'auth-fixture',aud:'authenticated',role:'authenticated'})}));
  await page.goto(BASE+'/mobile/www/admin/field.html');await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  await page.evaluate(async()=>{
    const module=await import('/mobile/www/shared/supabase.js');
    const encode=value=>btoa(JSON.stringify(value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:'auth-fixture',exp:Math.floor(Date.now()/1000)+3600})+'.fixture';
    const {error}=await module.supabase.auth.setSession({access_token:token,refresh_token:'fixture-refresh'});if(error)throw error;
  });
  await page.reload();await page.getByRole('heading',{name:'Could not load this screen'}).waitFor();
  assert.ok(!(await page.locator('#view').innerText()).includes('Account not authorised'));
  await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
},{offline:false}));
await check('All seven local lazy plugin graphs import with network blocked',()=>fixture(async({page,external})=>{
  await load(page);const plugins=await page.evaluate(async()=>{
    const names=['app','camera','filesystem','geolocation','haptics','share','status-bar'];
    for(const name of names) await import(`/mobile/www/shared/vendor/@capacitor/${name}/dist/esm/index.js`);
    return names.length;
  });assert.equal(plugins,7);assert.deepEqual(external,[]);
}));
await check('Native platform detection uses the locally packaged bridge',()=>fixture(async({page})=>{
  await load(page);assert.equal(await page.evaluate(async()=>(await import('/mobile/www/admin/js/lib/native.js')).isNative()),true);
},{native:true}));
await check('A missing module shows recovery; Retry reloads it and preserves full queued payloads',()=>fixture(async({context,page})=>{
  await load(page);await seed(page);const before=await snapshot(page);
  const pattern='**/mobile/www/shared/vendor/@capacitor/core/dist/index.js';
  await context.route(pattern,route=>route.fulfill({status:404,contentType:'text/plain',body:'missing'}));
  await page.reload();await page.getByRole('heading',{name:'Could not start Nova Shield'}).waitFor();
  assert.match(await page.locator('#view').innerText(),/An app file could not load/);assert.equal(await page.locator('#syncBadge').innerText(),'Startup unavailable');assert.deepEqual(await snapshot(page),before);
  await page.screenshot({path:evidence+'/missing-module-390.png',fullPage:true});
  await context.unroute(pattern);await retry(page);assert.deepEqual(await snapshot(page),before);
}));
await check('Missing bootstrap itself has a working fallback Retry',()=>fixture(async({context,page})=>{
  const pattern='**/mobile/www/admin/js/bootstrap.js';await context.route(pattern,route=>route.abort());
  await page.goto(BASE+'/mobile/www/admin/field.html');await page.getByRole('heading',{name:'An app file could not load'}).waitFor();
  await context.unroute(pattern);await retry(page);
}));
await check('Real outbox storage-open failure is recoverable without deleting records',()=>fixture(async({page})=>{
  await load(page);await seed(page);const before=await snapshot(page);
  await page.evaluate(()=>sessionStorage.setItem('inject-quota','yes'));await page.reload();
  await page.getByRole('heading',{name:'Could not start Nova Shield'}).waitFor();assert.match(await page.locator('#view').innerText(),/Local storage could not be opened/);
  await page.screenshot({path:evidence+'/storage-failure-390.png',fullPage:true});
  await page.evaluate(()=>sessionStorage.removeItem('inject-quota'));await retry(page);assert.deepEqual(await snapshot(page),before);
}));
await check('A device module initialization exception is identified and recoverable',()=>fixture(async({context,page})=>{
  await load(page);await seed(page);const before=await snapshot(page);
  const pattern='**/mobile/www/admin/js/lib/native.js';const source=readFileSync(new URL('../admin/js/lib/native.js',import.meta.url),'utf8');
  await context.route(pattern,route=>route.fulfill({contentType:'application/javascript',body:source+'\nthrow new Error("Capacitor plugin initialization injected failure");'}));
  await page.reload();await page.getByRole('heading',{name:'Could not start Nova Shield'}).waitFor();assert.match(await page.locator('#view').innerText(),/A device component could not start/);
  await context.unroute(pattern);await retry(page);assert.deepEqual(await snapshot(page),before);
}));
for(const width of [390,430]) for(const theme of ['light','dark']) {
  await check(`Offline startup at ${width}px ${theme} fits and exposes keyboard outbox access`,()=>fixture(async({page})=>{
    await load(page);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await seed(page);
    await page.locator('#syncBadge').focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');assert.equal(await page.locator('#syncBadge').evaluate(n=>n===document.activeElement),true);
    await page.screenshot({path:`${evidence}/offline-${width}-${theme}.png`,fullPage:true});
  },{width,theme}));
}
await check('Long section headers with a badge and action wrap at phone widths',()=>fixture(async({page})=>{
  await load(page);
  await page.evaluate(()=>{
    const card=document.createElement('section');card.className='section-box';
    card.innerHTML='<div class="section-box__head"><h3>Permanent lighting installation materials</h3><span class="badge">Awaiting stock reconciliation</span><button class="btn">Prepare vehicle</button></div>';
    document.getElementById('view').append(card);
  });
  const widths=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(widths.document<=widths.viewport,JSON.stringify(widths));
  await page.screenshot({path:evidence+'/section-header-390.png',fullPage:true});
}));
await browser.close();

console.log(`\n${results.filter(r=>r.ok).length}/${results.length} passed`);
if(results.some(r=>!r.ok))process.exitCode=1;
