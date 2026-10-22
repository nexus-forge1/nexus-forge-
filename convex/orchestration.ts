import type{MutationCtx}from'./_generated/server';
import type{Id}from'./_generated/dataModel';
import {paginationOptsValidator,paginationResultValidator} from 'convex/server';
import {boundedHistory,historyBudget} from './portfolioHistory';
import {startResourceRelease} from './resourceCleanup';
import { mutation, query, internalMutation } from "./_generated/server";
import { v,ConvexError } from "convex/values";
import {executionRequirements,REQUIREMENT_LIMIT} from "./executionRequirements";
import { requireOperator, requireOwnedMission } from "./permissions";
import { internal } from "./_generated/api";

const dependency = v.object({
  _id: v.id("missionDependencies"),
  _creationTime: v.number(),
  missionId: v.id("missions"),
  dependsOnMissionId: v.id("missions"),
  kind: v.union(v.literal("blocks"), v.literal("informs")),
  note: v.optional(v.string()),
  createdAt: v.number(),
});
const resource = v.object({
  _id: v.id("missionResources"),
  _creationTime: v.number(),
  missionId: v.id("missions"),
  resourceKey: v.string(),
  mode: v.union(v.literal("exclusive"), v.literal("shared")),
  status: v.union(
    v.literal("requested"),
    v.literal("held"),
    v.literal("released"),
  ),
  heldAt: v.optional(v.number()),
  releasedAt: v.optional(v.number()),
});

export const listDependencies = query({
  args: { missionId: v.id("missions") },
  returns: v.array(dependency),
  handler: async (ctx, args) => {
    await requireOwnedMission(ctx, args.missionId);
    const budget=historyBudget();
    const rows=await boundedHistory(ctx.db.query("missionDependencies").withIndex("by_mission",q=>q.eq("missionId",args.missionId)),budget,20);
    if(!budget.complete)throw new ConvexError("Retained requirement history exceeds this summary. Use listDependenciesPage to review every page. Existing records are retained.");
    return rows;
  },
});
export const listResources = query({
  args: { missionId: v.id("missions") },
  returns: v.array(resource),
  handler: async (ctx, args) => {
    await requireOwnedMission(ctx, args.missionId);
    const budget=historyBudget();
    const rows=await boundedHistory(ctx.db.query("missionResources").withIndex("by_mission",q=>q.eq("missionId",args.missionId)),budget,20);
    if(!budget.complete)throw new ConvexError("Retained requirement history exceeds this summary. Use listResourcesPage to review every page. Existing records are retained.");
    return rows;
  },
});

export const addDependency = mutation({
  args: {
    missionId: v.id("missions"),
    dependsOnMissionId: v.id("missions"),
    kind: v.union(v.literal("blocks"), v.literal("informs")),
    note: v.optional(v.string()),
  },
  returns: v.id("missionDependencies"),
  handler: async (ctx, args) => {
    await requireOperator(ctx);
    await requireOwnedMission(ctx, args.missionId);
    await requireOwnedMission(ctx, args.dependsOnMissionId);
    if (args.missionId === args.dependsOnMissionId)
      throw new Error("A mission cannot depend on itself");
    if (
      !(await ctx.db.get(args.missionId)) ||
      !(await ctx.db.get(args.dependsOnMissionId))
    )
      throw new Error("Both missions must exist");
    if(args.note!==undefined&&new TextEncoder().encode(args.note).byteLength>4096)throw new ConvexError("Dependency notes are limited to 4,096 UTF-8 bytes");
    const existing = await ctx.db.query("missionDependencies").withIndex("by_mission",q=>q.eq("missionId",args.missionId)).take(REQUIREMENT_LIMIT+1);
    if(existing.length>REQUIREMENT_LIMIT)throw new ConvexError("Dependency history exceeds the bounded safety review; existing records are retained");
    if (existing.some((d) => d.dependsOnMissionId === args.dependsOnMissionId))
      throw new Error("Dependency already exists");
    if(existing.length>=REQUIREMENT_LIMIT)throw new ConvexError("A mission supports at most 20 retained dependencies");
    const id = await ctx.db.insert("missionDependencies", {
      ...args,
      createdAt: Date.now(),
    });
    await ctx.runMutation(internal.audit.record, {
      missionId: args.missionId,
      type: "orchestration",
      action: "dependency_added",
      status: args.kind,
      detail: `Dependency added on ${args.dependsOnMissionId}.`,
    });
    return id;
  },
});

export const setResource = mutation({
  args: {
    missionId: v.id("missions"),
    resourceKey: v.string(),
    mode: v.union(v.literal("exclusive"), v.literal("shared")),
  },
  returns: v.id("missionResources"),
  handler: async (ctx, args) => {
    await requireOperator(ctx);
    await requireOwnedMission(ctx, args.missionId);
    const key = args.resourceKey.trim();
    if (!key||new TextEncoder().encode(key).byteLength>240) throw new ConvexError("Resource key requires 1–240 UTF-8 bytes");
    const existing=await ctx.db.query("missionResources").withIndex("by_mission",q=>q.eq("missionId",args.missionId)).take(REQUIREMENT_LIMIT+1);
    if(existing.length>REQUIREMENT_LIMIT)throw new ConvexError("Resource history exceeds the bounded safety review; existing records are retained");
    const prior = existing.find(
      (r) => r.resourceKey === key && r.status !== "released",
    );
    if(prior){if(prior.mode!==args.mode)throw new ConvexError("The retained reservation has a different resource mode");return prior._id;}
    if(existing.length>=REQUIREMENT_LIMIT)throw new ConvexError("A mission supports at most 20 retained resource reservations");
    return await ctx.db.insert("missionResources", {
      missionId: args.missionId,
      resourceKey: key,
      mode: args.mode,
      status: "requested",
    });
  },
});

