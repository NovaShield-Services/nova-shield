import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
export const BASE = 'http://localhost:8743';
export const JOB = '11111111-1111-4111-8111-111111111111';
export const SECOND = '22222222-2222-4222-8222-222222222222';
export const OWNER = 'offline-staff-a';
export const apiSource = `
  async function call(name,args) {
    const r=await fetch('/__offline_fixture/'+name,{method:'POST',body:JSON.stringify(args.map(value=>value instanceof Blob?{name:value.name,type:value.type,size:value.size}:value))});
    const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.message),{status:r.status,code:data.code});return data;
  }
  ${['getJob','listServices','listModifiers','listSiteFactors','listInspectionFlags','listServiceFlagMap','getSettings',
    'listPricingRules','listSections','listMeasurements','listJobFlags','calculatePricing','listQuotes',
    'listAttachments','listNotes','listTodaysVisits','listUpcomingVisits','updateProperty','createMeasurement',
    'uploadJobPhoto','uploadSignature','saveQuoteSignature','updateJob','completeJob','createSection','updateSection',
    'deleteSection','updateMeasurement','deleteMeasurement','addMeasurementAddon','deleteMeasurementAddon',
    'setMeasurementModifier','addNote','deleteAttachment'].map(name=>`export const ${name}=(...args)=>call('${name}',args);`).join('\n')}
  export const signedPhotoUrl=async()=>'';
`;
const authSource = `
  const callbacks=[];
  const session=()=>localStorage.getItem('fixture-owner')?{user:{id:localStorage.getItem('fixture-owner')}}:null;
  window.__switchAccount=id=>{localStorage.setItem('fixture-owner',id||'');callbacks.forEach(cb=>cb(id?'SIGNED_IN':'SIGNED_OUT',session()));};
  export const supabase={auth:{getSession:async()=>({data:{session:session()}}),
    signOut:async()=>window.__logoutError?{error:new Error('Injected logout failed')}:__switchAccount(null),onAuthStateChange:cb=>{callbacks.push(cb);cb('INITIAL_SESSION',session());return {data:{subscription:{unsubscribe(){}}}};}}};
  export async function getSession(){if(localStorage.getItem('fixture-offline')==='yes')throw new TypeError('Failed to fetch');return {session:session(),isAdmin:!!session()};}
`;

