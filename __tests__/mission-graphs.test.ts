// @vitest-environment edge-runtime
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import {validateGraph,type GraphDesign,type StepResult} from '../convex/missionGraphModel'
import {graphTemplate,defaultGraphLimits} from '../src/lib/mission-graph-templates'
const modules=import.meta.glob('../convex/**/*.ts'),clock=Date.UTC(2026,9,19,2)
const design:GraphDesign={graphKey:'fixture',title:'Controlled research graph',objective:'Check supplied-result graph behavior without inference.',missionType:'research',nodes:graphTemplate('research'),limits:{...defaultGraphLimits}}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(clock)})
afterEach(()=>vi.useRealTimers())
async function fixture(){
 const t=convexTest(schema,modules),ids=await t.run(async c=>({owner:await c.db.insert('users',{email:'graph-runtime-owner@example.test'}),other:await c.db.insert('users',{email:'graph-runtime-other@example.test'})}))
 const owner=t.withIdentity({subject:ids.owner}),other=t.withIdentity({subject:ids.other})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Graph rehearsal fixture',brief:'Rehearse bounded typed handoffs.',audience:'Controlled fixture',criteria:['Stop on insufficient evidence'],budget:0})
 const project=await owner.mutation(api.studio.startProject,{templateId,title:'Graph fixture project'}),args={projectId:project.projectId,expectedRevision:0,...design}
 const graphId=await owner.mutation(api.missionGraphs.create,args),startArgs={graphId,runKey:'baseline',basis:'controlled_fixture' as const,replanReason:''},runId=await owner.mutation(api.missionGraphs.start,startArgs)
 return{t,owner,other,...project,templateId,args,graphId,startArgs,runId}
}
function result(nodeKey='research',changes:Partial<StepResult>={}):StepResult{return{nodeKey,status:'complete',outputKind:nodeKey==='research'?'evidence':nodeKey==='audit'?'verification':'decision',summary:'Authored controlled fixture handoff; no independently verified outcome.',evidenceRefs:['fixture:authored-reference'],toolCalls:1,tokens:20,...changes}}
describe('bounded mission graphs',()=>{
 it('validates distinct mission-specific templates and preserves typed parallel branches',()=>{
  for(const missionType of ['research','build','growth','incident'] as const)expect(validateGraph({...design,missionType,nodes:graphTemplate(missionType)}).nodes.length).toBeGreaterThan(2)
  const build=graphTemplate('build');expect(build.find(n=>n.key==='build')!.dependsOn).toEqual(['architecture','ux'])
 })
 it('rejects cycles, missing dependencies, unmatched types and unreviewed decisions',()=>{
  const cycle=graphTemplate('research');cycle[0]={...cycle[0],dependsOn:['audit'],inputKinds:['verification']}
  expect(()=>validateGraph({...design,nodes:cycle})).toThrow(/acyclic/)
  const missing=graphTemplate('research');missing[1].dependsOn=['absent'];expect(()=>validateGraph({...design,nodes:missing})).toThrow(/existing/)
  const typed=graphTemplate('research');typed[1].inputKinds=['plan'];expect(()=>validateGraph({...design,nodes:typed})).toThrow(/Input kinds/)
  const verification=graphTemplate('research');verification[1].outputKind='analysis';verification[2].inputKinds=['evidence','analysis'];expect(()=>validateGraph({...design,nodes:verification})).toThrow(/verification/)
  const unconnected=graphTemplate('research');unconnected.push({key:'orphan',specialist:'Unused',dependsOn:[],inputKinds:['brief'],outputKind:'analysis',acceptance:'Not connected'});expect(()=>validateGraph({...design,nodes:unconnected})).toThrow(/Every node/)
 })
 it('rejects duplicate keys and invalid or unbounded limits',()=>{
  const nodes=graphTemplate('research');nodes[1].key=nodes[0].key;expect(()=>validateGraph({...design,nodes})).toThrow(/distinct/)
  for(const limits of [{maxSteps:2},{maxTokens:Infinity},{maxToolCalls:-1},{parallelism:5},{maxReplans:4},{maxWallSeconds:29}])expect(()=>validateGraph({...design,limits:{...design.limits,...limits}})).toThrow()
 })
 it('isolates every graph and rehearsal operation by authenticated owner',async()=>{
  const f=await fixture()
  await expect(f.t.query(api.missionGraphs.list,{projectId:f.projectId})).rejects.toThrow(/Authenticated/)
  await expect(f.other.query(api.missionGraphs.runs,{graphId:f.graphId})).rejects.toThrow(/unavailable/)
  await expect(f.other.query(api.missionGraphs.detail,{runId:f.runId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.missionGraphs.create,f.args)).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.missionGraphs.recordWave,{runId:f.runId,batchKey:'foreign',results:[result()]})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.missionGraphs.stop,{runId:f.runId,reason:'Foreign stop'})).rejects.toThrow(/unavailable/)
 })
 it('freezes versions and idempotent starts while refusing changed retries',async()=>{
  const f=await fixture()
  expect(await f.owner.mutation(api.missionGraphs.create,f.args)).toBe(f.graphId)
  expect(await f.owner.mutation(api.missionGraphs.start,f.startArgs)).toBe(f.runId)
  await expect(f.owner.mutation(api.missionGraphs.create,{...f.args,title:'Conflicting version'})).rejects.toThrow(/changed/)
  await expect(f.owner.mutation(api.missionGraphs.start,{...f.startArgs,basis:'operator_reported'})).rejects.toThrow(/different immutable/)
  const next=await f.owner.mutation(api.missionGraphs.create,{...f.args,expectedRevision:1,title:'Successor graph'});expect(next).not.toBe(f.graphId)
  expect((await f.owner.query(api.missionGraphs.list,{projectId:f.projectId})).map(g=>g.revision)).toEqual([2,1])
 })
 it('enforces dependency barriers, exact output kinds and immutable wave retries',async()=>{
  const f=await fixture(),wave={runId:f.runId,batchKey:'wave1',results:[result()]}
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{...wave,results:[result('audit')]})).rejects.toThrow(/currently ready/)
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{...wave,results:[result(),result('audit')]})).rejects.toThrow(/currently ready/)
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{...wave,results:[result('research',{outputKind:'plan'})]})).rejects.toThrow(/kind/)
  const id=await f.owner.mutation(api.missionGraphs.recordWave,wave);expect(await f.owner.mutation(api.missionGraphs.recordWave,wave)).toBe(id)
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{...wave,results:[result('research',{summary:'Changed response'})]})).rejects.toThrow(/different immutable/)
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{...wave,batchKey:'duplicate-node'})).rejects.toThrow(/currently ready/)
  const d=await f.owner.query(api.missionGraphs.detail,{runId:f.runId});expect(d.assessment.ready).toEqual(['audit']);expect(d.batches).toHaveLength(1)
 })
 it('allows independent branches together and refuses missing verification references',async()=>{
  const f=await fixture(),graphId=await f.owner.mutation(api.missionGraphs.create,{...f.args,graphKey:'build',missionType:'build',nodes:graphTemplate('build')}),runId=await f.owner.mutation(api.missionGraphs.start,{...f.startArgs,graphId})
  await f.owner.mutation(api.missionGraphs.recordWave,{runId,batchKey:'plan',results:[result('plan',{outputKind:'plan'})]})
  expect((await f.owner.query(api.missionGraphs.detail,{runId})).assessment.nextWave).toEqual(['architecture','ux'])
  await f.owner.mutation(api.missionGraphs.recordWave,{runId,batchKey:'parallel',results:[result('architecture',{outputKind:'analysis'}),result('ux',{outputKind:'analysis'})]})
  expect((await f.owner.query(api.missionGraphs.detail,{runId})).assessment.ready).toEqual(['build'])
  await f.owner.mutation(api.missionGraphs.recordWave,{runId,batchKey:'build',results:[result('build',{outputKind:'implementation'})]})
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{runId,batchKey:'verify',results:[result('verify',{outputKind:'verification',evidenceRefs:[]})]})).rejects.toThrow(/references/)
 })
 it('stops on insufficient or blocked evidence without completing downstream nodes',async()=>{
  for(const status of ['insufficient','blocked'] as const){
   const f=await fixture()
   await f.owner.mutation(api.missionGraphs.recordWave,{runId:f.runId,batchKey:'stop',results:[result('research',{status})]})
   const d=await f.owner.query(api.missionGraphs.detail,{runId:f.runId});expect(d.assessment).toMatchObject({status:'stopped',completed:0,ready:[]});expect(d.assessment.reason).toContain(status)
   await expect(f.owner.mutation(api.missionGraphs.recordWave,{runId:f.runId,batchKey:'bypass',results:[result('audit')]})).rejects.toThrow(/stopped/)
  }
 })
 it('enforces aggregate wave budgets atomically without partial saves',async()=>{
  const f=await fixture(),graphId=await f.owner.mutation(api.missionGraphs.create,{...f.args,graphKey:'tight',limits:{...design.limits,maxToolCalls:1,maxTokens:10}}),runId=await f.owner.mutation(api.missionGraphs.start,{...f.startArgs,graphId})
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{runId,batchKey:'over',results:[result()]})).rejects.toThrow(/budgets/)
  let d=await f.owner.query(api.missionGraphs.detail,{runId});expect(d.batches).toEqual([]);expect(d.run.usedSteps).toBe(0)
  await f.owner.mutation(api.missionGraphs.recordWave,{runId,batchKey:'fit',results:[result('research',{tokens:10})]})
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{runId,batchKey:'too-many-calls',results:[result('audit',{tokens:0})]})).rejects.toThrow(/budgets/)
  d=await f.owner.query(api.missionGraphs.detail,{runId});expect(d.run).toMatchObject({usedSteps:1,usedToolCalls:1,usedTokens:10})
 })
 it('carries original deadline and cumulative usage through one successor and forbids forks',async()=>{
  const f=await fixture();await f.owner.mutation(api.missionGraphs.recordWave,{runId:f.runId,batchKey:'failed',results:[result('research',{status:'blocked',tokens:30})]})
  vi.setSystemTime(clock+1000)
  const args={...f.startArgs,runKey:'successor',parentRunId:f.runId,replanReason:'Change analysis after missing evidence.'},child=await f.owner.mutation(api.missionGraphs.start,args)
  expect(await f.owner.mutation(api.missionGraphs.start,args)).toBe(child)
  const d=await f.owner.query(api.missionGraphs.detail,{runId:child});expect(d.run).toMatchObject({depth:1,startedAt:clock,usedSteps:1,usedTokens:30,usedToolCalls:1});expect(d.assessment.ready).toEqual(['research'])
  await expect(f.owner.mutation(api.missionGraphs.start,{...args,runKey:'fork'})).rejects.toThrow(/successor/)
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{runId:f.runId,batchKey:'revive',results:[result()]})).rejects.toThrow(/stopped/)
 })
 it('prevents replan budget resets, changed provenance, cross-project parents and exhausted depth',async()=>{
  const f=await fixture();await f.owner.mutation(api.missionGraphs.stop,{runId:f.runId,reason:'Missing evidence'})
  const next=await f.owner.mutation(api.missionGraphs.create,{...f.args,expectedRevision:1,limits:{...design.limits,maxTokens:20000}})
  const args={...f.startArgs,runKey:'successor',parentRunId:f.runId,replanReason:'New strategy'}
  await expect(f.owner.mutation(api.missionGraphs.start,{...args,graphId:next})).rejects.toThrow(/preserve original limits/)
  await expect(f.owner.mutation(api.missionGraphs.start,{...args,basis:'operator_reported'})).rejects.toThrow(/provenance/)
  const p=await f.owner.mutation(api.studio.startProject,{templateId:f.templateId,title:'Other project'}),otherGraph=await f.owner.mutation(api.missionGraphs.create,{...f.args,projectId:p.projectId})
  await expect(f.owner.mutation(api.missionGraphs.start,{...args,graphId:otherGraph})).rejects.toThrow(/same project/)
  const child=await f.owner.mutation(api.missionGraphs.start,args);await f.owner.mutation(api.missionGraphs.stop,{runId:child,reason:'Still missing'})
  const grandchild=await f.owner.mutation(api.missionGraphs.start,{...args,runKey:'grandchild',parentRunId:child});await f.owner.mutation(api.missionGraphs.stop,{runId:grandchild,reason:'Insufficient again'})
  await expect(f.owner.mutation(api.missionGraphs.start,{...args,runKey:'too-deep',parentRunId:grandchild})).rejects.toThrow(/Replan limit/)
 })
 it('enforces actual elapsed deadlines and allows only exact retries of retained waves afterwards',async()=>{
  const f=await fixture(),wave={runId:f.runId,batchKey:'saved',results:[result()]};await f.owner.mutation(api.missionGraphs.recordWave,wave)
  vi.setSystemTime(clock+design.limits.maxWallSeconds*1000)
  const d=await f.owner.query(api.missionGraphs.detail,{runId:f.runId});expect(d.assessment).toMatchObject({status:'stopped',reason:'Wall-clock limit reached',ready:[]})
  expect(await f.owner.mutation(api.missionGraphs.recordWave,wave)).toBe(d.batches[0]._id)
  await expect(f.owner.mutation(api.missionGraphs.recordWave,{runId:f.runId,batchKey:'late',results:[result('audit')]})).rejects.toThrow(/Wall-clock/)
  await expect(f.owner.mutation(api.missionGraphs.start,{...f.startArgs,runKey:'late-successor',parentRunId:f.runId,replanReason:'Try again'})).rejects.toThrow(/deadline/)
 })
 it('completes only all supplied handoffs and never approves or executes the linked mission',async()=>{
  const f=await fixture()
  for(const key of ['research','audit','decision'])await f.owner.mutation(api.missionGraphs.recordWave,{runId:f.runId,batchKey:key,results:[result(key)]})
  const d=await f.owner.query(api.missionGraphs.detail,{runId:f.runId});expect(d.assessment).toMatchObject({status:'complete',completed:3,ready:[]});expect(d.assessment.reason).toMatch(/human review/)
  await expect(f.owner.mutation(api.missionGraphs.stop,{runId:f.runId,reason:'Change frozen completion'})).rejects.toThrow(/immutable/)
  await expect(f.owner.mutation(api.missionGraphs.start,{...f.startArgs,runKey:'completed-replan',parentRunId:f.runId,replanReason:'Change'})).rejects.toThrow(/stopped/)
  expect(await f.t.run(c=>c.db.get(f.missionId))).toMatchObject({approved:false})
  for(const table of ['providerInvocations','agentRuns','billingAccounts'] as const)expect(await f.t.run(c=>c.db.query(table).collect())).toEqual([])
 })
 it('retains capped histories while still accepting exact retries',async()=>{
  const f=await fixture(),d=await f.owner.query(api.missionGraphs.detail,{runId:f.runId})
  await f.t.run(async c=>{const {_id,_creationTime,...data}=d.run;for(let i=0;i<9;i++)await c.db.insert('missionGraphRuns',{...data,runKey:'retained-'+i})})
  await expect(f.owner.mutation(api.missionGraphs.start,{...f.startArgs,runKey:'overflow'})).rejects.toThrow(/10 rehearsals/)
  expect(await f.owner.mutation(api.missionGraphs.start,f.startArgs)).toBe(f.runId)
  await f.t.run(async c=>{const {_id,_creationTime,...data}=d.graph;for(let i=0;i<19;i++)await c.db.insert('missionGraphs',{...data,graphKey:'retained-'+i})})
  await expect(f.owner.mutation(api.missionGraphs.create,{...f.args,graphKey:'overflow'})).rejects.toThrow(/20 graph/)
  expect(await f.owner.mutation(api.missionGraphs.create,f.args)).toBe(f.graphId)
 })
})
