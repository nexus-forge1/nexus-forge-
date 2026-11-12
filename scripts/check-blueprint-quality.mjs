// Explicit one-shot Testing acceptance. Never retries synthesis or creates funding.
import { writeFile, chmod } from 'node:fs/promises'
import { assessBlueprint } from '../convex/blueprintCompleteness.ts'
const origin='https://quick-rabbit-810.eu-west-1.convex.cloud'
const token=process.env.NEXUS_BLUEPRINT_SESSION
const reportPath=process.env.NEXUS_BLUEPRINT_REPORT||'/tmp/nexus-blueprint-quality.json'
async function call(kind,path,args,timeout=15000){
 const response=await fetch(origin+'/api/'+kind,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path,args,format:'json'}),signal:AbortSignal.timeout(timeout)})
 const body=await response.json()
 if(!response.ok||body.status!=='success')throw Error('Controlled request failed; no inference retry was made')
 return body.value
}
let report={version:'blueprint-quality-v2',observedAt:new Date().toISOString(),environment:'Testing',passed:false,automaticActionRetries:0}
try{
 if(!token||/\s/.test(token))throw Error('A genuine fresh Testing session is required')
 const before=await call('query','billing:mine',{})
 const ledger=await call('query','providerUsage:history',{paginationOpts:{numItems:20,cursor:null}})
 const blueprints=await call('query','manifestIntelligence:listBlueprints',{})
 if(before.mode!=='test'||before.account?.prepaid!==1000||before.receipts.length!==1||before.account.held||before.account.unresolved||ledger.page.length||blueprints.length)throw Error('Expected a fresh account with one verified test-only purchase and no prior inference')
 const started=Date.now()
 const result=await call('action','manifestIntelligence:synthesize',{intent:'Controlled QA proposal: design a local text-only daily planning checklist for a fictional bakery. Do not deploy, contact people or claim actual customer outcomes.',domain:'Controlled software acceptance',budget:4,horizon:'one day',constraints:'Keep data local. Use existing tools only. No external execution, purchases or real customer claims.',acceptanceCriteria:'All eleven required sections with concrete content, three different strategy names and mechanisms, one measurable first experiment, and one next action.'},120000)
 const saved=await call('query','manifestIntelligence:listBlueprints',{})
 const rows=await call('query','manifestIntelligence:listStrategies',{})
 const invocations=await call('query','providerUsage:history',{paginationOpts:{numItems:20,cursor:null}})
 const after=await call('query','billing:mine',{})
 const exact=saved.find(row=>row.key===result.blueprintKey)
 const strategies=rows.filter(row=>[1,2,3].some(index=>row.key===result.blueprintKey+':strategy:'+index)).map(row=>JSON.parse(row.value))
 const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
 const distinct=strategies.length===3&&new Set(strategies.map(row=>normalize(row.name))).size===3&&new Set(strategies.map(row=>normalize(row.mechanism))).size===3
 const sections=assessBlueprint(result.blueprint)
 const settled=after.account?.held===0&&after.account?.unresolved===0&&after.usage.length>0&&after.usage.every(row=>row.status==='settled')
 report={...report,durationMs:Date.now()-started,blueprintKey:result.blueprintKey,blueprintId:exact?._id,sections,distinctStrategies:distinct,strategyCount:strategies.length,exactPersistedText:!!exact&&JSON.parse(exact.value).blueprint===result.blueprint,invocations:invocations.page.map(row=>({id:row._id,stage:row.stage,outcome:row.outcome,usageStatus:row.usageStatus,reports:row.reports.map(r=>({provider:r.provider,model:r.model,promptTokens:r.promptTokens,completionTokens:r.completionTokens}))})),billing:{mode:after.mode,prepaidCents:after.account?.prepaid,heldCents:after.account?.held,unresolved:after.account?.unresolved,settled,realCustomerCharge:false},passed:sections.complete&&distinct&&!!exact&&JSON.parse(exact.value).blueprint===result.blueprint&&settled}
}catch{report={...report,error:'Controlled acceptance did not fully pass. Inspect the existing QA records before further work; no action retry was made.'}}
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});await chmod(reportPath,0o600)
console.log(JSON.stringify(report))
if(!report.passed)process.exitCode=1
