import { aiAllowanceEnforced } from './aiAllowance'
import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { accountFor } from './billing'
import { executionMode } from './billingUsage'
export const authorize=internalMutation({args:{ownerKey:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 if(!aiAllowanceEnforced())return null
 const mode=executionMode();if(!mode)return null
 const account=await accountFor(ctx,a.ownerKey,mode),now=Date.now(),day=Math.floor(now/86400000)
 if(!account||account.frozen||account.unresolved>0||(account.expiresAt>now?account.included:0)+account.prepaid<100)throw new Error('Funded paid account required for provider diagnostics. Open Billing.')
 const count=account.healthDay===day?(account.healthCount??0):0
 if((account.healthAt!==undefined&&now-account.healthAt<600000)||count>=20)throw new Error('Provider diagnostics are limited to one batch per ten minutes and twenty batches per UTC day.')
 await ctx.db.patch(account._id,{healthAt:now,healthDay:day,healthCount:count+1})
 return null
}})
