import { validateMissionBudget } from './missionContract'

// Called inside the same mutation that creates an invocation and reserves wallet credit.
// Indexed reads participate in transaction conflict detection for concurrent steps.
export async function enforceMissionUsageBudget(ctx:any, invocationId:any, ownerKey:string, mode:string, reserved:number) {
  const invocation=await ctx.db.get(invocationId)
  if(!invocation)throw new Error('Usage invocation missing')
  if(!invocation.missionId)return
  const mission=await ctx.db.get(invocation.missionId)
  if(!mission||mission.ownerKey!==ownerKey)throw new Error('Mission usage ownership mismatch')
  validateMissionBudget(mission.budget)
  const rows=await ctx.db.query('providerInvocations').withIndex('by_mission',(q:any)=>q.eq('missionId',mission._id)).take(201)
  if(rows.length>200)throw new Error('Mission usage history requires review before another paid step')
  let committed=0
  for(const row of rows) {
    if(row._id===invocationId)continue
    const hold=await ctx.db.query('billingHolds').withIndex('by_invocation_mode',(q:any)=>q.eq('invocationId',row._id).eq('mode',mode)).unique()
    if(!hold||hold.ownerKey!==ownerKey)throw new Error('Mission has usage without billing evidence; review before another paid step')
    const amount=hold.status==='settled'?hold.charged:hold.reserved
    if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Mission billing evidence requires review')
    committed+=amount
  }
  const cap=Math.floor(mission.budget*100+1e-8)
  if(committed+reserved>cap)throw new Error('Mission spend cap cannot cover another $1 AI step authorization; create a new mission with an appropriate cap')
}
