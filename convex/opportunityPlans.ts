import { v,ConvexError } from 'convex/values'
import {query,mutation} from './_generated/server'
import {requireOperator} from './permissions'
import {opportunityPlanInput,opportunityPlanFields} from './opportunityPlanModel'
const row=v.object({_id:v.id('opportunityPlans'),_creationTime:v.number(),...opportunityPlanFields})
async function ownedStrategy(ctx:any,id:any){
 const owner=await requireOperator(ctx),strategy=await ctx.db.get(id)
 if(!strategy||strategy.ownerKey!==owner||strategy.category!=='manifest-strategy')throw new ConvexError('Strategy not found or access denied')
 return strategy
}
function bounded(value:string,min:number,max:number,label:string){
 const text=value.trim();if(text.length<min||text.length>max)throw new ConvexError(label+' must contain '+min+'–'+max+' characters');return text
}
export const list=query({args:{strategyId:v.id('memories')},returns:v.array(row),handler:async(ctx,args)=>{
 await ownedStrategy(ctx,args.strategyId)
 return ctx.db.query('opportunityPlans').withIndex('by_strategy',q=>q.eq('strategyId',args.strategyId)).order('desc').take(20)
}})
export const create=mutation({args:{strategyId:v.id('memories'),...opportunityPlanInput},returns:v.id('opportunityPlans'),handler:async(ctx,args)=>{
 const strategy=await ownedStrategy(ctx,args.strategyId)
 const plan={assumption:bounded(args.assumption,8,1500,'Assumption'),action:bounded(args.action,8,2000,'Validation action'),metric:bounded(args.metric,2,120,'Metric'),unit:bounded(args.unit,1,60,'Unit'),stopCondition:bounded(args.stopCondition,8,1500,'Stop condition'),target:args.target,direction:args.direction,reviewWithinDays:args.reviewWithinDays}
 if(!Number.isFinite(plan.target)||Math.abs(plan.target)>1e12)throw new ConvexError('Target must be finite and between -1 trillion and 1 trillion')
 if(!Number.isInteger(plan.reviewWithinDays)||plan.reviewWithinDays<1||plan.reviewWithinDays>365)throw new ConvexError('Review period must be 1–365 whole days')
 if(strategy.value.length>65536)throw new ConvexError('Strategy snapshot is too large for a validation plan')
 let parsed:any
 try{parsed=JSON.parse(strategy.value)}catch{throw new ConvexError('Strategy data requires review before planning')}
 if(!parsed||typeof parsed!=='object'||typeof parsed.name!=='string'||!parsed.name.trim())throw new ConvexError('Strategy data requires review before planning')
 const existing=await ctx.db.query('opportunityPlans').withIndex('by_strategy',q=>q.eq('strategyId',args.strategyId)).take(20)
 const duplicate=existing.find(r=>r.strategySnapshot===strategy.value&&Object.entries(plan).every(([key,value])=>(r as any)[key]===value))
 if(duplicate)return duplicate._id
 if(existing.length>=20)throw new ConvexError('This strategy has reached its 20 validation-plan limit')
 return ctx.db.insert('opportunityPlans',{...plan,strategyId:args.strategyId,ownerKey:strategy.ownerKey,strategyKey:strategy.key,strategySnapshot:strategy.value,createdAt:Date.now()})
}})
