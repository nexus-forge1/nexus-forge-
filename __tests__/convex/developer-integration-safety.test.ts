// @vitest-environment edge-runtime
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
beforeEach(()=>{vi.stubEnv('RESEARCH_EGRESS_GATEWAY_URL','https://gateway.example.com');vi.stubEnv('RESEARCH_EGRESS_GATEWAY_TOKEN','fixture-only')})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const packageId=await owner.mutation(api.frontierControls.registerPackage,{name:'safe-lookup',version:'1.0.0',description:'Controlled JSON lookup',inputFields:['query'],outputFields:['answer']})
 await owner.mutation(api.frontierControls.validatePackage,{packageId,input:'{"query":"x"}',output:'{"answer":"x"}'})
 const adapterId=await owner.mutation(api.externalRuntime.register,{packageId,endpoint:'https://agent.example.com/lookup'})
 return {t,owner,other,packageId,adapterId,args:{adapterId,requestKey:'bounded-key-0001',input:'{"query":"x"}'}}
}
const envelope=(url:string)=>({ok:true,status:200,truncated:false,finalUrl:url,hops:[url],contentType:'application/json; charset=utf-8',body:'{"answer":"controlled"}'})
describe('developer connector safety',()=>{
 it('rechecks revocation at atomic admission after an earlier successful authorization read',async()=>{
  const {t,owner,adapterId,args}=await fixture()
  await owner.query(internal.externalRuntime.authorized,{adapterId})
  await owner.mutation(api.externalRuntime.setEnabled,{adapterId,enabled:false})
  await expect(owner.mutation(internal.externalRuntime.admit,args)).rejects.toThrow(/permission denied/)
  expect(await t.run(c=>c.db.query('runtimeJobs').collect())).toEqual([])
 })
 it('refuses settlement after revocation and never releases a successful result',async()=>{
  const {owner,adapterId,args}=await fixture()
  const network=vi.fn(async(_url:any,init:any)=>{
   const {url}=JSON.parse(init.body)
   await owner.mutation(api.externalRuntime.setEnabled,{adapterId,enabled:false})
   return Response.json(envelope(url))
  });vi.stubGlobal('fetch',network)
  await expect(owner.action(api.externalRuntime.run,args)).rejects.toThrow(/Review receipt/)
  const jobs=await owner.query(api.runtimeReceipts.activeList,{})
  expect(jobs[0]).toMatchObject({status:'failed',requestKey:args.requestKey})
  expect(jobs[0].result).not.toContain('controlled')
  await owner.mutation(api.externalRuntime.setEnabled,{adapterId,enabled:true})
  await expect(owner.action(api.externalRuntime.run,args)).rejects.toThrow(/already attempted/)
  expect(network).toHaveBeenCalledTimes(1)
 })
 it('binds successful settlement to the exact owned adapter and keeps the receipt immutable',async()=>{
  const {owner,other,adapterId,args,packageId}=await fixture()
  const admitted=await owner.mutation(internal.externalRuntime.admit,args)
  const second=await owner.mutation(api.externalRuntime.register,{packageId,endpoint:'https://agent.example.com/second'})
  await expect(owner.mutation(internal.externalRuntime.complete,{adapterId:second,jobId:admitted.jobId,result:'wrong adapter'})).rejects.toThrow(/receipt access denied/)
  await expect(other.mutation(internal.externalRuntime.complete,{adapterId,jobId:admitted.jobId,result:'forged'})).rejects.toThrow(/permission denied/)
  await owner.mutation(internal.externalRuntime.complete,{adapterId,jobId:admitted.jobId,result:'exact retained result'})
  await expect(owner.mutation(internal.externalRuntime.complete,{adapterId,jobId:admitted.jobId,result:'replacement'})).rejects.toThrow(/settlement/)
  expect((await owner.mutation(internal.externalRuntime.admit,args)).cached).toBe('exact retained result')
  await expect(owner.mutation(internal.externalRuntime.admit,{...args,input:'{"query":"changed"}'})).rejects.toThrow(/immutable input/)
 })
 it.each(['jsonp','string-status','missing-truncation','wrong-hop','array-body','oversize-utf8','field-drift','redirect','network'])('retains %s failures and blocks same-key replay',async kind=>{
  const {owner,args}=await fixture()
  const network=vi.fn(async(_url:any,init:any)=>{
   if(kind==='network')throw new Error('lost response')
   const {url}=JSON.parse(init.body),data:any=envelope(url)
   if(kind==='jsonp')data.contentType='application/jsonp'
   if(kind==='string-status')data.status='200'
   if(kind==='missing-truncation')delete data.truncated
   if(kind==='wrong-hop')data.hops=['https://other.example.com/']
   if(kind==='array-body')data.body=['{"answer":"controlled"}']
   if(kind==='oversize-utf8')data.body=JSON.stringify({answer:'é'.repeat(11000)})
   if(kind==='field-drift')data.body='{"answer":"x","extra":true}'
   if(kind==='redirect')data.finalUrl='https://other.example.com/'
   return Response.json(data)
  });vi.stubGlobal('fetch',network)
  await expect(owner.action(api.externalRuntime.run,args)).rejects.toThrow(/Review receipt/)
  await expect(owner.action(api.externalRuntime.run,args)).rejects.toThrow(/already attempted/)
  expect(network).toHaveBeenCalledTimes(1)
  expect((await owner.query(api.runtimeReceipts.activeList,{}))[0].status).toBe('failed')
 })
 it('returns an identical completed request without another network call',async()=>{
  const {owner,args}=await fixture()
  const network=vi.fn(async(_url:any,init:any)=>Response.json(envelope(JSON.parse(init.body).url)))
  vi.stubGlobal('fetch',network)
  const first=await owner.action(api.externalRuntime.run,args)
  expect(await owner.action(api.externalRuntime.run,args)).toBe(first)
  expect(network).toHaveBeenCalledTimes(1)
 })
 it('blocks a completed mission before any GitHub write and leaves its plan unstarted',async()=>{
  const {t,owner}=await fixture()
  const missionId=await t.run(c=>c.db.insert('missions',{ownerKey:'owner',title:'Complete',mission:'Completed controlled mission',autonomy:'governed',budget:0,status:'complete',completion:100,approved:true}))
  const planId=await owner.mutation(internal.githubWriteTools.save,{missionId,baseCommit:'a'.repeat(40),baseTree:'b'.repeat(40),files:[{path:'agent-output/result.json',content:'{}'}]})
  const network=vi.fn();vi.stubGlobal('fetch',network)
  await expect(owner.action(api.githubWriteTools.execute,{planId})).rejects.toThrow(/Approved mission/)
  expect(network).not.toHaveBeenCalled()
  expect((await owner.query(api.githubWriteTools.list,{}))[0].status).toBe('prepared')
 })
})
