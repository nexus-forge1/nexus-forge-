import {writeFile} from 'node:fs/promises'
const token=process.env.NEXUS_LEARNING_SESSION
async function call(kind,path,args){const r=await fetch('https://quick-rabbit-810.eu-west-1.convex.cloud/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path,args,format:'json'}),signal:AbortSignal.timeout(20000)});const p=await r.json();if(!r.ok||p.status!=='success')throw Error('Controlled request failed; inspect evidence before retrying');return p.value}
let report={version:'step4-learning-review-v1',observedAt:new Date().toISOString(),environment:'Testing',scope:'Controlled QA corpus and operator labels; not customer or causal effectiveness evidence',passed:false}
try{
 if(!token||/\s/.test(token))throw Error('Genuine controlled Testing session required')
 const title='Step 4 learning review QA 20261018-e7a2',before=await call('query','billing:mine',{}),missions=await call('query','missions:list',{ownerKey:'qa',paginationOpts:{numItems:20,cursor:null}})
 if(before.mode!=='test'||!missions.isDone||missions.page.some(m=>m.title===title))throw Error('Cannot establish fresh controlled fixture scope')
 const missionId=await call('mutation','missions:create',{title,mission:'Controlled retrieval effectiveness corpus; do not generalize fixture results to real users.',autonomy:'guided',budget:0,ownerKey:'qa'})
 report={...report,missionId}
 async function lesson(key,value){return call('mutation','memory:remember',{missionId,category:'learning-lesson',key:'step4-e7a2-'+key,value,source:'controlled-step4-qa-fixture',confidence:0.5})}
 const orchard=await lesson('orchard','Controlled QA fixture: orchard harvest planning should use observed yield evidence.')
 const cooling=await lesson('cooling','Controlled QA fixture: cooling temperatures should be checked before a bounded bakery test.')
 await lesson('keyword','Controlled QA fixture: confidentiality keyword index decoy; not the shared-log safety rule.')
 for(let i=0;i<5;i++)await lesson('filler-'+i,'Controlled QA fixture: unrelated packaging checklist '+i)
 const privateRule=await lesson('privacy','Controlled QA fixture: keep identifying client details out of shared logs.')
 const sourceIds=[]
 for(const [search,id] of [['orchard',orchard],['cooling',cooling],['confidentiality',privateRule]])sourceIds.push(await call('action','memory:evaluateRetrieval',{missionId,search,expectedIds:[id],rationale:'Controlled hand-labeled semantic relevance for this QA query; not independent relevance certification.'}))
 const args={kind:'retrieval',sourceIds,notes:'Same nine-lesson controlled mission corpus; three distinct questions and explicitly assigned QA relevance labels. Includes a semantic-match label to expose lexical retrieval regression.',comparabilityReviewed:true}
 const reviewId=await call('mutation','learningReviews:create',args),repeat=await call('mutation','learningReviews:create',{...args,sourceIds:[...sourceIds].reverse()})
 const row=await call('query','learningReviews:get',{id:reviewId}),summary=JSON.parse(row.summary),after=await call('query','billing:mine',{}),metric=summary.metrics[0]
 const unchanged=JSON.stringify(before.account)===JSON.stringify(after.account)&&before.usage.length===after.usage.length
 report={...report,reviewId,sourceIds,summary,idempotentReceipt:reviewId===repeat,sourceSnapshots:row.snapshots.length,billingUnchanged:unchanged,passed:summary.status==='regression-observed'&&metric.improved===2&&metric.regressed===1&&metric.benefitMean>0&&repeat===reviewId&&unchanged}
}catch{report={...report,error:'Controlled acceptance incomplete; retained QA records must be inspected before further mutation.'}}
await writeFile('/tmp/nexus-step4-learning-review-20261018.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1
