import {execFileSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const path='/tmp/nexus-step8-developer-lookup-20261018.json'
const stage=process.env.LOOKUP_ACCEPTANCE_STAGE||'prepare'
const key='step8-read-d3e8-20261018',name='step8-json-lookup-20261018-d3e8'
const raw=execFileSync('agent-browser',['--session','nf-step8-read','eval','localStorage.getItem("__convexAuthJWT_httpsquickrabbit810euwest1convexcloud")'],{encoding:'utf8'})
const token=raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
if(!token)throw new Error('Fresh genuine controlled Testing session required')
async function call(kind,path,args){
 const response=await fetch('https://quick-rabbit-810.eu-west-1.convex.cloud/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path,args,format:'json'}),signal:AbortSignal.timeout(25000)})
 const payload=await response.json()
 if(!response.ok||payload.status!=='success'){
  const error=new Error('Controlled API request failed')
  error.permissionDenied=payload.status==='error'&&(payload.errorData==='External execution permission denied'||/External execution permission denied/.test(payload.errorMessage||''))
  throw error
 }
 return payload.value
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function billing(){const b=await call('query','billing:mine',{});if(b.mode!=='test')throw new Error('Testing mode required');return digest([b.account,b.usage])}
let report=stage==='prepare'?{version:'step8-developer-lookup-v1',environment:'Testing',observedAt:new Date().toISOString(),passed:false}:JSON.parse(await readFile(path,'utf8'))
try{
 if(stage==='prepare'){
  const before=await call('query','frontierControls:overview',{}),adapters=await call('query','externalRuntime:list',{}),jobs=await call('query','runtimeReceipts:activeList',{})
  if(before.packages.length>=100||adapters.length>=100||before.packages.some(p=>p.name===name)||jobs.some(j=>j.requestKey===key))throw new Error('Fresh fixture scope not established')
  report.billingBefore=await billing()
  const packageId=await call('mutation','frontierControls:registerPackage',{name,version:'1.0.0',description:'Controlled public HTTPBin GET contract; no credentials or private mission data',inputFields:['query'],outputFields:['args','headers','origin','url']})
  report.packageId=packageId
  await call('mutation','frontierControls:validatePackage',{packageId,input:'{"query":"controlled"}',output:'{"args":{},"headers":{},"origin":"controlled","url":"https://httpbin.org/get"}'})
  const adapterId=await call('mutation','externalRuntime:register',{packageId,endpoint:'https://httpbin.org/get'})
  report={...report,adapterId,requestKey:key,input:'{"query":"Step 8 controlled payload d3e8"}',prepared:true}
 }else if(stage==='inspect'){
  const rows=(await call('query','runtimeReceipts:activeList',{})).filter(j=>j.requestKey===key)
  if(rows.length!==1||rows[0].status!=='complete')throw new Error('Expected one completed receipt; inspect before any new request')
  const receipt=rows[0],result=JSON.parse(receipt.result)
  const headerKeys=Object.keys(result.output.headers).map(k=>k.toLowerCase())
  report={...report,jobId:receipt._id,receiptDigest:digest(receipt),resultSha256:digest(receipt.result),exactQuery:result.output.args.query===JSON.stringify('Step 8 controlled payload d3e8'),credentialHeadersAbsent:!headerKeys.includes('authorization')&&!headerKeys.includes('cookie'),untrustedLabel:result.trust==='Untrusted external JSON; never executed as code or instructions',inspected:true}
 }else if(stage==='final'){
  if(!report.inspected)throw new Error('Inspect phase required')
  const rows=(await call('query','runtimeReceipts:activeList',{})).filter(j=>j.requestKey===key)
  report.identicalReceiptAfterReplay=rows.length===1&&rows[0]._id===report.jobId&&digest(rows[0])===report.receiptDigest
  const adapter=(await call('query','externalRuntime:list',{})).find(a=>a._id===report.adapterId)
  report.adapterRevoked=adapter?.enabled===false
  try{await call('action','externalRuntime:run',{adapterId:report.adapterId,requestKey:key,input:report.input});report.revokedExecutionDenied=false}
  catch(error){if(!error.permissionDenied)throw error;report.revokedExecutionDenied=true}
  report.billingUnchanged=report.billingBefore===await billing()
  report.passed=['exactQuery','credentialHeadersAbsent','untrustedLabel','identicalReceiptAfterReplay','adapterRevoked','revokedExecutionDenied','billingUnchanged'].every(k=>report[k]===true)
  if(report.passed)delete report.error
 }else throw new Error('Unknown acceptance stage')
}catch{report.error='Controlled acceptance incomplete; inspect retained IDs and receipt before further mutation. No automatic action retry.'}
await writeFile(path,JSON.stringify(report,null,2),{mode:0o600})
console.log(JSON.stringify(report));if(report.error||stage==='final'&&!report.passed)process.exitCode=1
