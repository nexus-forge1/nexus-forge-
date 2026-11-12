import {v,ConvexError} from 'convex/values'
import {query,mutation} from './_generated/server'
import {requireOperator} from './permissions'
import {observationInput,observationFields,assessObservation} from './opportunityObservationModel'
const row=v.object({_id:v.id('opportunityObservations'),_creationTime:v.number(),...observationFields})
async function ownedPlan(ctx:any,id:any){
 const owner=await requireOperator(ctx),plan=await ctx.db.get(id)
 if(!plan||plan.ownerKey!==owner)throw new ConvexError('Validation plan not found or access denied')
 return plan
}
export const list=query({args:{planId:v.id('opportunityPlans')},returns:v.array(row),handler:async(ctx,args)=>{
 await ownedPlan(ctx,args.planId)
 return ctx.db.query('opportunityObservations').withIndex('by_plan',q=>q.eq('planId',args.planId)).order('desc').take(50)
}})
export const record=mutation({args:{planId:v.id('opportunityPlans'),...observationInput},returns:v.id('opportunityObservations'),handler:async(ctx,args)=>{
 const plan=await ownedPlan(ctx,args.planId),now=Date.now()
 if(args.actual!==undefined&&(!Number.isFinite(args.actual)||Math.abs(args.actual)>1e12))throw new ConvexError('Observed value must be finite and between -1 trillion and 1 trillion')
 if(!Number.isSafeInteger(args.sampleSize)||args.sampleSize<0||args.sampleSize>1e9)throw new ConvexError('Sample size must be a whole number from 0 to 1 billion')
 if(!Number.isSafeInteger(args.periodStart)||!Number.isSafeInteger(args.periodEnd)||args.periodStart<plan.createdAt||args.periodEnd<=args.periodStart||args.periodEnd>now)throw new ConvexError('Use a completed measurement period after this plan was saved, with end later than start')
 if(args.complete&&(args.actual===undefined||args.sampleSize===0))throw new ConvexError('Complete observations need a measured value and a nonzero sample')
 const method=args.method.trim(),evidence=args.evidence.trim()
 if(method.length<8||method.length>2000||evidence.length<8||evidence.length>3000)throw new ConvexError('Describe the measurement method (8–2000 characters) and evidence (8–3000 characters)')
 const input={actual:args.actual,sampleSize:args.sampleSize,periodStart:args.periodStart,periodEnd:args.periodEnd,complete:args.complete,stopTriggered:args.stopTriggered,method,evidence}
 const existing=await ctx.db.query('opportunityObservations').withIndex('by_plan',q=>q.eq('planId',args.planId)).take(50)
 const duplicate=existing.find(r=>Object.entries(input).every(([key,value])=>(r as any)[key]===value))
 if(duplicate)return duplicate._id
 if(existing.length>=50)throw new ConvexError('This validation plan has reached its 50-observation limit')
 return ctx.db.insert('opportunityObservations',{...input,planId:args.planId,strategyId:plan.strategyId,ownerKey:plan.ownerKey,metric:plan.metric,unit:plan.unit,target:plan.target,direction:plan.direction,planCreatedAt:plan.createdAt,...assessObservation(plan,input),createdAt:now})
}})
