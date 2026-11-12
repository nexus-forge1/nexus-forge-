import {defineTable} from 'convex/server'
import {v,ConvexError} from 'convex/values'
export const graphKind=v.union(v.literal('source'),v.literal('claim'),v.literal('assumption'),v.literal('decision'),v.literal('experiment'),v.literal('observation'),v.literal('lesson'))
export const graphBasis=v.union(v.literal('observed'),v.literal('inferred'),v.literal('hypothesized'))
export const graphStatus=v.union(v.literal('unverified'),v.literal('reviewed'),v.literal('contested'),v.literal('retired'))
export const graphRelation=v.union(v.literal('supports'),v.literal('contradicts'),v.literal('questions'),v.literal('informs'),v.literal('tests'),v.literal('records'),v.literal('teaches'),v.literal('plans'))
export const graphFields={ownerKey:v.string(),projectId:v.id('studioProjects'),nodeKey:v.string(),kind:graphKind,revision:v.number(),statement:v.string(),scope:v.string(),basis:graphBasis,status:graphStatus,reviewOn:v.string(),sourceSnapshot:v.optional(v.string()),digest:v.string(),createdAt:v.number()}
export const edgeFields={ownerKey:v.string(),projectId:v.id('studioProjects'),fromId:v.id('graphEntries'),toId:v.id('graphEntries'),relation:graphRelation,rationale:v.string(),createdAt:v.number(),retiredAt:v.optional(v.number()),retirementReason:v.optional(v.string())}
export const evidenceGraphTables={
 graphEntries:defineTable(graphFields).index('by_project',['projectId']),
 graphEdges:defineTable(edgeFields).index('by_project',['projectId']),
}
export type Kind='source'|'claim'|'assumption'|'decision'|'experiment'|'observation'|'lesson'
export type Relation='supports'|'contradicts'|'questions'|'informs'|'tests'|'records'|'teaches'|'plans'
export type GraphEntry={_id:string;nodeKey:string;kind:Kind;revision:number;statement:string;basis:'observed'|'inferred'|'hypothesized';status:'unverified'|'reviewed'|'contested'|'retired';reviewOn:string;sourceSnapshot?:string}
export type GraphEdge={_id:string;fromId:string;toId:string;relation:Relation;retiredAt?:number}
export function validRelation(from:Kind,to:Kind,r:Relation){
 if(['supports','contradicts','questions'].includes(r))return['source','observation'].includes(from)&&['claim','assumption'].includes(to)
 if(r==='informs')return(from==='claim'&&to==='assumption')||(['claim','assumption','lesson'].includes(from)&&to==='decision')
 if(r==='tests')return['claim','assumption'].includes(from)&&to==='experiment'
 if(r==='records')return from==='experiment'&&to==='observation'
 if(r==='teaches')return from==='observation'&&to==='lesson'
 return r==='plans'&&from==='decision'&&to==='experiment'
}
export function validateReviewDate(value:string){
 if(!value)return ''
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new ConvexError('Use a real review date in YYYY-MM-DD form')
 return value
}
export function analyzeGraph(entries:GraphEntry[],edges:GraphEdge[],today:string){
 const latest=new Map<string,GraphEntry>(),byId=new Map(entries.map(n=>[n._id,n]))
 for(const n of entries)if(!latest.has(n.nodeKey)||latest.get(n.nodeKey)!.revision<n.revision)latest.set(n.nodeKey,n)
 const flags=new Map<string,Set<string>>([...latest.keys()].map(k=>[k,new Set<string>()]))
 const active=edges.filter(e=>e.retiredAt===undefined),links:{from:string;to:string}[]=[]
 let missingEndpoints=0
 for(const e of active){
  const from=byId.get(e.fromId),to=byId.get(e.toId)
  if(!from||!to){missingEndpoints++;continue}
  links.push({from:from.nodeKey,to:to.nodeKey})
  if(from.revision!==latest.get(from.nodeKey)?.revision||to.revision!==latest.get(to.nodeKey)?.revision)flags.get(to.nodeKey)!.add('A linked version changed; review the dependency')
  if(e.relation==='contradicts')flags.get(to.nodeKey)!.add('Contradicting evidence is recorded')
  if(e.relation==='questions')flags.get(to.nodeKey)!.add('Evidence remains unresolved')
 }
 for(const n of latest.values()){
  const f=flags.get(n.nodeKey)!
  if(n.sourceSnapshot){try{const s=JSON.parse(n.sourceSnapshot);if(s.type==='experiment-report'&&s.provenance==='controlled_fixture')f.add('Controlled fixture data is not customer outcome evidence')}catch{f.add('Source provenance is unreadable')}}
  if(n.kind!=='source'){
   if(n.status!=='reviewed')f.add('Assessment is '+n.status)
   if(n.basis!=='observed')f.add('Basis is '+n.basis)
   if(n.reviewOn&&n.reviewOn<today)f.add('Review date has passed')
  }else if(n.sourceSnapshot){
   try{if(JSON.parse(n.sourceSnapshot).basis==='saved_research')f.add('Source is a saved synthesis, not captured original text')}catch{f.add('Source provenance is unreadable')}
  }
  if(['claim','assumption'].includes(n.kind)&&!active.some(e=>e.toId===n._id&&e.relation==='supports'))f.add('No support is linked to this exact version')
 }
 const issues=[...latest.values()].map(n=>({nodeKey:n.nodeKey,reasons:[...flags.get(n.nodeKey)!]})).filter(r=>r.reasons.length>0)
 const decisions=[...latest.values()].filter(n=>n.kind==='decision').map(n=>{
  const affectedBy=new Set<string>()
  for(const issue of issues){
   const seen=new Set<string>([issue.nodeKey]),queue=[issue.nodeKey]
   while(queue.length){const key=queue.shift()!;for(const e of links)if(e.from===key&&!seen.has(e.to)){seen.add(e.to);queue.push(e.to)}}
   if(seen.has(n.nodeKey))affectedBy.add(issue.nodeKey)
  }
  return{nodeKey:n.nodeKey,affectedBy:[...affectedBy],reviewRequired:affectedBy.size>0||missingEndpoints>0}
 })
 return{issues,decisions,missingEndpoints}
}
