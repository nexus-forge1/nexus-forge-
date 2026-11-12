// @vitest-environment edge-runtime
import {afterEach,describe,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts'),commitSha='a'.repeat(40)
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
async function fixture(branch='main'){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const ids=await t.run(async c=>{
  const missionId=await c.db.insert('missions',{ownerKey:'owner',title:'Dispatch safety',mission:'Retain exact remote work',autonomy:'governed',budget:0,status:'running',completion:0,approved:true})
  const artifactId=await c.db.insert('artifacts',{missionId,type:'html',name:'Approved fixture',content:'<!doctype html><html>Exact approved bytes</html>',status:'ready',requiresApproval:false})
  return{missionId,artifactId}
 })
 const id=await owner.mutation(api.delivery.prepare,{...ids,target:'nexus-forge1/no-dispatch',branch})
 await owner.mutation(api.delivery.approve,{id,approved:true})
 vi.stubEnv('GITHUB_ACCESS_TOKEN','fixture-secret-not-for-output')
 vi.stubEnv('CONVEX_SITE_URL','https://quick-rabbit-810.eu-west-1.convex.site')
 return{t,owner,other,id,...ids}
}
function network(custom?:(url:string,init:RequestInit)=>Promise<Response|undefined>){
 const mock=vi.fn(async(raw:unknown,init:RequestInit={})=>{
  const url=String(raw),special=await custom?.(url,init);if(special)return special
  if(init.method==='PUT')return Response.json({commit:{sha:commitSha}})
  if(init.method==='POST')return new Response(null,{status:204})
  if(url.includes('/contents/.github/workflows/'))return Response.json({encoding:'base64',content:btoa('callback_origin: defined\ninputs.callback_origin')})
  if(url.includes('/contents/'))return new Response(null,{status:404})
  return Response.json({})
 });vi.stubGlobal('fetch',mock);return mock
}
async function attempts(t:ReturnType<typeof convexTest>){return t.run(c=>c.db.query('deliveryDispatchAttempts').collect())}
describe('durable external delivery admission',()=>{
 it('admits one concurrent worker and replays completed work without another request',async()=>{
  const{t,owner,id}=await fixture()
  let release!:()=>void,started!:()=>void
  const gate=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>started=r)
  let first=true
  const net=network(async(_url,init)=>{if(first&&!init.method){first=false;started();await gate}return undefined})
  const firstRequest=owner.action(api.delivery.executeApproved,{id})
  await entered
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/already active or uncertain/)
  expect(net).toHaveBeenCalledTimes(1)
  release();const result=await firstRequest
  const before=net.mock.calls.length
  expect(await owner.action(api.delivery.executeApproved,{id})).toEqual(result)
  expect(net).toHaveBeenCalledTimes(before)
  expect(net.mock.calls.filter(c=>c[1]?.method==='PUT')).toHaveLength(1)
  expect(net.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1)
  expect((await attempts(t))).toMatchObject([{status:'dispatched',phase:'dispatch',commitSha,generation:1}])
  expect((await t.run(c=>c.db.query('auditEvents').collect())).filter(e=>e.eventType==='delivery:github_dispatched')).toHaveLength(1)
  for(const call of net.mock.calls)expect(call[1]).toMatchObject({redirect:'error',signal:expect.anything()})
 })
 it.each(['commit','dispatch'])('blocks replay and approval/target reset after uncertain %s',async phase=>{
  const{t,owner,id}=await fixture()
  const net=network(async(_url,init)=>{if(init.method===(phase==='commit'?'PUT':'POST'))throw Error('lost response fixture-secret-not-for-output');return undefined})
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/could not be confirmed/)
  expect(await attempts(t)).toMatchObject([{status:'uncertain',phase}])
  const count=net.mock.calls.length
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/already active or uncertain/)
  await expect(owner.mutation(api.delivery.approve,{id,approved:true})).rejects.toThrow(/cannot reset/)
  await expect(owner.mutation(api.delivery.correctTarget,{id,target:'nexus-forge1/nexus-forge-'})).rejects.toThrow(/cannot reset/)
  expect(net).toHaveBeenCalledTimes(count)
  const status=await owner.query(api.deliveryDispatch.status,{id})
  expect(JSON.stringify(status)).not.toContain('fixture-secret')
  if(phase==='dispatch')expect(status?.commitSha).toBe(commitSha)
 })
 it('records safe preflight failure and requires fresh approval before a new generation',async()=>{
  const{t,owner,id}=await fixture()
  const net=vi.fn().mockResolvedValue(new Response(null,{status:404}));vi.stubGlobal('fetch',net)
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/Repository not found/)
  expect(await attempts(t)).toMatchObject([{status:'rejected',phase:'preflight'}])
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/approval/)
  expect(net).toHaveBeenCalledTimes(1)
  await owner.mutation(api.delivery.approve,{id,approved:true})
  network();await owner.action(api.delivery.executeApproved,{id})
  expect((await attempts(t)).map(a=>[a.generation,a.status])).toEqual([[1,'rejected'],[2,'dispatched']])
 })
 it('does not leak raw transport details in preflight failures',async()=>{
  const{t,owner,id}=await fixture()
  network(async()=>{throw Error('socket included fixture-secret-not-for-output')})
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/could not be confirmed/)
  expect(JSON.stringify(await attempts(t))).not.toContain('fixture-secret')
  expect((await attempts(t))[0].status).toBe('rejected')
 })
 it('preserves a confirmed commit when approval or artifact content changes before dispatch',async()=>{
  const{t,owner,id,artifactId}=await fixture()
  const net=network(async(_url,init)=>{
   if(init.method==='PUT'){await t.run(c=>c.db.patch(artifactId,{content:'Changed after commit'}));return Response.json({commit:{sha:commitSha}})}
   return undefined
  })
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/could not be confirmed/)
  expect(await attempts(t)).toMatchObject([{status:'uncertain',phase:'commit',commitSha}])
  expect(net.mock.calls.some(c=>c[1]?.method==='POST')).toBe(false)
 })
 it('denies revoked mission permission before the first remote write',async()=>{
  const{t,owner,id,missionId}=await fixture()
  const net=network(async(url,init)=>{if(url.includes('/contents/')&&!init.method)await t.run(c=>c.db.patch(missionId,{approved:false}));return undefined})
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/authorization/)
  expect(net.mock.calls.some(c=>c[1]?.method==='PUT'||c[1]?.method==='POST')).toBe(false)
  expect(await attempts(t)).toMatchObject([{status:'rejected'}])
 })
 it('does not regress callback evidence when workflow completion wins the acknowledgement race',async()=>{
  const{t,owner,id}=await fixture(),runUrl='https://github.com/nexus-forge1/no-dispatch/actions/runs/123'
  network(async(_url,init)=>{
   if(init.method==='POST'){await t.mutation(internal.delivery.recordWorkflowResult,{id,conclusion:'success',runUrl,commitSha,summary:'Fast callback fixture'});return new Response(null,{status:204})}
   return undefined
  })
  await owner.action(api.delivery.executeApproved,{id})
  const d=await t.run(c=>c.db.get(id))
  expect(d).toMatchObject({stage:'test',workflowRunUrl:runUrl,status:'GitHub Actions build and test completed'})
  const a=(await attempts(t))[0]
  const before=await t.run(c=>c.db.query('auditEvents').collect())
  await t.mutation(internal.deliveryDispatch.failed,{attemptId:a._id,message:'Late lost acknowledgement'})
  await t.mutation(internal.deliveryDispatch.complete,{attemptId:a._id,result:a.result!})
  expect(await t.run(c=>c.db.get(id))).toEqual(d)
  expect(await t.run(c=>c.db.query('auditEvents').collect())).toEqual(before)
 })
 it('settles uncertain dispatch from the exact protected callback and refuses mismatched commits',async()=>{
  const{t,owner,id}=await fixture(),net=network(async(_url,init)=>{if(init.method==='POST')throw Error('Lost acknowledgement');return undefined})
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/could not be confirmed/)
  const runUrl='https://github.com/nexus-forge1/no-dispatch/actions/runs/456'
  await expect(t.mutation(internal.delivery.recordWorkflowResult,{id,runUrl,commitSha:'b'.repeat(40),conclusion:'success',summary:'Wrong commit'})).rejects.toThrow(/current admitted dispatch/)
  await t.mutation(internal.delivery.recordWorkflowResult,{id,runUrl,commitSha,conclusion:'success',summary:'Exact protected callback'})
  expect((await attempts(t))[0].status).toBe('dispatched')
  const count=net.mock.calls.length
  expect(await owner.action(api.delivery.executeApproved,{id})).toMatchObject({ok:true})
  expect(net).toHaveBeenCalledTimes(count)
 })
 it('rechecks ownership for history and cached results before any network call',async()=>{
  const{t,owner,other,id}=await fixture(),net=network()
  await expect(other.action(api.delivery.executeApproved,{id})).rejects.toThrow(/access denied/)
  await expect(t.action(api.delivery.executeApproved,{id})).rejects.toThrow(/Authenticated/)
  expect(net).not.toHaveBeenCalled()
  await owner.action(api.delivery.executeApproved,{id});const count=net.mock.calls.length
  await expect(other.action(api.delivery.executeApproved,{id})).rejects.toThrow(/access denied/)
  await expect(other.query(api.deliveryDispatch.status,{id})).rejects.toThrow(/access denied/)
  expect(net).toHaveBeenCalledTimes(count)
 })
 it('rejects oversized metadata before writes and malformed commit acknowledgement without dispatching',async()=>{
  const{t,owner,id}=await fixture()
  let net=network(async(url,init)=>url.includes('/contents/')&&!init.method?new Response('x'.repeat(1024*1024+1)):undefined)
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/oversized/)
  expect(net.mock.calls.some(c=>c[1]?.method==='PUT')).toBe(false)
  await owner.mutation(api.delivery.approve,{id,approved:true})
  net=network(async(_url,init)=>init.method==='PUT'?Response.json({commit:{sha:'invalid'}}):undefined)
  await expect(owner.action(api.delivery.executeApproved,{id})).rejects.toThrow(/could not be confirmed/)
  expect(net.mock.calls.some(c=>c[1]?.method==='POST')).toBe(false)
  expect((await attempts(t))[1]).toMatchObject({status:'uncertain',phase:'commit'})
 })
 it('binds explicit failed-QA retry review to the exact retained commit and preserves older attempts',async()=>{
  const{t,owner,id}=await fixture('qa-only')
  network();await owner.action(api.delivery.executeApproved,{id})
  const a=(await attempts(t))[0],runUrl='https://github.com/nexus-forge1/no-dispatch/actions/runs/123'
  await expect(owner.mutation(internal.delivery.allowVerifiedQaRetry,{id,runUrl,verifiedCommitSha:'b'.repeat(40)})).rejects.toThrow(/exact dispatch commit/)
  await owner.mutation(internal.delivery.allowVerifiedQaRetry,{id,runUrl,verifiedCommitSha:commitSha})
  expect((await attempts(t))[0]).toMatchObject({status:'reviewed',result:a.result,reviewRunUrl:runUrl})
  await owner.action(api.delivery.executeApproved,{id})
  expect((await attempts(t)).map(r=>[r.generation,r.status])).toEqual([[1,'reviewed'],[2,'dispatched']])
  const current=await t.run(c=>c.db.get(id))
  await t.mutation(internal.delivery.recordWorkflowResult,{id,runUrl,commitSha,conclusion:'failure',summary:'Late old callback'})
  expect(await t.run(c=>c.db.get(id))).toEqual(current)
 })
})
