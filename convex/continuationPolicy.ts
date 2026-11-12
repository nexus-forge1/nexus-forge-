import {boundedHistory,historyBudget,includeHistoryRow} from './portfolioHistory'
import type { QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
type ReadCtx=Pick<QueryCtx,'db'>
export const councilStages=['council-plan','council-Vision Architect','council-Research Oracle','council-Systems Engineer','council-Builder Agent','council-Creative Director','council-critic','council-decision']
const roles=['planner','wave1','wave1','wave1','wave2','wave2','critic','planner']
export async function continuationPreflight(ctx:ReadCtx,claim:Doc<'executionClaims'>,admission=false):Promise<string|null>{
 const runId=ctx.db.normalizeId('missionRuns',claim.workKey.slice(7)),run=runId?await ctx.db.get(runId):null,mission=await ctx.db.get(claim.missionId)
 if(!run||!mission||run.missionId!==mission._id||!mission.approved||mission.status==='complete'||mission.status==='cancelled'||mission.status==='review')return 'Mission or runner no longer permits continuation.'
 if(run.status!=='paused'||run.currentStage!=='execution_recovery'||Date.now()>=run.deadlineAt)return 'Continuation requires the original recovery checkpoint and unexpired deadline.'
 if(admission&&run.retries>=run.maxRetries)return 'The original retry allowance is exhausted.'
 const latest=await ctx.db.query('missionRuns').withIndex('by_mission',q=>q.eq('missionId',mission._id)).order('desc').first()
 if(latest?._id!==run._id)return 'A newer mission run exists.'
 const decision=await ctx.db.query('portfolioDecisions').withIndex('by_mission',q=>q.eq('missionId',mission._id)).order('desc').first()
 if(decision&&decision.decision!=='approve')return 'Portfolio authorization no longer permits continuation.'
 const cleanup=await ctx.db.query('resourceReleaseJobs').withIndex('by_mission',q=>q.eq('missionId',mission._id)).unique()
 if(cleanup&&cleanup.status!=='complete')return 'Resource cleanup must finish and any cleanup review must be resolved before continuation.'
 const budget=historyBudget()
 const deps=await boundedHistory(ctx.db.query('missionDependencies').withIndex('by_mission',q=>q.eq('missionId',mission._id)),budget,20)
 if(!budget.complete)return 'Dependency evidence exceeds the bounded recovery review.'
 for(const d of deps){const m=await ctx.db.get(d.dependsOnMissionId);if(m&&!includeHistoryRow(budget,m))return 'Dependency evidence exceeds the bounded recovery review.';if(!m||m.ownerKey!==mission.ownerKey||d.kind==='blocks'&&m.status!=='complete')return 'A mission dependency is unavailable or incomplete.'}
 const resources=await boundedHistory(ctx.db.query('missionResources').withIndex('by_mission',q=>q.eq('missionId',mission._id)),budget,20)
 if(!budget.complete)return 'Resource evidence exceeds the bounded recovery review.'
 for(const r of resources){if(r.status!=='held')return 'Original resources must remain held before continuation.';const holders=await boundedHistory(ctx.db.query('missionResources').withIndex('by_resource_status',q=>q.eq('resourceKey',r.resourceKey).eq('status','held')),budget,50);if(!budget.complete||holders.some(h=>h.missionId!==mission._id&&(h.mode==='exclusive'||r.mode==='exclusive')))return 'A resource has conflicting or excessive reservations.'}
 for(const status of ['open','escalated']as const)if(await ctx.db.query('incidents').withIndex('by_mission_status',q=>q.eq('missionId',mission._id).eq('status',status)).first())return 'Resolve outstanding incidents before continuing Council work.'
 if(await ctx.db.query('artifacts').withIndex('by_mission',q=>q.eq('missionId',mission._id)).first()||await ctx.db.query('deliveries').withIndex('by_mission',q=>q.eq('missionId',mission._id)).first())return 'Later mission handoffs exist and require separate reconciliation.'
 if(admission)for(const scope of ['tick','council'])for(const status of ['running','uncertain'] as const){const locks=await ctx.db.query('executionClaims').withIndex('by_missionId_and_scope_and_status',q=>q.eq('missionId',mission._id).eq('scope',scope).eq('status',status)).take(2);if(locks.some(x=>x._id!==claim._id))return 'Another mission execution is active or uncertain.'}
 return null
}
export async function continuationInspection(ctx:ReadCtx,claim:Doc<'executionClaims'>){
 const blocked=(block:string)=>({block,proof:null as string|null,reused:0,remaining:0,effects:[] as Doc<'executionEffects'>[]})
 if(claim.status!=='uncertain'||claim.scope!=='council'||!claim.workKey.startsWith('runner:'))return blocked('Only an uncertain runner Council claim can continue.')
 const preflight=await continuationPreflight(ctx,claim,true);if(preflight)return blocked(preflight)
 const runId=ctx.db.normalizeId('missionRuns',claim.workKey.slice(7))!,run=(await ctx.db.get(runId))!,mission=(await ctx.db.get(claim.missionId))!
 const effects=await ctx.db.query('executionEffects').withIndex('by_claim',q=>q.eq('claimId',claim._id)).take(65)
 if(effects.length>64||new Set(effects.map(e=>e.effectKey)).size!==effects.length||effects.reduce((n,e)=>n+new TextEncoder().encode(e.payload).length,0)>2*1024*1024)return blocked('Retained effects exceed their recovery bound or are ambiguous.')
 if(effects.some(e=>e.effectKey==='council-result'))return blocked('A final Council result exists; use saved-completion reconciliation.')
 const snapshot=effects.find(e=>e.effectKey==='council-context:v1');if(!snapshot)return blocked('Immutable Council inputs are required.')
 let saved:any;try{saved=JSON.parse(snapshot.payload)}catch{return blocked('Saved Council inputs are malformed.')}
 const receiptId=typeof saved.memoryReceiptId==='string'?ctx.db.normalizeId('councilMemoryReceipts',saved.memoryReceiptId):null,receipt=receiptId?await ctx.db.get(receiptId):null
 if(!receipt||receipt.ownerKey!==mission.ownerKey||receipt.missionId!==mission._id||!['prepared','planner-responded'].includes(receipt.status)||!saved.context||saved.context.missionText!==mission.mission||receipt.missionText!==mission.mission||receipt.learningContext!==saved.context.learningContext||receipt.preflightContext!==saved.context.preflightContext||typeof saved.context.researchContext!=='string'||typeof saved.context.learningContext!=='string'||typeof saved.context.preflightContext!=='string')return blocked('Saved inputs and memory receipt do not match the approved mission.')
 const rows=await ctx.db.query('providerInvocations').withIndex('by_missionRunId_and_stage_and_role_and_outcome',q=>q.eq('missionRunId',runId)).take(9)
 if(rows.length>8||new Set(rows.map(r=>r.stage)).size!==rows.length)return blocked('Provider stage evidence is excessive or ambiguous.')
 const proof:string[][]=[]
 for(const row of rows){const index=councilStages.indexOf(row.stage);if(index<0||row.role!==roles[index]||row.ownerKey!==mission.ownerKey||row.missionId!==mission._id||row.outcome!=='succeeded')return blocked('Pending, failed, mismatched or ambiguous provider work cannot be continued.');const result=await ctx.db.query('providerResults').withIndex('by_invocation',q=>q.eq('invocationId',row._id)).unique();if(!result||!result.answer.trim()||!/^[a-f0-9]{64}$/.test(result.requestDigest))return blocked('Every admitted stage must retain a successful durable answer.');proof.push([row._id,result._id,result.requestDigest])}
 const has=(i:number)=>rows.some(r=>r.stage===councilStages[i])
 if(rows.some(r=>r.stage!=='council-plan')&&!has(0)||[4,5].some(has)&&![1,2,3].every(has)||has(6)&&![4,5].every(has)||has(7)&&!has(6))return blocked('Saved stages violate Council dependency-wave order.')
 const agents=await ctx.db.query('agentRuns').withIndex('by_mission',q=>q.eq('missionId',mission._id)).take(7)
 const names=['Vision Architect','Research Oracle','Systems Engineer','Builder Agent','Creative Director','Critic Agent']
 if(agents.length!==6||new Set(agents.map(a=>a.agent)).size!==6||agents.some(a=>!names.includes(a.agent)))return blocked('Six unique Council agent records are required.')
 return{block:null,proof:JSON.stringify([snapshot._id,receipt._id,receipt.status,run.deadlineAt,run.retries,proof,effects.filter(e=>!['recovery-review:v1','continuation-ticket:v1'].includes(e.effectKey)).map(e=>e._id)]),reused:rows.length,remaining:8-rows.length,effects}
}
