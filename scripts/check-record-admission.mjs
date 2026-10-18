import {execFileSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const session='nf-step12-resource',path='/tmp/nexus-step12-resource-20261018.json',prefix='step12-resource-20261018-d7c4',phase=process.argv[2]
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const raw=execFileSync('agent-browser',['--session',session,'eval','localStorage.getItem("__convexAuthJWT_httpsquickrabbit810euwest1convexcloud")'],{encoding:'utf8'})
const token=raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
if(!token)throw Error('Genuine controlled Testing session required')
async function call(kind,name,args){
 const response=await fetch('https://quick-rabbit-810.eu-west-1.convex.cloud/api/'+kind,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path:name,args,format:'json'}),signal:AbortSignal.timeout(15000)})
 const p=await response.json()
 if(!response.ok||p.status!=='success'){const error=new Error('Controlled operation did not confirm');error.reason=typeof p.errorData==='string'?p.errorData:p.errorMessage;throw error}
 return p.value
}
async function denied(operation,pattern){try{await operation();throw Error('Expected rejection')}catch(e){if(pattern.test(e.reason??''))return true;throw e}}
async function rows(name){const r=await call('query',name,{paginationOpts:{numItems:100,cursor:null},...(name==='missions:list'?{ownerKey:'ignored'}:{})});if(!r.isDone)throw Error('Complete fixture scope required');return r.page}
if(phase==='prepare'){
 const report={version:'step12-resource-admission-v1',environment:'Testing',observedAt:new Date().toISOString(),passed:false}
 await writeFile(path,JSON.stringify(report),{flag:'wx',mode:0o600})
 try{
  const billing=await call('query','billing:mine',{}),missions=await rows('missions:list'),memories=await rows('memory:list'),overview=await call('query','frontierControls:overview',{})
  if(billing.mode!=='test'||missions.length||memories.length||overview.policy.maxMissions!==1||overview.policy.maxManualSaves!==1||overview.policy.maxRecords!==100)throw Error('Fresh empty account and independently saved UI limits required')
  report.billingBefore=hash(billing)
  const catalog=await call('query','resourceCapacity:catalog',{})
  if(catalog.collections.length!==13||catalog.scopedLimits.length!==5)throw Error('Capacity catalog incomplete')
  const attempt=async(index)=>{
   try{return{ok:true,id:await call('mutation','missions:create',{ownerKey:'forged-other-owner',title:prefix+' mission '+index,mission:'Controlled resource admission fixture. Do not run AI, deliver or contact anyone.',autonomy:'Draft only',budget:0})}}catch(e){if(/Mission record limit/.test(e.reason??''))return{ok:false,quota:true};throw e}
  }
  const results=await Promise.all([attempt(1),attempt(2)])
  if(results.filter(r=>r.ok).length!==1||results.filter(r=>r.quota).length!==1)throw Error('Concurrent mission cap failed')
  report.missionId=results.find(r=>r.ok).id
  const mission=await call('query','missions:getById',{id:report.missionId})
  if(mission.ownerKey==='forged-other-owner')throw Error('Caller owner key was trusted')
  report.missionHash=hash(mission);report.callerOwnerKeyIgnored=true;report.concurrentMissionAdmission=true
  const note={missionId:report.missionId,ownerKey:'forged-other-owner',category:'workload-fixture',key:prefix+' note',value:'Controlled manual note; no customer outcome or generated evidence.',confidence:0,source:'controlled-step12-resource'}
  report.oversizeRejected=await denied(()=>call('mutation','memory:remember',{...note,value:'😀'.repeat(16385)}),/UTF-8 bytes/)
  const save=async index=>{try{return{ok:true,id:await call('mutation','memory:remember',{...note,key:note.key+' '+index})}}catch(e){if(/Manual memory admission limit/.test(e.reason??''))return{ok:false,quota:true};throw e}}
  const saves=await Promise.all([save(1),save(2)])
  if(saves.filter(r=>r.ok).length!==1||saves.filter(r=>r.quota).length!==1)throw Error('Concurrent manual cap failed')
  report.memoryId=saves.find(r=>r.ok).id;report.concurrentManualAdmission=true
  const saved=(await rows('memory:list')).find(r=>r._id===report.memoryId)
  if(!saved||saved.ownerKey!==mission.ownerKey||saved.missionId!==report.missionId)throw Error('Manual ownership binding failed')
  report.memoryHash=hash(saved)
  report.alternatePortfolioBlocked=await denied(()=>call('mutation','portfolio:createRecommendedMission',{ownerKey:'forged-other-owner',title:prefix+' blocked portfolio',mission:'No new mission should be admitted.'}),/Mission record limit/)
  await call('mutation','frontierControls:setPolicy',{maxRecords:100,maxMediaBytes:overview.policy.maxMediaBytes})
  const afterPolicy=await call('query','frontierControls:overview',{})
  if(afterPolicy.policy.maxMissions!==1||afterPolicy.policy.maxManualSaves!==1||hash(afterPolicy.audit)!==hash(overview.audit))throw Error('Legacy/no-op policy save changed independent limits or audit history')
  report.legacyPolicyCompatible=true;report.noOpAuditUnchanged=true;report.catalog=catalog
  report.prepared=true
 }catch{report.failed=true;await writeFile(path,JSON.stringify(report,null,2),{mode:0o600});throw Error('Controlled admission did not confirm; do not retry mutations')}
 await writeFile(path,JSON.stringify(report,null,2),{mode:0o600})
 console.log(JSON.stringify({prepared:true,missionId:report.missionId,memoryId:report.memoryId,concurrentMissionAdmission:true,concurrentManualAdmission:true,oversizeRejected:true,alternatePortfolioBlocked:true,legacyPolicyCompatible:true}))
}else if(phase==='final'){
 const r=JSON.parse(await readFile(path,'utf8'))
 if(!r.prepared||r.failed)throw Error('Prepared fixture required')
 const missions=await rows('missions:list'),memories=await rows('memory:list'),billing=await call('query','billing:mine',{})
 if(missions.length!==1||memories.length!==1||hash(missions[0])!==r.missionHash||hash(memories[0])!==r.memoryHash||hash(billing)!==r.billingBefore)throw Error('Retained records or billing changed')
 r.rows=await Promise.all(r.catalog.collections.map(({id})=>call('query','resourceCapacity:collection',{id})))
 for(const id of ['missions','manual-memory']){const row=r.rows.find(row=>row.id===id);if(row.count!==1||row.limit!==1||!row.blocked)throw Error('Quota count mismatch')}
 r.recordsUnchangedAfterRejections=true;r.billingUnchanged=true;r.noInference=true;r.passed=true
 await writeFile(path,JSON.stringify(r,null,2),{mode:0o600})
 console.log(JSON.stringify({passed:true,recordsUnchangedAfterRejections:true,billingUnchanged:true,capacityRows:r.rows.length}))
}else throw Error('Expected prepare or final')
