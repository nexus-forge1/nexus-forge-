import{execFileSync}from'node:child_process'
import{readFile,writeFile}from'node:fs/promises'
import{createHash}from'node:crypto'
const session='nf-step12-cleanup',path='/tmp/nexus-step12-cleanup-20261018.json',prefix='step12-cleanup-20261018-f3b8',phase=process.argv[2]
const raw=execFileSync('agent-browser',['--session',session,'eval','localStorage.getItem("__convexAuthJWT_httpsquickrabbit810euwest1convexcloud")'],{encoding:'utf8'})
const jwt=raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
if(!jwt)throw Error('Genuine controlled Testing session required')
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function call(kind,name,args){
 const response=await fetch('https://quick-rabbit-810.eu-west-1.convex.cloud/api/'+kind,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify({path:name,args,format:'json'}),signal:AbortSignal.timeout(15000)})
 const p=await response.json()
 if(!response.ok||p.status!=='success')throw Error('Controlled operation was not confirmed: '+name)
 return p.value
}
if(phase==='prepare'){
 const report={version:'step12-deployed-cleanup-v1',environment:'Testing',prefix,observedAt:new Date().toISOString(),passed:false}
 await writeFile(path,JSON.stringify(report),{flag:'wx',mode:0o600})
 try{
  const billing=await call('query','billing:mine',{}),missions=await call('query','missions:list',{ownerKey:'ignored',paginationOpts:{numItems:100,cursor:null}})
  if(billing.mode!=='test'||missions.page.length||!missions.isDone)throw Error('Fresh empty test operator required')
  report.billingBefore=hash(billing)
  report.missionId=await call('mutation','missions:create',{ownerKey:'ignored',title:prefix,mission:'Verify owned held-resource cleanup and history controls without provider inference or external delivery.',autonomy:'governed',budget:0})
  await call('mutation','missions:approve',{id:report.missionId,approved:true})
  report.resourceIds=[]
  for(let i=0;i<3;i++)report.resourceIds.push(await call('mutation','orchestration:setResource',{missionId:report.missionId,resourceKey:prefix+'-'+i,mode:'shared'}))
  const held=await call('mutation','orchestration:acquireForExecution',{missionId:report.missionId})
  if(!held.acquired)throw Error('Controlled reservation acquisition did not confirm')
  const resources=await call('query','orchestration:listResourcesPage',{missionId:report.missionId,paginationOpts:{numItems:20,cursor:null}})
  if(resources.page.length!==3||resources.page.some(r=>r.status!=='held'))throw Error('Exactly three held fixture reservations required')
  report.heldBefore=hash(resources.page)
  report.prepared=true
  await writeFile(path,JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify({prepared:true,missionId:report.missionId,held:3,noInference:true}))
 }catch(error){report.error='Controlled prepare did not finish; inspect the retained receipt before another attempt.';await writeFile(path,JSON.stringify(report,null,2)+'\n');throw error}
}else if(phase==='verify'){
 const report=JSON.parse(await readFile(path,'utf8'))
 if(!report.prepared||report.passed)throw Error('One prepared and not-yet-verified fixture required')
 const status=await call('query','orchestration:releaseStatus',{missionId:report.missionId})
 const resources=await call('query','orchestration:listResourcesPage',{missionId:report.missionId,paginationOpts:{numItems:20,cursor:null}})
 const mission=await call('query','missions:getById',{id:report.missionId})
 const billing=await call('query','billing:mine',{})
 const tasks=await call('query','platformTasks:summary',{missionId:report.missionId})
 if(status?.status!=='complete'||status.released!==3||status.generation!==1||resources.page.length!==3||resources.page.some(r=>r.status!=='released')||!resources.page.every(r=>report.resourceIds.includes(r._id))||hash(billing)!==report.billingBefore||tasks.sampled!==0||mission.title!==prefix||!mission.approved)throw Error('Cleanup, retained history or billing invariant failed')
 report.status=status;report.resourcesAfterHash=hash(resources.page);report.billingUnchanged=true;report.platformTasks=tasks.sampled;report.passed=true;report.verifiedAt=new Date().toISOString()
 await writeFile(path,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({passed:true,released:3,retained:3,billingUnchanged:true,platformTasks:0}))
}else throw Error('Use prepare or verify')
