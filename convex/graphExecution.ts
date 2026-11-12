import {v} from 'convex/values'
import {action} from './_generated/server'
import {internal} from './_generated/api'
import {requireOperator} from './permissions'
import {callGraphProvider} from './aiProvider'
export const runWave=action({args:{executionId:v.id('graphExecutions'),waveKey:v.string()},returns:v.id('graphExecutionWaves'),handler:async(ctx,a)=>{
 await requireOperator(ctx)
 const admission=await ctx.runMutation(internal.graphExecutionData.reserveWave,a)
 const jobs=admission.workerIds.map(async workerId=>{
  let taken
  try{taken=await ctx.runMutation(internal.graphExecutionData.take,{workerId})}
  catch{await ctx.runMutation(internal.graphExecutionData.failed,{workerId});return}
  if(!taken)return
  const {worker,execution}=taken
  let observedReports=0
  try{
   const answer=await callGraphProvider(execution.provider,execution.model,worker.prompt,execution.maxOutputTokens,async usage=>{
    observedReports++
    await ctx.runMutation(internal.manifestIntelligence.recordProviderUsageInternal,{ownerKey:execution.ownerKey,...usage,invocationId:worker.invocationId,reportOrdinal:observedReports})
   })
   // Atomic provider answer, successful outcome and billing settlement. A lost
   // acknowledgement is recovered locally; it never causes another inference.
   await ctx.runMutation(internal.providerRecovery.complete,{invocationId:worker.invocationId,requestDigest:worker.requestDigest,answer,observedReports})
  }catch{
   // Preserve unknown/pending remote work and its wallet hold for review.
   await ctx.runMutation(internal.graphExecutionData.failed,{workerId})
  }
 })
 const results=await Promise.allSettled(jobs)
 await ctx.runMutation(internal.graphExecutionData.settle,{waveId:admission.waveId})
 if(results.some(r=>r.status==='rejected'))throw new Error('Graph receipt confirmation was interrupted. Recover saved handoffs; do not issue a new request identity.')
 return admission.waveId
}})
