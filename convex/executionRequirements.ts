import type {QueryCtx} from './_generated/server'
import type {Doc} from './_generated/dataModel'
import {boundedHistory,historyBudget,includeHistoryRow} from './portfolioHistory'
type ReadCtx=Pick<QueryCtx,'db'>
export const REQUIREMENT_LIMIT=20
export async function executionRequirements(ctx:ReadCtx,mission:Doc<'missions'>){
 const budget=historyBudget(),blockers:string[]=[],advisories:string[]=[]
 const cleanup=await ctx.db.query('resourceReleaseJobs').withIndex('by_mission',q=>q.eq('missionId',mission._id)).unique()
 if(cleanup&&cleanup.status!=='complete')return{dependencies:[] as Doc<'missionDependencies'>[],resources:[] as Doc<'missionResources'>[],resourceRows:[] as {key:string;mode:string;available:boolean;heldByMission?:Doc<'missions'>['_id']}[],blockers:['Resource cleanup is '+(cleanup.status==='pending'?'in progress; wait for completion.':'awaiting review; request cleanup again after reviewing the mission.')],advisories}
 const dependencies=await boundedHistory(ctx.db.query('missionDependencies').withIndex('by_mission',q=>q.eq('missionId',mission._id)),budget,REQUIREMENT_LIMIT)
 const resources=await boundedHistory(ctx.db.query('missionResources').withIndex('by_mission',q=>q.eq('missionId',mission._id)),budget,REQUIREMENT_LIMIT)
 const resourceRows:{key:string;mode:string;available:boolean;heldByMission?:Doc<'missions'>['_id']}[]=[]
 const exceeded=()=>{if(!blockers.includes('Execution blocked: dependency or resource evidence exceeds the bounded safety review. Existing records are retained.'))blockers.push('Execution blocked: dependency or resource evidence exceeds the bounded safety review. Existing records are retained.')}
 if(!budget.complete){exceeded();return{dependencies,resources,resourceRows,blockers,advisories}}
 for(const dep of dependencies){
  const prerequisite=await ctx.db.get(dep.dependsOnMissionId)
  if(prerequisite&&!includeHistoryRow(budget,prerequisite)){exceeded();break}
  if(!prerequisite||prerequisite.ownerKey!==mission.ownerKey){blockers.push('Execution blocked: a mission dependency is unavailable or access denied.');continue}
  if(dep.kind==='blocks'&&prerequisite.status!=='complete')blockers.push('Execution blocked by prerequisite mission '+prerequisite._id)
  else if(dep.kind==='informs'&&prerequisite.status!=='complete')advisories.push('An informing mission is not complete.')
 }
 if(!budget.complete){exceeded();return{dependencies,resources,resourceRows,blockers,advisories}}
 for(const resource of resources){
  const holders=await boundedHistory(ctx.db.query('missionResources').withIndex('by_resource_status',q=>q.eq('resourceKey',resource.resourceKey).eq('status','held')),budget,50)
  if(!budget.complete){exceeded();break}
  const conflict=holders.find(h=>h.missionId!==mission._id&&(h.mode==='exclusive'||resource.mode==='exclusive'))
  let heldByMission:Doc<'missions'>['_id']|undefined
  if(conflict){
   blockers.push('Execution blocked by resource conflict: '+resource.resourceKey)
   const holder=await ctx.db.get(conflict.missionId)
   if(holder&&!includeHistoryRow(budget,holder)){exceeded();break}
   if(holder?.ownerKey===mission.ownerKey)heldByMission=holder._id
  }
  resourceRows.push({key:resource.resourceKey,mode:resource.mode,available:!conflict,...(heldByMission?{heldByMission}:{})})
 }
 if(budget.complete){
  const escalated=await ctx.db.query('incidents').withIndex('by_mission_status',q=>q.eq('missionId',mission._id).eq('status','escalated')).first()
  if(escalated)blockers.push('Autonomous restart blocked: the '+escalated.stage.slice(0,160).replaceAll('_',' ')+' incident requires documented human review and resolution first.')
 }
 return{dependencies,resources,resourceRows,blockers,advisories}
}
