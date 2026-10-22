// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import {compileRequirements,economics} from '../convex/studioModel'
const modules=import.meta.glob('../convex/**/*.ts')
const input={title:'Controlled pilot',brief:'Build a controlled product with verified acceptance criteria.',audience:'Pilot customers',criteria:['A customer can complete the primary task'],budget:10}
const req={title:'Create task',role:'Customer',route:'/tasks',entity:'Task',acceptance:'A saved task survives reload and is hidden from another account.'}
async function fixture(){
 const t=convexTest(schema,modules)
 const ids=await t.run(async ctx=>{const owner=await ctx.db.insert('users',{email:'owner@example.test',emailVerificationTime:Date.now()}),recipient=await ctx.db.insert('users',{email:'client@example.test',emailVerificationTime:Date.now()}),other=await ctx.db.insert('users',{email:'other@example.test',emailVerificationTime:Date.now()});return{owner,recipient,other}})
 const owner=t.withIdentity({subject:ids.owner}),recipient=t.withIdentity({subject:ids.recipient}),other=t.withIdentity({subject:ids.other})
 const templateId=await owner.mutation(api.studio.saveTemplate,input),project=await owner.mutation(api.studio.startProject,{templateId,title:'Controlled project'})
 return{t,owner,recipient,other,ids,templateId,...project}
}
describe('private project foundation',()=>{
 it('creates one draft mission atomically and reuses exact project/template requests',async()=>{
  const f=await fixture(),same=await f.owner.mutation(api.studio.saveTemplate,input)
  expect(same).toBe(f.templateId)
  expect(await f.owner.mutation(api.studio.startProject,{templateId:same,title:'Controlled project'})).toMatchObject({projectId:f.projectId,missionId:f.missionId,reused:true})
  expect(await f.t.run(ctx=>ctx.db.get(f.missionId))).toMatchObject({approved:false,status:'draft',budget:10,autonomy:'Approval required'})
  expect(await f.t.run(ctx=>ctx.db.query('missions').collect())).toHaveLength(1)
 })
 it('denies anonymous and foreign ownership without leaking private rows',async()=>{
  const f=await fixture()
  await expect(f.t.query(api.studio.templates,{})).rejects.toThrow(/Authenticated/)
  expect(await f.other.query(api.studio.templates,{})).toEqual([])
  expect(await f.other.query(api.studio.projects,{})).toEqual([])
  await expect(f.other.mutation(api.studio.startProject,{templateId:f.templateId,title:'Foreign'})).rejects.toThrow(/unavailable/)
  await expect(f.other.query(api.studio.specifications,{projectId:f.projectId})).rejects.toThrow(/unavailable/)
 })
 it('preserves immutable versions, rejects stale edits and makes exact retries idempotent',async()=>{
  const f=await fixture(),args={projectId:f.projectId,expectedRevision:0,requirements:[req]},id=await f.owner.mutation(api.studio.compileSpecification,args)
  expect(await f.owner.mutation(api.studio.compileSpecification,args)).toBe(id)
  await expect(f.owner.mutation(api.studio.compileSpecification,{...args,requirements:[{...req,acceptance:'Changed acceptance criterion'}]})).rejects.toThrow(/changed/)
  await f.owner.mutation(api.studio.compileSpecification,{...args,expectedRevision:1,requirements:[{...req,acceptance:'Changed acceptance criterion'}]})
  const rows=await f.owner.query(api.studio.specifications,{projectId:f.projectId})
  expect(rows.map(r=>r.revision)).toEqual([2,1]);expect(rows[1].requirements[0].acceptance).toBe(req.acceptance)
 })
 it('hands draft specifications to Council context while approved contracts stay frozen',async()=>{
  const f=await fixture()
  await f.owner.mutation(api.studio.compileSpecification,{projectId:f.projectId,expectedRevision:0,requirements:[req]})
  const draft=await f.t.run(ctx=>ctx.db.get(f.missionId));expect(draft?.mission).toContain(req.acceptance);expect(draft?.mission).toContain('PRODUCT SPECIFICATION v1');expect(draft?.approved).toBe(false)
  await f.owner.mutation(api.missions.approve,{id:f.missionId,approved:true})
  await f.owner.mutation(api.studio.compileSpecification,{projectId:f.projectId,expectedRevision:1,requirements:[{...req,acceptance:'A new candidate criterion'}]})
  expect((await f.t.run(ctx=>ctx.db.get(f.missionId)))?.mission).toBe(draft?.mission)
 })
 it('rejects invalid routes, duplicate requirement identities and invalid budgets before writes',async()=>{
  const f=await fixture()
  await expect(f.owner.mutation(api.studio.saveTemplate,{...input,budget:501})).rejects.toThrow()
  expect(()=>compileRequirements([{...req,route:'https://example.test'}])).toThrow(/local route/)
  expect(()=>compileRequirements([req,{...req,title:'Create-task'}])).toThrow(/distinct/)
  expect(()=>compileRequirements([{...req,acceptance:''}])).toThrow(/Acceptance/)
 })
 it('retains exact UTF-8 source hashes and server-selected line passages',async()=>{
  const f=await fixture(),content='First source line\nExact supporting passage\nContradicting evidence'
  const args={projectId:f.projectId,name:'evidence.md',content},id=await f.owner.mutation(api.studio.ingestText,args)
  expect(await f.owner.mutation(api.studio.ingestText,args)).toBe(id)
  const d=await f.owner.query(api.studio.document,{documentId:id});expect(d.content).toBe(content);expect(d.sha256).toMatch(/^[a-f0-9]{64}$/)
  const quote=await f.owner.mutation(api.studio.pinPassage,{documentId:id,firstLine:2,lastLine:2})
  expect(await f.owner.mutation(api.studio.pinPassage,{documentId:id,firstLine:2,lastLine:2})).toBe(quote)
  expect(await f.owner.query(api.studio.passages,{documentId:id})).toMatchObject([{quote:'Exact supporting passage',firstLine:2,lastLine:2}])
  await expect(f.owner.mutation(api.studio.pinPassage,{documentId:id,firstLine:1,lastLine:99})).rejects.toThrow(/source lines/)
  await expect(f.other.query(api.studio.document,{documentId:id})).rejects.toThrow(/unavailable/)
 })
 it('refuses unsupported files, oversized text and credential-like material',async()=>{
  const f=await fixture()
  for(const a of [{name:'file.pdf',content:'PDF text'},{name:'notes.txt',content:'x'.repeat(65537)},{name:'secret.txt',content:'sk_live_'+'a'.repeat(30)}])
   await expect(f.owner.mutation(api.studio.ingestText,{projectId:f.projectId,...a})).rejects.toThrow()
  expect(await f.owner.query(api.studio.documents,{projectId:f.projectId})).toEqual([])
 })
 it('isolates notification read state and does not append duplicate acknowledgments',async()=>{
  const f=await fixture(),rows=await f.owner.query(api.studio.notifications,{}),id=rows[0]._id
  await expect(f.other.mutation(api.studio.readNotice,{id,read:true})).rejects.toThrow(/unavailable/)
  await f.owner.mutation(api.studio.readNotice,{id,read:true});await f.owner.mutation(api.studio.readNotice,{id,read:true})
  expect((await f.owner.query(api.studio.notifications,{})).find(r=>r._id===id)?.read).toBe(true)
  expect(await f.other.query(api.studio.notifications,{})).toEqual([])
 })
 it('enforces admission caps while exact template retries remain usable',async()=>{
  const f=await fixture()
  await f.t.run(async ctx=>{for(let i=0;i<99;i++)await ctx.db.insert('studioTemplates',{...input,title:'Retained '+i,ownerKey:f.ids.owner,createdAt:Date.now()})})
  await expect(f.owner.mutation(api.studio.saveTemplate,{...input,title:'Over quota'})).rejects.toThrow(/100-template/)
  expect(await f.owner.mutation(api.studio.saveTemplate,input)).toBe(f.templateId)
 })
 it('computes costs per attempt and break-even per successful operation without touching billing',async()=>{
  const f=await fixture(),a={price:5,attemptCost:1,successRate:0.5,monthlyFixed:10,operations:10,feePercent:0,feeFixed:0},r=economics(a)
  expect(r).toMatchObject({successes:5,revenue:25,totalCost:20,profit:5,contributionPerSuccess:3,breakEvenSuccesses:4,marginPercent:20})
  expect(economics({...a,price:1}).breakEvenSuccesses).toBeNull()
  expect(()=>economics({...a,successRate:0})).toThrow()
  const args={projectId:f.projectId,label:'Forecast',...a},id=await f.owner.mutation(api.studio.saveEconomics,args)
  expect(await f.owner.mutation(api.studio.saveEconomics,args)).toBe(id)
  await expect(f.other.query(api.studio.economicScenarios,{projectId:f.projectId})).rejects.toThrow()
 })
})
describe('authenticated client delivery',()=>{
 async function delivery(){const f=await fixture();const artifactId=await f.t.run(ctx=>ctx.db.insert('artifacts',{missionId:f.missionId,type:'html',name:'Controlled deliverable',content:'<h1>Controlled exact snapshot</h1>',status:'ready',requiresApproval:true}));return{...f,artifactId}}
 it('binds a frozen approved snapshot to one verified recipient and never broadens access',async()=>{
  const f=await delivery(),args={artifactId:f.artifactId,recipientEmail:'client@example.test',expiresInDays:7},id=await f.owner.mutation(api.clientDelivery.create,args)
  expect(await f.owner.mutation(api.clientDelivery.create,args)).toBe(id)
  await f.t.run(ctx=>ctx.db.patch(f.artifactId,{content:'Changed original'}))
  expect(await f.recipient.query(api.clientDelivery.detail,{portalId:id})).toMatchObject({content:'<h1>Controlled exact snapshot</h1>',mine:false})
  await expect(f.other.query(api.clientDelivery.detail,{portalId:id})).rejects.toThrow(/unavailable/)
  expect(await f.other.query(api.clientDelivery.list,{})).toEqual([])
 })
 it('requires approved artifacts and an unambiguous verified recipient',async()=>{
  const f=await delivery()
  await f.t.run(ctx=>ctx.db.patch(f.artifactId,{status:'awaiting_approval'}))
  await expect(f.owner.mutation(api.clientDelivery.create,{artifactId:f.artifactId,recipientEmail:'client@example.test',expiresInDays:7})).rejects.toThrow(/Approve/)
  await f.t.run(ctx=>ctx.db.patch(f.artifactId,{status:'ready'}))
  await f.t.run(ctx=>ctx.db.insert('users',{email:'client@example.test',emailVerificationTime:Date.now()}))
  await expect(f.owner.mutation(api.clientDelivery.create,{artifactId:f.artifactId,recipientEmail:'client@example.test',expiresInDays:7})).rejects.toThrow(/verified account/)
 })
 it('keeps client decisions immutable and rejects expired or revoked access',async()=>{
  const f=await delivery(),id=await f.owner.mutation(api.clientDelivery.create,{artifactId:f.artifactId,recipientEmail:'client@example.test',expiresInDays:1}),a={portalId:id,decision:'accept' as const,message:'Accepted this exact snapshot'}
  await expect(f.owner.mutation(api.clientDelivery.feedback,a)).rejects.toThrow(/named recipient/)
  const feedback=await f.recipient.mutation(api.clientDelivery.feedback,a);expect(await f.recipient.mutation(api.clientDelivery.feedback,a)).toBe(feedback)
  await f.t.run(ctx=>ctx.db.patch(id,{expiresAt:Date.now()-1}))
  await expect(f.recipient.mutation(api.clientDelivery.feedback,{...a,message:'Late'})).rejects.toThrow(/expired/)
  await f.owner.mutation(api.clientDelivery.revoke,{portalId:id})
  await expect(f.recipient.query(api.clientDelivery.detail,{portalId:id})).rejects.toThrow(/expired|revoked/)
  expect(await f.t.run(ctx=>ctx.db.get(feedback))).toMatchObject({message:a.message})
 })
})
