import {execFileSync} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const raw=execFileSync('agent-browser',['--session','nf-step9-lab','eval','localStorage.getItem("__convexAuthJWT_httpsquickrabbit810euwest1convexcloud")'],{encoding:'utf8'})
const token=raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
async function call(kind,path,args){
 const response=await fetch('https://quick-rabbit-810.eu-west-1.convex.cloud/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path,args,format:'json'}),signal:AbortSignal.timeout(15000)})
 const payload=await response.json()
 if(!response.ok||payload.status!=='success'){
  const error=new Error('Controlled API acceptance failed')
  error.reason=typeof payload.errorData==='string'?payload.errorData:payload.errorMessage
  throw error
 }
 return payload.value
}
async function denied(operation,pattern){
 try{await operation();return false}catch(error){if(pattern.test(error.reason||''))return true;throw error}
}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
let report={version:'step9-research-evaluation-v1',environment:'Testing',observedAt:new Date().toISOString(),scope:'Synthetic operator-recorded fixtures; not scientific findings, independent replication or model performance evidence',passed:false,protocols:[]}
try{
 if(!token)throw new Error('Fresh controlled Testing session required')
 const before=await call('query','billing:mine',{})
 if(before.mode!=='test')throw new Error('Testing billing required')
 for(const kind of ['comparison','science','generality']){
  const title='Step 9 controlled '+kind+' evaluation 20261018-9f3c'
  const existing=await call('query','frontierLab:list',{kind})
  if(existing.length>=100||existing.some(row=>row.title===title))throw new Error('Fresh fixture scope not established')
 }
 for(const kind of ['comparison','science','generality']){
  const domains=kind==='generality'?['training','held']:['controlled']
  const title='Step 9 controlled '+kind+' evaluation 20261018-9f3c'
  const protocolId=await call('mutation','frontierLab:create',{kind,title,hypothesis:'Synthetic functional acceptance only. Values are authored fixture observations, not actual customer or scientific measurements.',metric:'controlled paired score',unit:'points',direction:'higher',target:1,minimumSamples:kind==='generality'?3:2,domains,heldOutDomains:kind==='generality'?['held']:[]})
  const entry={kind,protocolId,trials:[],inconclusiveRetained:kind!=='generality',prematureClosureDenied:kind!=='generality'}
  report.protocols.push(entry)
  const values=kind==='comparison'?[[0,2,'controlled'],[0,3,'controlled']]:kind==='science'?[[5,3,'controlled'],[5,5,'controlled']]:[[0,10,'training'],[0,10,'training'],[0,-1,'held']]
  for(const [index,[baseline,candidate,domain]] of values.entries()){
   if(kind==='generality'&&index===2){
    const incomplete=await call('query','frontierLab:detail',{protocolId})
    entry.inconclusiveRetained=!incomplete.summary.ready&&incomplete.summary.heldOutTargetMet===null
    entry.prematureClosureDenied=await denied(()=>call('mutation','frontierLab:close',{protocolId}),/minimum samples/)
   }
   const caseKey=kind+'-9f3c-'+index,fixture={origin:'authored step9 fixture',kind,caseKey,baseline,candidate,domain}
   // Deliberately synthetic locator. The application does not fetch or certify it.
   const args={protocolId,caseKey,baseline,candidate,domain,evidence:'https://example.com/controlled-step9-fixture',digest:hash(fixture)}
   const trialId=await call('mutation','frontierLab:addTrial',args)
   entry.trials.push({trialId,fixture,digest:args.digest,args})
  }
  await call('mutation','frontierLab:close',{protocolId})
  const detail=await call('query','frontierLab:detail',{protocolId}),first=entry.trials[0]
  entry.idempotentAfterClose=await call('mutation','frontierLab:addTrial',first.args)===first.trialId
  entry.conflictDenied=await denied(()=>call('mutation','frontierLab:addTrial',{...first.args,candidate:first.args.candidate+1}),/immutable evidence/)
  entry.newTrialDenied=await denied(()=>call('mutation','frontierLab:addTrial',{...first.args,caseKey:kind+'-new-after-close'}),/closed/)
  entry.closed=detail.record.status==='closed'
  entry.summary=detail.summary
  entry.passed=entry.closed&&entry.idempotentAfterClose&&entry.conflictDenied&&entry.newTrialDenied&&entry.inconclusiveRetained&&entry.prematureClosureDenied&&(kind==='comparison'?detail.summary.targetMet&&detail.summary.regressed===0:kind==='science'?!detail.summary.targetMet&&detail.summary.regressed===1&&detail.summary.unchanged===1:detail.summary.targetMet&&detail.summary.heldOutTargetMet===false&&detail.summary.regressed===1)
 }
 const after=await call('query','billing:mine',{})
 report.billingUnchanged=hash([before.account,before.usage])===hash([after.account,after.usage])
 report.passed=report.protocols.length===3&&report.protocols.every(row=>row.passed)&&report.billingUnchanged
}catch{report.error='Controlled acceptance incomplete; inspect retained protocol IDs before any mutation retry.'}
await writeFile('/tmp/nexus-step9-research-evaluations-20261018.json',JSON.stringify(report,null,2),{mode:0o600})
console.log(JSON.stringify({passed:report.passed,error:report.error,billingUnchanged:report.billingUnchanged,protocols:report.protocols.map(({kind,protocolId,passed,summary})=>({kind,protocolId,passed,summary}))}))
if(!report.passed)process.exitCode=1
