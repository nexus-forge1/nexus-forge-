import { RATE_VERSION, reportCost, chargeCents } from './billingRates'
import { currentPaymentMode } from './billingModel'
import { accountFor } from './billing'
import { enforceMissionUsageBudget } from './missionUsageBudget'

// Cloud runtime has a built-in URL. Offline unit fixtures have no deployed payment environment.
export function executionMode() {
  if(!process.env.CONVEX_CLOUD_URL)return null
  const mode=currentPaymentMode()
  if(mode==='test'&&process.env.CONVEX_CLOUD_URL!=='https://quick-rabbit-810.eu-west-1.convex.cloud')throw new Error('Real payments are not activated. Open Billing; test purchases cannot fund production AI.')
  return mode
}
export async function reserveUsage(ctx:any,invocationId:any,ownerKey:string) {
  const mode=executionMode();if(!mode)return
  const previous=await ctx.db.query('billingHolds').withIndex('by_invocation_mode',(q:any)=>q.eq('invocationId',invocationId).eq('mode',mode)).unique()
  if(previous)return
  const account=await accountFor(ctx,ownerKey,mode)
  if(!account||account.frozen||account.unresolved>0)throw new Error('Paid usage is unavailable. Open Billing to fund the account or resolve its billing review.')
  const included=account.expiresAt>Date.now()?account.included:0,reserved=100
  if(included+account.prepaid<reserved)throw new Error('At least $1 available usage credit is required per AI step. Subscribe or add prepaid credit in Billing.')
  await enforceMissionUsageBudget(ctx,invocationId,ownerKey,mode,reserved)
  const includedReserved=Math.min(included,reserved),prepaidReserved=reserved-includedReserved
  await ctx.db.patch(account._id,{included:included-includedReserved,prepaid:account.prepaid-prepaidReserved,held:account.held+reserved})
  await ctx.db.insert('billingHolds',{ownerKey,mode,invocationId,reserved,includedReserved,prepaidReserved,includedExpires:account.expiresAt,rateVersion:RATE_VERSION,status:'held',createdAt:Date.now()})
}
export async function settleUsage(ctx:any,row:any,usageStatus:string) {
  if(!process.env.CONVEX_CLOUD_URL)return
  const mode=currentPaymentMode()
  const hold=await ctx.db.query('billingHolds').withIndex('by_invocation_mode',(q:any)=>q.eq('invocationId',row._id).eq('mode',mode)).unique()
  if(!hold||hold.status!=='held')return
  const account=await accountFor(ctx,row.ownerKey,mode);if(!account)throw new Error('Billing account missing')
  const costs=row.reports.map((r:any)=>reportCost(r,hold.rateVersion))
  if(usageStatus!=='recorded'||!costs.length||costs.some((n:any)=>n===null)){
    await ctx.db.patch(hold._id,{status:'review'})
    await ctx.db.patch(account._id,{unresolved:account.unresolved+1})
    return
  }
  // Never debit more than the disclosed $1 authorization. Any excess provider cost is absorbed.
  const providerCostUsd=costs.reduce((total:number,cost:any)=>total+cost.usd,0)
  const costBasis=[...new Set(costs.map((cost:any)=>cost.basis))].join(', ')
  const charged=Math.min(hold.reserved,chargeCents(providerCostUsd))
  const includedCharge=Math.min(charged,hold.includedReserved),prepaidCharge=charged-includedCharge
  const includedReturn=account.expiresAt===hold.includedExpires&&account.expiresAt>Date.now()?hold.includedReserved-includedCharge:0
  await ctx.db.patch(account._id,{included:account.included+includedReturn,prepaid:account.prepaid+hold.prepaidReserved-prepaidCharge,held:account.held-hold.reserved})
  await ctx.db.patch(hold._id,{status:'settled',charged,providerCostUsd,costBasis})
}
