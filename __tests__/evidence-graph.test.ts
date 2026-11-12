// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import type {Doc} from '../convex/_generated/dataModel'
import {digest} from '../convex/studioModel'
import {analyzeGraph,validateReviewDate,type GraphEntry} from '../convex/evidenceGraphModel'
const modules=import.meta.glob('../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),ids=await t.run(async c=>({owner:await c.db.insert('users',{email:'graph-owner@example.test'}),other:await c.db.insert('users',{email:'graph-other@example.test'})}))
 const owner=t.withIdentity({subject:ids.owner}),other=t.withIdentity({subject:ids.other})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Graph fixture',brief:'Controlled graph provenance test.',audience:'Controlled audience',criteria:['Retain exact evidence and uncertainty'],budget:0})
 const project=await owner.mutation(api.studio.startProject,{templateId,title:'Graph project'})
 const documentId=await owner.mutation(api.studio.ingestText,{projectId:project.projectId,name:'source.txt',content:'Context line'+String.fromCharCode(10)+'Exact customer evidence for a controlled pilot'+String.fromCharCode(10)+'Contradicting observation'})
 const passageId=await owner.mutation(api.studio.pinPassage,{documentId,firstLine:2,lastLine:2})
 const sourceId=await owner.mutation(api.evidenceGraph.importSource,{projectId:project.projectId,passageId})
 const input={projectId:project.projectId,nodeKey:'claim',kind:'claim' as const,expectedRevision:0,statement:'A controlled customer will pay for this pilot.',scope:'Controlled pilot, October2026 only',basis:'observed' as const,status:'reviewed' as const,reviewOn:''}
 return{t,ids,owner,other,templateId,...project,documentId,passageId,sourceId,input}
}
describe('versioned evidence graph',()=>{
 it('denies anonymous, foreign-owner and foreign-project access before exposing evidence',async()=>{
  const f=await fixture()
  await expect(f.t.query(api.evidenceGraph.graph,{projectId:f.projectId})).rejects.toThrow(/Authenticated/)
  await expect(f.other.query(api.evidenceGraph.graph,{projectId:f.projectId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.evidenceGraph.save,f.input)).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.evidenceGraph.importSource,{projectId:f.projectId,passageId:f.passageId})).rejects.toThrow(/unavailable/)
  const p=await f.owner.mutation(api.studio.startProject,{templateId:f.templateId,title:'Another project'})
  await expect(f.owner.mutation(api.evidenceGraph.importSource,{projectId:p.projectId,passageId:f.passageId})).rejects.toThrow(/this project/)
  const claim=await f.owner.mutation(api.evidenceGraph.save,{...f.input,projectId:p.projectId})
  await expect(f.owner.mutation(api.evidenceGraph.connect,{projectId:f.projectId,fromId:f.sourceId,toId:claim,relation:'supports',rationale:'Cross-project attempt'})).rejects.toThrow(/this project/)
 })
 it('imports exact line passages and digests once, preserving the original snapshot',async()=>{
  const f=await fixture()
  expect(await f.owner.mutation(api.evidenceGraph.importSource,{projectId:f.projectId,passageId:f.passageId})).toBe(f.sourceId)
  const graph=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId}),s=graph.entries[0]
  expect(s.statement).toBe('Exact customer evidence for a controlled pilot')
  expect(JSON.parse(s.sourceSnapshot!)).toMatchObject({type:'document-passage',firstLine:2,lastLine:2,publicationDate:null})
  await f.t.run(c=>c.db.patch(f.documentId,{content:'Tampered source'}))
  await expect(f.owner.mutation(api.evidenceGraph.importSource,{projectId:f.projectId,passageId:f.passageId})).rejects.toThrow(/provenance/)
  expect((await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId})).entries[0].digest).toBe(s.digest)
  await expect(f.owner.mutation(api.evidenceGraph.save,{...f.input,kind:'source'})).rejects.toThrow(/Import sources/)
 })
 it('preserves research summary basis and the original claim/finding on links',async()=>{
  const f=await fixture(),excerpt='Exact research excerpt for a controlled claim.',citation='https://example.test/research'
  const researchId=await f.t.run(c=>c.db.insert('research',{missionId:f.missionId,query:'Controlled question',result:excerpt,citations:[citation],createdAt:Date.now()}))
  const reviewId=await f.owner.mutation(api.researchClaims.record,{missionId:f.missionId,researchId,claim:f.input.statement,finding:'contradicting',citation,excerpt,rationale:'The controlled excerpt is assessed as contradictory.'})
  const fromId=await f.owner.mutation(api.evidenceGraph.importSource,{projectId:f.projectId,reviewId}),toId=await f.owner.mutation(api.evidenceGraph.save,f.input)
  await expect(f.owner.mutation(api.evidenceGraph.connect,{projectId:f.projectId,fromId,toId,relation:'supports',rationale:'Cannot flip the original finding'})).rejects.toThrow(/original research review/)
  await f.owner.mutation(api.evidenceGraph.connect,{projectId:f.projectId,fromId,toId,relation:'contradicts',rationale:'Preserve the controlled review'})
  const g=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId}),s=g.entries.find(n=>n._id===fromId)!
  expect(JSON.parse(s.sourceSnapshot!)).toMatchObject({basis:'saved_research',finding:'contradicting',reviewedClaim:f.input.statement})
  expect(g.analysis.issues.find(i=>i.nodeKey===s.nodeKey)?.reasons.join(' ')).toMatch(/synthesis/)
 })
 it('retains captured publication declarations and rejects corrupted text hashes',async()=>{
  const f=await fixture(),text='Captured original fixture text for the stated claim.',hash=await digest(text),citation='https://example.test/original'
  const researchId=await f.t.run(c=>c.db.insert('research',{missionId:f.missionId,query:'Fixture capture',result:'Summary differs',citations:[citation],createdAt:Date.now()}))
  const snapshot={finalUrl:citation,contentType:'text/html',httpStatus:200,title:'Fixture',extractedText:text,textTruncated:false,bodyBytes:100,bodyLimitReached:false,bodySha256:hash,textSha256:hash,capturedAt:Date.now(),publicationStatus:'declared' as const,publicationDate:'2026-10-01T00:00:00.000Z',dateDeclarations:[{field:'article:published_time',value:'2026-10-01'}]}
  const sourceCaptureId=await f.t.run(c=>c.db.insert('researchSourceCaptures',{missionId:f.missionId,researchId,ownerKey:f.ids.owner,citation,status:'captured',createdAt:Date.now(),snapshot}))
  const reviewId=await f.owner.mutation(api.researchClaims.record,{missionId:f.missionId,researchId,claim:f.input.statement,finding:'supporting',citation,excerpt:text,rationale:'A controlled source-backed review.',sourceCaptureId})
  const id=await f.owner.mutation(api.evidenceGraph.importSource,{projectId:f.projectId,reviewId}),g=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId})
  expect(JSON.parse(g.entries.find(n=>n._id===id)!.sourceSnapshot!)).toMatchObject({basis:'retrieved_source',publicationStatus:'declared',publicationDate:snapshot.publicationDate,sourceTextSha256:hash})
  await f.t.run(c=>c.db.patch(sourceCaptureId,{snapshot:{...snapshot,extractedText:text+' tampered'}}))
  await expect(f.owner.mutation(api.evidenceGraph.importSource,{projectId:f.projectId,reviewId})).rejects.toThrow(/digest mismatch/)
 })
 it('freezes versions with exact retry, stale-edit rejection and immutable node kinds',async()=>{
  const f=await fixture(),id=await f.owner.mutation(api.evidenceGraph.save,f.input)
  expect(await f.owner.mutation(api.evidenceGraph.save,f.input)).toBe(id)
  await expect(f.owner.mutation(api.evidenceGraph.save,{...f.input,statement:'Changed claim'})).rejects.toThrow(/changed/)
  await f.owner.mutation(api.evidenceGraph.save,{...f.input,expectedRevision:1,status:'contested'})
  await expect(f.owner.mutation(api.evidenceGraph.save,{...f.input,kind:'decision',expectedRevision:2})).rejects.toThrow(/kind/)
  const g=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId})
  expect(g.entries.filter(n=>n.nodeKey==='claim').map(n=>n.revision)).toEqual([2,1])
  expect(g.entries.find(n=>n._id===id)?.status).toBe('reviewed')
 })
 it('propagates contradictions to dependent decisions and preserves retired review history',async()=>{
  const f=await fixture(),claim=await f.owner.mutation(api.evidenceGraph.save,f.input),decision=await f.owner.mutation(api.evidenceGraph.save,{...f.input,nodeKey:'decision',kind:'decision',statement:'Proceed with a bounded validation pilot.'})
  const link={projectId:f.projectId,fromId:f.sourceId,toId:claim,relation:'supports' as const,rationale:'Controlled source supports the exact scoped claim'}
  const id=await f.owner.mutation(api.evidenceGraph.connect,link)
  expect(await f.owner.mutation(api.evidenceGraph.connect,link)).toBe(id)
  await f.owner.mutation(api.evidenceGraph.connect,{projectId:f.projectId,fromId:claim,toId:decision,relation:'informs',rationale:'This decision depends on the claim'})
  expect((await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId})).analysis.decisions[0].reviewRequired).toBe(false)
  const edgeId=await f.owner.mutation(api.evidenceGraph.connect,{...link,relation:'contradicts',rationale:'A second contradictory assessment is retained'})
  const g=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId})
  expect(g.analysis.decisions[0]).toMatchObject({reviewRequired:true,affectedBy:['claim']})
  const retire={projectId:f.projectId,edgeId,reason:'Superseded by a recorded review of this fixture'}
  await f.owner.mutation(api.evidenceGraph.retireLink,retire);await f.owner.mutation(api.evidenceGraph.retireLink,retire)
  await expect(f.owner.mutation(api.evidenceGraph.retireLink,{...retire,reason:'Rewrite history'})).rejects.toThrow(/frozen/)
  const next=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId})
  expect(next.analysis.decisions[0].reviewRequired).toBe(false);expect(next.edges).toHaveLength(3);expect(next.edges.find(e=>e._id===edgeId)?.retirementReason).toBe(retire.reason)
  await expect(f.other.mutation(api.evidenceGraph.retireLink,retire)).rejects.toThrow(/unavailable/)
 })
 it('flags exact-version drift instead of silently retargeting old evidence',async()=>{
  const f=await fixture(),claim=await f.owner.mutation(api.evidenceGraph.save,f.input),decision=await f.owner.mutation(api.evidenceGraph.save,{...f.input,nodeKey:'decision',kind:'decision'})
  await f.owner.mutation(api.evidenceGraph.connect,{projectId:f.projectId,fromId:f.sourceId,toId:claim,relation:'supports',rationale:'Support v1'})
  await f.owner.mutation(api.evidenceGraph.connect,{projectId:f.projectId,fromId:claim,toId:decision,relation:'informs',rationale:'Decision uses v1'})
  await f.owner.mutation(api.evidenceGraph.save,{...f.input,expectedRevision:1,statement:'A different scoped claim now needs new support.'})
  const g=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId})
  expect(g.edges.some(e=>e.toId===claim)).toBe(true)
  expect(g.analysis.issues.find(i=>i.nodeKey==='decision')?.reasons.join(' ')).toMatch(/version changed/)
  expect(g.analysis.decisions[0].reviewRequired).toBe(true)
  await expect(f.owner.mutation(api.evidenceGraph.connect,{projectId:f.projectId,fromId:claim,toId:decision,relation:'informs',rationale:'New stale link'})).rejects.toThrow(/current/)
  await expect(f.owner.mutation(api.evidenceGraph.connect,{projectId:f.projectId,fromId:decision,toId:f.sourceId,relation:'supports',rationale:'Invalid type'})).rejects.toThrow(/typed/)
 })
 it('validates real review dates, empty text, unique keys and credential-like payloads',async()=>{
  const f=await fixture()
  expect(validateReviewDate('2026-10-01')).toBe('2026-10-01')
  for(const date of ['2026-02-30','not-a-date','2026-1-01'])expect(()=>validateReviewDate(date)).toThrow(/real review date/)
  await expect(f.owner.mutation(api.evidenceGraph.save,{...f.input,statement:''})).rejects.toThrow(/Statement/)
  await expect(f.owner.mutation(api.evidenceGraph.save,{...f.input,nodeKey:'Bad Key'})).rejects.toThrow(/lowercase/)
  await expect(f.owner.mutation(api.evidenceGraph.save,{...f.input,statement:'sk_live_'+'a'.repeat(30)})).rejects.toThrow(/credential/)
  await f.owner.mutation(api.evidenceGraph.save,{...f.input,status:'reviewed',basis:'hypothesized',reviewOn:'2000-01-01'})
  const g=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId})
  expect(g.analysis.issues.find(i=>i.nodeKey==='claim')?.reasons.join(' ')).toMatch(/hypothesized/);expect(g.analysis.issues.find(i=>i.nodeKey==='claim')?.reasons.join(' ')).toMatch(/date has passed/)
 })
 it('bounds traversal through feedback cycles and flags missing endpoints conservatively',()=>{
  const node=(key:string,kind:GraphEntry['kind'],status:GraphEntry['status']='reviewed'):GraphEntry=>({_id:key,nodeKey:key,kind,revision:1,statement:key,basis:'observed',status,reviewOn:''})
  const nodes=[node('d','decision'),node('x','experiment'),node('o','observation','unverified'),node('l','lesson')]
  const edges=[{_id:'1',fromId:'d',toId:'x',relation:'plans' as const},{_id:'2',fromId:'x',toId:'o',relation:'records' as const},{_id:'3',fromId:'o',toId:'l',relation:'teaches' as const},{_id:'4',fromId:'l',toId:'d',relation:'informs' as const}]
  expect(analyzeGraph(nodes,edges,'2026-10-19').decisions[0]).toMatchObject({reviewRequired:true,affectedBy:['o']})
  expect(analyzeGraph([node('d','decision')],[{_id:'bad',fromId:'missing',toId:'d',relation:'informs'}],'2026-10-19')).toMatchObject({missingEndpoints:1,decisions:[{reviewRequired:true}]})
 })
 it('retains admission limits while allowing exact replay without provider or billing writes',async()=>{
  const f=await fixture(),id=await f.owner.mutation(api.evidenceGraph.save,f.input)
  const row=await f.t.run(c=>c.db.get(id)) as Doc<'graphEntries'>|null
  await f.t.run(async c=>{const {_id,_creationTime,...data}=row!;for(let i=2;i<=10;i++)await c.db.insert('graphEntries',{...data,revision:i,digest:'retained-'+i})})
  await expect(f.owner.mutation(api.evidenceGraph.save,{...f.input,expectedRevision:10})).rejects.toThrow(/10-revision/)
  expect(await f.owner.mutation(api.evidenceGraph.save,f.input)).toBe(id)
  await f.t.run(async c=>{const {_id,_creationTime,...data}=row!;for(let i=0;i<28;i++)await c.db.insert('graphEntries',{...data,nodeKey:'retained-'+i})})
  await expect(f.owner.mutation(api.evidenceGraph.save,{...f.input,nodeKey:'over'})).rejects.toThrow(/30-node/)
  expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toEqual([])
  expect(await f.t.run(c=>c.db.query('billingAccounts').collect())).toEqual([])
 })
})
