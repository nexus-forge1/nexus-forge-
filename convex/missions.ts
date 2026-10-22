import {evidencePage} from './evidenceAdmission'
import {createMissionRecord} from './recordAdmission'
import { validateMissionContract, missionApprovalTransition } from "./missionContract"
import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { v } from "convex/values"
import { internalQuery, mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireOperator, requireOwnedMission } from "./permissions"

const missionValidator=v.object({_id:v.id("missions"),_creationTime:v.number(),title:v.string(),mission:v.string(),autonomy:v.string(),budget:v.number(),status:v.union(v.literal("draft"),v.literal("running"),v.literal("review"),v.literal("complete"),v.literal("cancelled")),completion:v.number(),approved:v.boolean(),ownerKey:v.string()})
export const list: any=(query as any)({args:{ownerKey:v.string(),paginationOpts:paginationOptsValidator},returns:paginationResultValidator(missionValidator),handler:async(ctx: any,args: any)=>{const userId=await requireOperator(ctx);return (ctx as any).db.query("missions").withIndex("by_owner",(q: any)=>q.eq("ownerKey",userId)).order("desc").paginate(evidencePage(args.paginationOpts,100))}})
export const getById: any=(query as any)({args:{id:v.id("missions")},returns:v.union(missionValidator,v.null()),handler:async(ctx: any,args: any)=>{return await requireOwnedMission(ctx,args.id)}})
// Session storage is untrusted: unavailable selections resolve identically without disclosure.
export const selection: any=(query as any)({
  args:{id:v.string()},returns:v.union(missionValidator,v.null()),
  handler:async(ctx:any,args:any)=>{
    const owner=await requireOperator(ctx)
    const id=ctx.db.normalizeId("missions",args.id)
    if(!id)return null
    const mission=await ctx.db.get(id)
    return mission?.ownerKey===owner?mission:null
  },
})
// Scheduled/internal workers have no operator session; expose a separate internal-only lookup.
export const getByIdInternal: any=(internalQuery as any)({args:{id:v.id("missions")},returns:v.union(missionValidator,v.null()),handler:async(ctx: any,args: any)=>((ctx as any).db.get(args.id) as Promise<any>)})
export const create: any=(mutation as any)({args:{title:v.string(),mission:v.string(),autonomy:v.string(),budget:v.number(),ownerKey:v.string(),sourceMemoryId:v.optional(v.id("memories"))},returns:v.id("missions"),handler:async(ctx: any,args: any)=>{const userId=await requireOperator(ctx);const contract=validateMissionContract(args);const id=await createMissionRecord(ctx,userId,contract);if(args.sourceMemoryId)await (ctx as any).runMutation((internal as any).missionSources.attach,{missionId:id,sourceMemoryId:args.sourceMemoryId});await (ctx as any).runMutation((internal as any).audit.record,{missionId:id,type:"mission",action:"mission_created",status:"draft",detail:"Mission created; human approval required."});return id}})
export const approve: any=(mutation as any)({args:{id:v.id("missions"),approved:v.boolean()},returns:v.null(),handler:async(ctx: any,args: any)=>{const mission=await requireOwnedMission(ctx,args.id);const transition=missionApprovalTransition(mission,args.approved);if(!transition)return null;await (ctx as any).db.patch(args.id,transition);await (ctx as any).runMutation((internal as any).audit.record,{missionId:args.id,type:"mission",action:args.approved?"mission_approved":"mission_rejected",status:args.approved?"approved":transition.status,detail:args.approved?"Human mission approval recorded; execution remains a separate explicit action.":"Human rejected mission execution."});return null}})