export async function offlineFixture(browser, {width=390, jobs=2, open=true, persistentContext=null, realAuth=false}={}) {
  const context = persistentContext || await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  const errors=[];
  const state={offline:false, denied:false, fail:{}, lost:null, hold:null, calls:[], writes:[], extraPassport:{}};
  const makeJob=id=>({id,status:'in_progress',scheduled_for:new Date().toISOString(),
    customers:{name:id===JOB?'Saved Customer A':'Saved Customer B',phone:'5550100'},
    properties:{id:'property-'+id,address_line1:'123 Saved Street',city:'Test City',passport:{
      access:{water_tap_location:'Rear tap'},preferences:'Close the gate',...state.extraPassport}}});
  state.jobIds=Array.from({length:jobs},(_,i)=>i===0?JOB:i===1?SECOND:'33333333-3333-4333-8333-'+String(i).padStart(12,'0'));
  await context.addInitScript(owner=>{
    if(localStorage.getItem('fixture-owner')===null)localStorage.setItem('fixture-owner',owner);
    Object.defineProperty(navigator,'onLine',{get:()=>localStorage.getItem('fixture-offline')!=='yes'});
    if(localStorage.getItem('fixture-storage-fail')==='yes')indexedDB.open=()=>{throw new DOMException('Injected storage failure','QuotaExceededError');};
  },OWNER);
  await context.route('**/*',route=>new URL(route.request().url()).origin===BASE?route.continue():route.abort('internetdisconnected'));
  if (!realAuth) await context.route('**/shared/supabase.js',route=>route.fulfill({contentType:'application/javascript',body:authSource}));
  else await context.route('https://*/rest/v1/rpc/is_admin',route=>state.offline ? route.abort('internetdisconnected') : route.fulfill({contentType:'application/json',body:'true'}));
  await context.route('**/admin/js/lib/api.js',route=>route.fulfill({contentType:'application/javascript',body:apiSource}));
  if (process.env.OFFLINE_BASELINE === '1') {
    for (const file of ['admin/js/field.js','admin/js/views/field-schedule.js','admin/js/views/field-workspace.js',
      'admin/js/views/field-photos.js','admin/js/lib/offline-queue.js']) {
      const body=execFileSync('git',['show',`1e320a6:${file}`],{encoding:'utf8'});
      await context.route(`**/${file}`,route=>route.fulfill({contentType:'application/javascript',body}));
    }
  }
  if (process.env.OFFLINE_BREAK === 'owner') {
    const body=readFileSync(new URL('../admin/js/lib/offline-queue.js',import.meta.url),'utf8')
      .replace('.filter(i => !i.ownerId || i.ownerId === owner)', '');
    await context.route('**/admin/js/lib/offline-queue.js',route=>route.fulfill({contentType:'application/javascript',body}));
  }
  await context.route('**/shared/vendor/@capacitor/geolocation/dist/esm/index.js',route=>route.fulfill({contentType:'application/javascript',body:'export const Geolocation={getCurrentPosition:async()=>{throw new Error("No GPS fixture");}};'}));
  await context.route('**/__offline_fixture/*',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    const args=JSON.parse(route.request().postData()||'[]');state.calls.push({name,args});
    if(state.offline)return route.abort('internetdisconnected');
    if(state.denied&&name==='getJob')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Permission denied: assignment revoked',code:'42501'})});
    if(state.fail[name])return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:state.fail[name]})});
    let result=[];
    if(name==='getJob')result=makeJob(args[0]);
    if(name==='listTodaysVisits')result=state.jobIds.map(makeJob);
    if(name==='getSettings')result={company:{website:'https://example.test'}};
    if(name==='listServices')result=[{id:'service-1',key:'test_service',name:'Saved service',unit:'linear_ft',quotable:true}];
    if(name==='listMeasurements')result=[{id:'measurement-1',service_id:'service-1',quantity:7,unit:'linear_ft',label:'Front area',measurement_modifiers:[],job_measurement_addons:[]}];
    if(name==='listNotes')result=[{id:'note-1',body:'Watch the garden hose',visibility:'internal'}];
    if(name==='listQuotes')result=[{id:'quote-1',version:1,status:state.signature?'accepted':'draft',signature_url:state.signature?.path,signed_by_name:state.signature?.name}];
    if(name==='uploadSignature')result='saved/signature.png';
    if(!name.startsWith('list')&&!['getJob','getSettings','calculatePricing'].includes(name)){
      state.writes.push({name,args});if(name==='updateProperty')state.extraPassport=args[1].passport||state.extraPassport;
      state.onWrite?.({name,args});
      if(name==='saveQuoteSignature')state.signature={path:args[1],name:args[2]};
    }
    if(state.hold===name){await new Promise(resolve=>state.release=resolve);}
    if(state.lost===name)return route.abort('internetdisconnected');
    return route.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
  });
  const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
  if(open){await page.goto(BASE+'/admin/field.html');await page.getByRole('heading',{name:"Today's schedule"}).waitFor();}
  async function prepare(){await page.getByRole('button',{name:'Save work for offline',exact:true}).click();await page.getByText(/visits saved for offline reading for 24 hours/).waitFor();}
  async function offline(value=true){state.offline=value;await page.evaluate(value=>{localStorage.setItem('fixture-offline',value?'yes':'no');},value);}
  async function visit(){await page.evaluate(id=>location.hash='/visit/'+id,JOB);await page.getByRole('heading',{name:'Saved Customer A',exact:true,level:1}).waitFor();}
  return {context,page,state,errors,prepare,offline,visit};
}
