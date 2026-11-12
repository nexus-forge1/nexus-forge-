// @vitest-environment edge-runtime
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import type {Doc} from '../convex/_generated/dataModel'
import {assessExperiment,type ExperimentDesign} from '../convex/experimentModel'
import {digest} from '../convex/studioModel'
const modules=import.meta.glob('../convex/**/*.ts'),clock=Date.UTC(2026,9,19,1)
const design:ExperimentDesign={contractKey:'pilot',title:'Controlled pilot',hypothesis:'A demo improves qualified signups.',population:'Eligible visitors to a controlled pilot',baselineDescription:'Existing page; qualified signups per100 eligible visitors',intervention:'Show a recovery demo',comparison:'randomized',allocation:'Random assignment at visitor level with fixed arms',metric:'Qualified signup rate',unit:'percent',direction:'higher',targetDelta:1,minimumSamples:2,minimumPopulation:10,windowStart:clock+60000,windowEnd:clock+120000,guardrails:[{key:'performance',metric:'Page load',unit:'ms',direction:'at_most',limit:2000}],stopCondition:'Stop if load exceeds2seconds',confoundPlan:'Freeze other changes and record any exceptions'}
const measurement={caseKey:'segment-1',cohort:'Distinct controlled cohort1',baseline:2,candidate:5,baselinePopulation:10,candidatePopulation:10,periodStart:design.windowStart,periodEnd:design.windowEnd,complete:true,stopTriggered:false,stopNote:'',allocationFollowed:true,independentUnits:true,concurrentChanges:'',guardrailValues:[{key:'performance',value:1000}],evidence:'https://example.test/controlled-fixture',digest:'a'.repeat(64),basis:'operator_reported' as const}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(clock)})
afterEach(()=>vi.useRealTimers())
async function fixture(overrides:Partial<ExperimentDesign>={}){
 const t=convexTest(schema,modules),ids=await t.run(async c=>({owner:await c.db.insert('users',{email:'experiment-owner@example.test'}),other:await c.db.insert('users',{email:'experiment-other@example.test'})}))
 const owner=t.withIdentity({subject:ids.owner}),other=t.withIdentity({subject:ids.other})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Experiment fixture',brief:'Retain controlled experiment evidence.',audience:'Controlled pilot',criteria:['Negative results remain visible'],budget:0})
 const project=await owner.mutation(api.studio.startProject,{templateId,title:'Experiment project'}),args={projectId:project.projectId,expectedRevision:0,...design,...overrides}
 const contractId=await owner.mutation(api.experiments.create,args)
 return{t,ids,owner,other,templateId,...project,args,contractId}
}
describe('experiment contracts',()=>{
 it('isolates design, observation, final review and graph imports by owner/project',async()=>{
  const f=await fixture()
  await expect(f.t.query(api.experiments.list,{projectId:f.projectId})).rejects.toThrow(/Authenticated/)
  await expect(f.other.query(api.experiments.detail,{contractId:f.contractId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.experiments.record,{contractId:f.contractId,...measurement})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.experiments.close,{contractId:f.contractId,rationale:'Foreign review'})).rejects.toThrow(/unavailable/)
  vi.setSystemTime(clock+180000)
  const reportId=await f.owner.mutation(api.experiments.record,{contractId:f.contractId,...measurement})
  const p=await f.owner.mutation(api.studio.startProject,{templateId:f.templateId,title:'Different owned project'})
  await expect(f.owner.mutation(api.evidenceGraph.importExperimentReport,{projectId:p.projectId,reportId})).rejects.toThrow(/this project/)
 })
 it('creates one existing scientific protocol atomically and reuses exact registration retries',async()=>{
  const f=await fixture()
  expect(await f.owner.mutation(api.experiments.create,f.args)).toBe(f.contractId)
  const d=await f.owner.query(api.experiments.detail,{contractId:f.contractId})
  expect(d.contract).toMatchObject({revision:1,ruleVersion:'experiment-rules-v1',status:'registered'})
  expect(d.contract.designDigest).toMatch(/^[a-f0-9]{64}$/)
  expect(await f.t.run(c=>c.db.query('labProtocols').collect())).toHaveLength(1)
  await expect(f.owner.mutation(api.experiments.create,{...f.args,hypothesis:'Changed hypothesis'})).rejects.toThrow(/changed/)
  const next=await f.owner.mutation(api.experiments.create,{...f.args,expectedRevision:1,hypothesis:'A different preregistered hypothesis'})
  expect(next).not.toBe(f.contractId);expect(await f.t.run(c=>c.db.query('labProtocols').collect())).toHaveLength(2)
 })
 it('rejects retrospective or invalid registration but permits exact retry after the window',async()=>{
  const f=await fixture()
  for(const change of [{windowStart:clock-1},{windowEnd:design.windowStart},{guardrails:[]},{guardrails:[design.guardrails[0],design.guardrails[0]]},{minimumSamples:1},{minimumPopulation:0},{targetDelta:-1}]){
   await expect(f.owner.mutation(api.experiments.create,{...f.args,contractKey:'invalid',...change})).rejects.toThrow()
  }
  vi.setSystemTime(clock+180000)
  expect(await f.owner.mutation(api.experiments.create,f.args)).toBe(f.contractId)
  expect(await f.t.run(c=>c.db.query('labProtocols').collect())).toHaveLength(1)
 })
 it('retains numeric target results without claiming a causal conclusion',async()=>{
  const f=await fixture();vi.setSystemTime(clock+180000)
  const a={contractId:f.contractId,...measurement},id=await f.owner.mutation(api.experiments.record,a)
  expect(await f.owner.mutation(api.experiments.record,a)).toBe(id)
  await f.owner.mutation(api.experiments.record,{...a,caseKey:'segment-2',cohort:'Distinct controlled cohort2',candidate:4})
  const d=await f.owner.query(api.experiments.detail,{contractId:f.contractId})
  expect(d.assessment).toMatchObject({meanChange:2.5,observedTargetMet:true,disposition:'target_met',causalConclusion:'not_established',paired:2})
  expect(await f.t.run(c=>c.db.query('labTrials').collect())).toHaveLength(2)
 })
 it('retains missing metrics/guardrails and fixture/confounded observations as inconclusive',async()=>{
  const f=await fixture();vi.setSystemTime(clock+180000)
  const {candidate,...partial}=measurement
  await f.owner.mutation(api.experiments.record,{contractId:f.contractId,...partial,complete:false,basis:'controlled_fixture',allocationFollowed:false,independentUnits:false,concurrentChanges:'Pricing changed concurrently',guardrailValues:[{key:'performance',value:null}]})
  const d=await f.owner.query(api.experiments.detail,{contractId:f.contractId})
  expect(d.assessment.disposition).toBe('inconclusive')
  expect(d.assessment.limitations.join(' ')).toMatch(/missing|incomplete/)
  expect(d.assessment.limitations.join(' ')).toMatch(/fixture/);expect(d.assessment.limitations.join(' ')).toMatch(/confound/)
  expect(d.reports).toHaveLength(1);expect(d.reports[0].candidate).toBeUndefined()
  expect(await f.t.run(c=>c.db.query('labTrials').collect())).toEqual([])
 })
 it('keeps observational comparisons and outside-window results inconclusive',async()=>{
  const f=await fixture({comparison:'before_after'});vi.setSystemTime(clock+180000)
  await f.owner.mutation(api.experiments.record,{contractId:f.contractId,...measurement,periodStart:clock-1000})
  await f.owner.mutation(api.experiments.record,{contractId:f.contractId,...measurement,caseKey:'other',cohort:'Distinct other cohort'})
  const d=await f.owner.query(api.experiments.detail,{contractId:f.contractId})
  expect(d.assessment).toMatchObject({disposition:'inconclusive',observedTargetMet:true,causalConclusion:'not_established'})
  expect(d.assessment.limitations.join(' ')).toMatch(/Observational/);expect(d.assessment.limitations.join(' ')).toMatch(/outside/)
 })
 it('prioritizes guardrail stops and freezes an early final review without discarding evidence',async()=>{
  const f=await fixture();vi.setSystemTime(clock+90000)
  const a={contractId:f.contractId,...measurement,periodEnd:clock+89000,guardrailValues:[{key:'performance',value:2500}]}
  const id=await f.owner.mutation(api.experiments.record,a)
  const d=await f.owner.query(api.experiments.detail,{contractId:f.contractId})
  expect(d.assessment).toMatchObject({disposition:'stop_review',windowEnded:false,eligibleForFinalReview:true})
  const close={contractId:f.contractId,rationale:'Preserve the failed performance guardrail and stop for review.'}
  await f.owner.mutation(api.experiments.close,close);await f.owner.mutation(api.experiments.close,close)
  await expect(f.owner.mutation(api.experiments.close,{...close,rationale:'Replace final review'})).rejects.toThrow(/frozen/)
  expect(await f.owner.mutation(api.experiments.record,a)).toBe(id)
  await expect(f.owner.mutation(api.experiments.record,{...a,caseKey:'new',cohort:'New'})).rejects.toThrow(/closed/)
  const final=await f.owner.query(api.experiments.detail,{contractId:f.contractId})
  expect(JSON.parse(final.contract.closingSummary!)).toMatchObject({disposition:'stop_review',causalConclusion:'not_established'})
  expect(await f.t.run(c=>c.db.get(final.contract.protocolId))).toMatchObject({status:'closed'})
 })
 it('allows negative or empty final reviews after the window and refuses premature closure',async()=>{
  const f=await fixture()
  await expect(f.owner.mutation(api.experiments.close,{contractId:f.contractId,rationale:'Premature'})).rejects.toThrow(/Wait/)
  vi.setSystemTime(clock+180000)
  await f.owner.mutation(api.experiments.close,{contractId:f.contractId,rationale:'No measurements arrived; retain inconclusive result.'})
  const d=await f.owner.query(api.experiments.detail,{contractId:f.contractId})
  expect(JSON.parse(d.contract.closingSummary!).disposition).toBe('inconclusive')
  const negative=assessExperiment({...design,createdAt:clock},[{...measurement,candidate:0},{...measurement,caseKey:'two',cohort:'Other',candidate:1}],clock+180000)
  expect(negative).toMatchObject({disposition:'target_missed',observedTargetMet:false,causalConclusion:'not_established'})
 })
 it('blocks direct legacy writes for bound protocols while preserving ordinary lab APIs',async()=>{
  const f=await fixture(),p=(await f.owner.query(api.experiments.detail,{contractId:f.contractId})).contract.protocolId
  const trial={protocolId:p,caseKey:'bypass',domain:'primary',baseline:1,candidate:2,evidence:measurement.evidence,digest:measurement.digest}
  await expect(f.owner.mutation(api.frontierLab.addTrial,trial)).rejects.toThrow(/Experiment Designer/)
  await expect(f.owner.mutation(api.frontierLab.close,{protocolId:p})).rejects.toThrow(/Experiment Designer/)
  const legacy=await f.owner.mutation(api.frontierLab.create,{kind:'science',title:'Legacy supported protocol',hypothesis:'Legacy hypothesis',metric:'Score',unit:'points',direction:'higher',target:1,minimumSamples:2,domains:['primary'],heldOutDomains:[]})
  await f.owner.mutation(api.frontierLab.addTrial,{...trial,protocolId:legacy})
  await f.owner.mutation(api.frontierLab.addTrial,{...trial,protocolId:legacy,caseKey:'second'})
  await f.owner.mutation(api.frontierLab.close,{protocolId:legacy})
  expect((await f.owner.query(api.frontierLab.detail,{protocolId:legacy})).record.status).toBe('closed')
 })
 it('refuses future measurements, conflicting retries, duplicate cohorts and missing guardrail keys',async()=>{
  const f=await fixture();vi.setSystemTime(clock+180000)
  const a={contractId:f.contractId,...measurement}
  for(const change of [{periodEnd:clock+190000},{digest:'invalid'},{guardrailValues:[]},{baselinePopulation:-1},{stopTriggered:true,stopNote:''},{evidence:'https://user:password@example.test'}]){
   await expect(f.owner.mutation(api.experiments.record,{...a,...change})).rejects.toThrow()
  }
  await f.owner.mutation(api.experiments.record,a)
  await expect(f.owner.mutation(api.experiments.record,{...a,candidate:99})).rejects.toThrow(/different immutable/)
  await expect(f.owner.mutation(api.experiments.record,{...a,caseKey:'duplicated-cohort'})).rejects.toThrow(/double-count/)
 })
 it('imports exact reports into the graph without upgrading fixture data to verified outcomes',async()=>{
  const f=await fixture();vi.setSystemTime(clock+180000)
  const evidenceDigest=await digest('Authored fixture evidence, not customer data')
  const reportId=await f.owner.mutation(api.experiments.record,{contractId:f.contractId,...measurement,basis:'controlled_fixture',digest:evidenceDigest})
  const a={projectId:f.projectId,reportId},id=await f.owner.mutation(api.evidenceGraph.importExperimentReport,a)
  expect(await f.owner.mutation(api.evidenceGraph.importExperimentReport,a)).toBe(id)
  const g=await f.owner.query(api.evidenceGraph.graph,{projectId:f.projectId}),node=g.entries[0]
  expect(node).toMatchObject({kind:'observation',status:'unverified',basis:'hypothesized'})
  expect(JSON.parse(node.sourceSnapshot!)).toMatchObject({type:'experiment-report',provenance:'controlled_fixture',evidenceSha256:evidenceDigest,causalConclusion:'not_established'})
  expect(g.analysis.issues[0].reasons.join(' ')).toMatch(/not customer/)
  await expect(f.owner.mutation(api.evidenceGraph.save,{projectId:f.projectId,nodeKey:node.nodeKey,kind:'observation',expectedRevision:1,statement:'Verified customer outcome',scope:'False expansion',basis:'observed',status:'reviewed',reviewOn:''})).rejects.toThrow(/fixed/)
 })
 it('preserves quota histories and exact retries without provider or financial activity',async()=>{
  const f=await fixture();vi.setSystemTime(clock+180000)
  const a={contractId:f.contractId,...measurement},id=await f.owner.mutation(api.experiments.record,a)
  const row=await f.t.run(c=>c.db.get(id)) as Doc<'experimentObservations'>|null
  await f.t.run(async c=>{const {_id,_creationTime,...data}=row!;for(let i=0;i<49;i++)await c.db.insert('experimentObservations',{...data,caseKey:'retained-'+i,cohort:'Retained cohort'+i})})
  await expect(f.owner.mutation(api.experiments.record,{...a,caseKey:'over',cohort:'Over quota cohort'})).rejects.toThrow(/50-observation/)
  expect(await f.owner.mutation(api.experiments.record,a)).toBe(id)
  const d=(await f.owner.query(api.experiments.detail,{contractId:f.contractId})).contract
  await f.t.run(async c=>{const {_id,_creationTime,...data}=d;for(let i=0;i<19;i++)await c.db.insert('experimentContracts',{...data,contractKey:'retained-'+i})})
  await expect(f.owner.mutation(api.experiments.create,{...f.args,contractKey:'over',windowStart:clock+200000,windowEnd:clock+300000})).rejects.toThrow(/20 experiment/)
  expect(await f.owner.mutation(api.experiments.create,f.args)).toBe(f.contractId)
  expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toEqual([])
  expect(await f.t.run(c=>c.db.query('billingAccounts').collect())).toEqual([])
 })
})
