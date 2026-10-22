import {execFileSync} from 'node:child_process'
import {readFile,writeFile,rename,chmod} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
import {validateMixedProfile,assessMixed,runMixedLane} from './mixed-workload-core.mjs'
const p=validateMixedProfile(JSON.parse(await readFile('docs/workload-profiles/mixed-two-user-testing.json','utf8')))
const output='/tmp/nexus-step11-mixed-20261018.json'
const report={version:p.version,profile:p,state:'preflight',startedAt:new Date().toISOString(),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),distinctUsers:0,activeSpanMs:0,stopped:false,samples:[],users:[],invariants:{},passed:false}
await writeFile(output,JSON.stringify(report,null,2),{flag:'wx',mode:0o600})
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
let stopped=false,start=0,saveQueue=Promise.resolve()
function stop(){stopped=true;report.stopped=true}
function save(){
 const snapshot=JSON.stringify({...report,progress:{read:report.samples.filter(s=>s.kind==='read').length,write:report.samples.filter(s=>s.kind==='write').length,inference:report.samples.filter(s=>s.kind==='inference').length}},null,2)
 saveQueue=saveQueue.then(async()=>{await writeFile(output+'.next',snapshot,{mode:0o600});await rename(output+'.next',output);await chmod(output,0o600)})
 return saveQueue
}
const users=[]
async function request(user,kind,path,args){
 const response=await fetch(p.backendOrigin+'/api/'+kind,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+user.token},body:JSON.stringify({path,args,format:'json'}),signal:AbortSignal.timeout(kind==='action'?p.inferenceTimeoutMs:p.readTimeoutMs)})
 const text=await response.text()
 if(Buffer.byteLength(text)>2*1024*1024)throw Error('Bounded response exceeded')
 const payload=JSON.parse(text)
 if(!response.ok||payload.status!=='success'){
  const e=new Error('Controlled API operation did not confirm: '+path)
  e.denied=typeof payload.errorData==='string'&&/Mission not found or access denied/.test(payload.errorData)
  throw e
 }
 return payload.value
}
async function all(user,path,args={}){
 const result=await request(user,'query',path,{...args,paginationOpts:{numItems:100,cursor:null}})
 if(!result.isDone)throw Error('Complete bounded baseline required: '+path)
 return result.page
}
async function denyForeign(user,id){
 try{await request(user,'query','missions:getById',{id});throw Error('Foreign mission was exposed')}catch(e){if(!e.denied)throw e}
}
async function observed(user,kind,operation){
 if(stopped)throw Error('Run stopped')
 const at=performance.now()-start
 try{
  const result=await operation()
  report.samples.push({user:user.index,kind,ok:true,atMs:Math.round(at),ms:Math.round(performance.now()-start-at)})
  return result
 }catch{
  report.samples.push({user:user.index,kind,ok:false,atMs:Math.round(at),ms:Math.round(performance.now()-start-at)})
  stop();throw Error('Operation unconfirmed; no retry: '+kind)
 }
}
async function waitUntil(offset){
 while(!stopped&&performance.now()-start<offset)await new Promise(r=>setTimeout(r,Math.min(1000,offset-(performance.now()-start))))
}
try{
 for(const [index,session] of ['nf-step11-alpha','nf-step11-beta'].entries()){
  const raw=execFileSync('agent-browser',['--session',session,'eval','localStorage.getItem("__convexAuthJWT_httpsquickrabbit810euwest1convexcloud")'],{encoding:'utf8'})
  const token=raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
  if(!token)throw Error('Genuine independent Testing sessions required')
  const user={index,token,notes:[],intentIds:[]}
  user.bill=await request(user,'query','billing:mine',{})
  const b=user.bill
  if(b.mode!=='test'||!b.account||b.account.prepaid<300||b.account.included!==0||b.account.held!==0||b.account.unresolved!==0||b.account.frozen)throw Error('Verified settled test funding required')
  user.missions=await all(user,'missions:list',{ownerKey:'local-workspace'})
  user.memories=await all(user,'memory:list')
  user.ledger=await all(user,'providerUsage:history')
  const title=p.fixturePrefix+' user '+index
  if(user.missions.some(m=>m.title===title)||user.memories.some(m=>m.key.startsWith(p.fixturePrefix)))throw Error('Fresh absent fixture scope required')
  // Only this verified-absent draft is created; existing mission records remain untouched.
  user.missionId=await request(user,'mutation','missions:create',{title,mission:'Controlled mixed workload fixture. Local-only synthetic notes and planning. Do not deploy, send messages or execute business work.',autonomy:'Draft only',budget:0,ownerKey:'local-workspace'})
  user.mission=await request(user,'query','missions:getById',{id:user.missionId})
  users.push(user)
  report.users.push({index,missionId:user.missionId,existingMissions:user.missions.length,existingMemories:user.memories.length,existingInvocations:user.ledger.length,beforePrepaidCents:b.account.prepaid,paidTestReceiptCount:b.receipts.length})
 }
 if(users[0].mission.ownerKey===users[1].mission.ownerKey)throw Error('Distinct server-confirmed users required')
 report.distinctUsers=2
 await Promise.all(users.map((u,i)=>denyForeign(u,users[1-i].missionId)))
 report.state='running';start=performance.now();await save()
 console.log(JSON.stringify({state:'running',users:2,workers:4,expectedReads:720,expectedWrites:80,expectedInference:6,minimumSpanMs:595000}))
 const lanes=users.flatMap(user=>[
  runMixedLane({iterations:p.iterations,waitFor:i=>waitUntil(i*p.intervalMs),stopped:()=>stopped,stop,perform:async i=>{
   const mission=await observed(user,'read',()=>request(user,'query','missions:selection',{id:user.missionId}))
   if(mission?._id!==user.missionId||mission.ownerKey!==user.mission.ownerKey)throw Error('Selection isolation failed')
   await observed(user,'read',()=>request(user,'query','providerUsage:history',{paginationOpts:{numItems:5,cursor:null}}))
   await observed(user,'read',()=>request(user,'query','memory:list',{paginationOpts:{numItems:5,cursor:null}}))
   if(i%p.writeEvery===0){
    const key=p.fixturePrefix+'-u'+user.index+'-tick'+i,value=JSON.stringify({fixture:true,user:user.index,tick:i,scope:'Synthetic workload observation; no customer outcome'})
    const id=await observed(user,'write',()=>request(user,'mutation','memory:remember',{missionId:user.missionId,category:'workload-fixture',key,value,confidence:0,source:'controlled-step11-load'}))
    user.notes.push({id,key,value})
   }
   await save()
  }}),
  runMixedLane({iterations:p.inferenceOffsetsMs.length,waitFor:i=>waitUntil(p.inferenceOffsetsMs[i]),stopped:()=>stopped,stop,perform:async i=>{
   const result=await observed(user,'inference',()=>request(user,'action','intelligenceOrchestrator:compileIntent',{intent:p.fixturePrefix+' user '+user.index+' pulse '+i+': propose a small local-only '+['quantity calculator','weekly checklist','menu filter'][i]+' for a fictional bakery. This is a controlled unverified draft. No external service, deployment, messages or actual customer outcome.',domain:'Controlled software workload',budget:1,horizon:'One day'}))
   if(!result.saved||!result.sourceMemoryId||result.specification.strategies.length<2)throw Error('Saved intent result missing')
   user.intentIds.push(result.sourceMemoryId)
   await save()
  }})
 ])
 await Promise.all(lanes)
 report.state=stopped?'stopped':'verifying'
 const at=report.samples.map(s=>s.atMs)
 report.activeSpanMs=at.length?Math.max(...at)-Math.min(...at):0
 await save()
 let unchanged=true,writes=true,inference=true,billing=true
 for(const user of users){
  const missions=await all(user,'missions:list',{ownerKey:'local-workspace'}),memories=await all(user,'memory:list'),ledger=await all(user,'providerUsage:history'),bill=await request(user,'query','billing:mine',{})
  const same=(old,rows)=>old.every(row=>hash(rows.find(x=>x._id===row._id))===hash(row))
  unchanged=unchanged&&same(user.missions,missions)&&same(user.memories,memories)&&same(user.ledger,ledger)&&hash(missions.find(m=>m._id===user.missionId))===hash(user.mission)
  writes=writes&&user.notes.length===40&&user.notes.every(note=>memories.some(row=>row._id===note.id&&row.key===note.key&&row.value===note.value&&row.missionId===user.missionId&&row.ownerKey===user.mission.ownerKey))&&memories.filter(row=>row.category==='workload-fixture'&&row.key.startsWith(p.fixturePrefix)).length===40
  const fresh=ledger.filter(row=>!user.ledger.some(old=>old._id===row._id))
  inference=inference&&fresh.length===3&&fresh.every(row=>row.stage==='intent-compile'&&row.outcome==='succeeded'&&row.usageStatus==='recorded'&&row.reports.length>0)&&user.intentIds.length===3&&user.intentIds.every(id=>memories.some(row=>row._id===id&&row.ownerKey===user.mission.ownerKey&&row.category==='intent-specification'))
  const holds=bill.usage.filter(row=>!user.bill.usage.some(old=>old._id===row._id)),charged=holds.reduce((sum,row)=>sum+(row.charged??0),0)
  billing=billing&&bill.mode==='test'&&bill.account.held===0&&bill.account.unresolved===0&&!bill.account.frozen&&holds.length===3&&holds.every(row=>row.status==='settled'&&fresh.some(inv=>inv._id===row.invocationId))&&charged<=p.maxInferenceChargeCentsPerUser&&user.bill.account.prepaid-bill.account.prepaid===charged&&hash(bill.receipts)===hash(user.bill.receipts)&&same(user.bill.usage,bill.usage)
  report.users[user.index]={...report.users[user.index],notes:user.notes.map(n=>({id:n.id,key:n.key})),intentIds:user.intentIds,invocations:fresh.map(row=>({id:row._id,stage:row.stage,outcome:row.outcome,usageStatus:row.usageStatus,reports:row.reports.map(r=>({provider:r.provider,model:r.model,promptTokens:r.promptTokens,completionTokens:r.completionTokens,totalTokens:r.totalTokens}))})),afterPrepaidCents:bill.account.prepaid,chargedCents:charged,heldCents:bill.account.held,unresolved:bill.account.unresolved}
 }
 await Promise.all(users.map((u,i)=>denyForeign(u,users[1-i].missionId)))
 report.invariants={existingRecordsUnchanged:unchanged,exactOwnedWrites:writes,exactInferenceReceipts:inference,billingConserved:billing,ownershipDenied:true}
 report.summary=assessMixed(p,report);report.passed=report.summary.passed;report.state=report.passed?'complete':'failed';report.finishedAt=new Date().toISOString();report.durationMs=Math.round(performance.now()-start)
 await save()
 console.log(JSON.stringify({state:report.state,summary:report.summary,invariants:report.invariants,users:report.users.map(u=>({index:u.index,chargedCents:u.chargedCents,heldCents:u.heldCents,unresolved:u.unresolved}))}))
 if(!report.passed)process.exitCode=1
}catch{
 stop();report.state='failed';report.finishedAt=new Date().toISOString();report.summary=assessMixed(p,report);report.passed=false
 await save()
 console.error('Mixed workload did not confirm acceptance. No uncertain action or mutation was retried. Inspect the retained report and owned ledgers; do not restart this fixture.')
 process.exitCode=1
}