export const preflight=query({
 args:{missionId:v.id("missions")},
 returns:v.object({ready:v.boolean(),blockers:v.array(v.string()),advisories:v.array(v.string()),resources:v.array(v.object({key:v.string(),mode:v.string(),available:v.boolean(),heldByMission:v.optional(v.id("missions"))}))}),
 handler:async(ctx,args)=>{
  const mission=await requireOwnedMission(ctx,args.missionId),review=await executionRequirements(ctx,mission);
  return{ready:review.blockers.length===0,blockers:review.blockers,advisories:review.advisories,resources:review.resourceRows};
 }
});



export const acquireForExecution=mutation({
 args:{missionId:v.id("missions")},returns:v.object({acquired:v.boolean(),blockers:v.array(v.string())}),
 handler:async(ctx,args)=>{
  const mission=await requireOwnedMission(ctx,args.missionId);
  if(!mission.approved||mission.status==="complete"||mission.status==="cancelled"||mission.status==="review")return{acquired:false,blockers:["Mission approval and active status are required before acquiring resources."]};
  const review=await executionRequirements(ctx,mission);
  if(review.blockers.length)return{acquired:false,blockers:review.blockers};
  const pending=review.resources.filter(r=>r.status!=="held");
  if(!pending.length)return{acquired:true,blockers:[]};
  const now=Date.now();
  for(const row of pending)await ctx.db.patch(row._id,{status:"held",heldAt:now});
  await ctx.runMutation(internal.audit.record,{missionId:args.missionId,type:"orchestration",action:"resources_acquired",status:"ready",detail:"Acquired "+pending.length+" resource reservation(s)."});
  return{acquired:true,blockers:[]};
 }
});



async function manualReleaseMission(ctx:MutationCtx,missionId:Id<'missions'>){
 const mission=await requireOwnedMission(ctx,missionId);
 const run=await ctx.db.query("missionRuns").withIndex("by_mission",q=>q.eq("missionId",missionId)).order("desc").first();
 if(mission.approved&&(mission.status==="draft"||mission.status==="running")&&run&&(run.status==="running"||run.status==="paused"))throw new ConvexError("An active runner owns these reservations. Resolve or cancel the mission before manual cleanup.");
 return mission;
}
const cleanupProgress=v.object({releasedInBatch:v.number(),pending:v.boolean(),totalReleased:v.number(),generation:v.number()});
export const releaseForMission=mutation({
 args:{missionId:v.id("missions")},returns:v.number(),
 handler:async(ctx,args)=>{const mission=await manualReleaseMission(ctx,args.missionId);return(await startResourceRelease(ctx,mission)).releasedInBatch;}
});
export const releaseForMissionInternal=internalMutation({
 args:{missionId:v.id("missions")},returns:v.number(),
 handler:async(ctx,args)=>{const mission=await ctx.db.get(args.missionId);if(!mission)return 0;return(await startResourceRelease(ctx,mission)).releasedInBatch;}
});
export const requestRelease=mutation({
 args:{missionId:v.id("missions")},returns:cleanupProgress,
 handler:async(ctx,args)=>startResourceRelease(ctx,await manualReleaseMission(ctx,args.missionId))
});
export const releaseStatus=query({
 args:{missionId:v.id("missions")},returns:v.union(v.null(),v.object({status:v.union(v.literal("pending"),v.literal("complete"),v.literal("review")),generation:v.number(),released:v.number(),error:v.optional(v.string())})),
 handler:async(ctx,args)=>{
  await requireOwnedMission(ctx,args.missionId);
  const job=await ctx.db.query("resourceReleaseJobs").withIndex("by_mission",q=>q.eq("missionId",args.missionId)).unique();
  return job?{status:job.status,generation:job.generation,released:job.released,...(job.error?{error:job.error}:{})}:null;
 }
});
function pageOptions(opts:{numItems:number;cursor:string|null;endCursor?:string|null;id?:number;maximumRowsRead?:number;maximumBytesRead?:number}){
 if(!Number.isInteger(opts.numItems)||opts.numItems<1||opts.numItems>20)throw new ConvexError("History pages require 1–20 rows.");
 return{...opts,maximumRowsRead:40,maximumBytesRead:1024*1024};
}
export const listDependenciesPage=query({
 args:{missionId:v.id("missions"),paginationOpts:paginationOptsValidator},returns:paginationResultValidator(dependency),
 handler:async(ctx,args)=>{await requireOwnedMission(ctx,args.missionId);return ctx.db.query("missionDependencies").withIndex("by_mission",q=>q.eq("missionId",args.missionId)).order("desc").paginate(pageOptions(args.paginationOpts));}
});
export const listResourcesPage=query({
 args:{missionId:v.id("missions"),paginationOpts:paginationOptsValidator},returns:paginationResultValidator(resource),
 handler:async(ctx,args)=>{await requireOwnedMission(ctx,args.missionId);return ctx.db.query("missionResources").withIndex("by_mission",q=>q.eq("missionId",args.missionId)).order("desc").paginate(pageOptions(args.paginationOpts));}
});

