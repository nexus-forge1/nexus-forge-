import {execFileSync} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const session='nf-step12-complete',reportPath='/tmp/step12-complete-deployed.json'
const raw=execFileSync('agent-browser',['--session',session,'eval','localStorage.getItem("__convexAuthJWT_httpsquickrabbit810euwest1convexcloud")'],{encoding:'utf8'})
const jwt=raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
if(!jwt)throw Error('Genuine Testing operator required')
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function request(kind,path,args,authorized=true){
 const r=await fetch('https://quick-rabbit-810.eu-west-1.convex.cloud/api/'+kind,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer '+jwt}:{})},body:JSON.stringify({path,args,format:'json'})})
 return r.json()
}
async function call(kind,path,args){const r=await request(kind,path,args);if(r.status!=='success')throw Error('Controlled operation not confirmed: '+path);return r.value}
const report={version:'step12-complete-deployed-v1',observedAt:new Date().toISOString(),environment:'Testing',passed:false}
await writeFile(reportPath,JSON.stringify(report),{flag:'wx',mode:0o600})
try{
 const initial=await call('query','missions:list',{ownerKey:'ignored',paginationOpts:{numItems:50,cursor:null}}),billing=await call('query','billing:mine',{})
 if(initial.page.length||!initial.isDone||billing.mode!=='test')throw Error('Fresh empty Testing operator required')
 report.billingBefore=hash(billing)
 report.missionId=await call('mutation','missions:create',{ownerKey:'ignored',title:'step12-complete-20261018-j3v9',mission:'Controlled evidence admission fixtures only. No inference, external writes, approval, actual customer observation or billing claim.',autonomy:'governed',budget:0})
 const research={missionId:report.missionId,query:'Controlled review fixture',result:'Synthetic evidence for duplicate-save verification only.',citations:['https://example.com/']}
 const sources=await Promise.all([call('mutation','researchData:save',research),call('mutation','researchData:save',research)])
 if(sources[0]!==sources[1])throw Error('Research retry duplicated evidence')
 const cost={missionId:report.missionId,actualCost:0,evidence:'Synthetic zero-cost fixture; no provider invoice or inference'}
 const costs=await Promise.all([call('mutation','verification:recordRuntimeCost',cost),call('mutation','verification:recordRuntimeCost',cost)])
 if(costs[0]!==costs[1])throw Error('Cost retry duplicated evidence')
 const now=Date.now(),product={missionId:report.missionId,metric:'active-users',observed:0,target:1,sampleSize:1,periodStart:now-10000,periodEnd:now-1,method:'Synthetic product measurement fixture; no real users measured.',evidence:['Controlled Step 12 admission fixture only'],notes:'Negative synthetic observation, not actual customer evidence.'}
 const products=await Promise.all([call('mutation','verification:recordProductOutcome',product),call('mutation','verification:recordProductOutcome',product)])
 if(products[0]!==products[1])throw Error('Product retry duplicated evidence')
 const oversized=await request('mutation','researchData:save',{...research,result:'🙂'.repeat(20000)})
 if(oversized.status!=='error')throw Error('Oversized UTF-8 save unexpectedly accepted')
 const page=await call('query','verification:productOutcomesV2',{missionId:report.missionId,paginationOpts:{numItems:10,cursor:null}})
 const measurements=await call('query','verification:measurements',{missionId:report.missionId})
 if(page.page.length!==1||page.page[0].targetMet!==false||measurements.length!==1)throw Error('Retained evidence counts or negative finding changed')
 const invalid=await request('query','verification:productOutcomesV2',{paginationOpts:{numItems:1000,cursor:null}})
 const anon=await request('query','verification:productOutcomesV2',{paginationOpts:{numItems:10,cursor:null}},false)
 if(invalid.status!=='error'||anon.status!=='error')throw Error('Page/auth guard unexpectedly accepted')
 report.billingAfter=hash(await call('query','billing:mine',{}))
 if(report.billingBefore!==report.billingAfter)throw Error('Billing changed during evidence-only acceptance')
 Object.assign(report,{passed:true,researchReplay:true,costReplay:true,productReplay:true,negativeObservationRetained:true,oversizedUtf8Denied:true,invalidPageDenied:true,anonymousDenied:true,billingUnchanged:true,inference:false,dispatch:false,checkout:false})
 await writeFile(reportPath,JSON.stringify(report,null,2),{mode:0o600})
 console.log(JSON.stringify(report))
}catch(e){await writeFile(reportPath,JSON.stringify({...report,error:e.message},null,2),{mode:0o600});throw e}
