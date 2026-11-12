// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import type {Id} from '../../convex/_generated/dataModel'
import {api,internal} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
describe('runtime raw-history safety bounds',()=>{
 it('fails closed across archived rows but preserves cached replay and settlement',async()=>{
  const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'})
  const a={ownerKey:'owner',requestKey:'cached-request-001',kind:'legacy-custom-kind',input:'{}'}
  const cached=await t.mutation(internal.runtimeReceipts.admit,a)
  await t.mutation(internal.runtimeReceipts.finish,{jobId:cached.jobId,status:'complete',result:'Immutable result'})
  const pending=await t.mutation(internal.runtimeReceipts.admit,{...a,requestKey:'pending-request-001'})
  const old=await t.run(async ctx=>{const ids:Id<'runtimeJobs'>[]=[];for(let i=0;i<510;i++)ids.push(await ctx.db.insert('runtimeJobs',{ownerKey:'owner',requestKey:'archive-'+i,kind:'multimodal',input:'{}',status:'complete',result:'Retained',createdAt:i}));return ids})
  await expect(t.mutation(internal.runtimeReceipts.admit,{...a,requestKey:'new-request-001'})).rejects.toThrow(/could not be established/)
  expect(await t.mutation(internal.runtimeReceipts.admit,a)).toEqual({jobId:cached.jobId,cached:'Immutable result'})
  await t.mutation(internal.runtimeReceipts.finish,{jobId:pending.jobId,status:'complete',result:'Settled after read limit'})
  const summary=await owner.query(api.runtimeReceipts.activeSummary,{})
  expect(summary).toMatchObject({rows:[],readLimited:true,complete:false})
  await expect(owner.query(api.runtimeReceipts.activeList,{})).rejects.toThrow(/safety limit/)
  expect(await t.run(async ctx=>(await Promise.all(old.map(id=>ctx.db.get(id)))).every(r=>r?.result==='Retained'))).toBe(true)
  expect((await t.run(ctx=>ctx.db.get(pending.jobId as Id<'runtimeJobs'>)))?.result).toBe('Settled after read limit')
 })
 it('bounds large bodies as well as row counts',async()=>{
  const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'})
  await t.run(async ctx=>{for(let i=0;i<8;i++)await ctx.db.insert('runtimeJobs',{ownerKey:'owner',requestKey:'large-'+i,kind:'gemini-media',input:'{}',status:'complete',result:'x'.repeat(700000),createdAt:i})})
  expect(await owner.query(api.runtimeReceipts.activeSummary,{})).toMatchObject({readLimited:true,rows:[]})
  await expect(t.mutation(internal.runtimeReceipts.admit,{ownerKey:'owner',requestKey:'new-request-001',kind:'external-agent',input:'{}'})).rejects.toThrow(/could not be established/)
 })
 it('paginates retained history completely with ownership and server-enforced page limits',async()=>{
  const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
  await t.run(async ctx=>{for(let i=0;i<45;i++)await ctx.db.insert('runtimeJobs',{ownerKey:'owner',requestKey:'history-'+i,kind:i%2?'custom-kind':'media-chain',input:'{}',status:'complete',result:'Original '+i,createdAt:i})})
  let cursor:string|null=null;const ids:string[]=[]
  for(let i=0;i<5;i++){const page=await owner.query(api.runtimeReceipts.historyPage,{paginationOpts:{cursor,numItems:20,maximumRowsRead:100000,maximumBytesRead:100000000}});ids.push(...page.page.map(r=>r._id));if(page.isDone)break;cursor=page.continueCursor}
  expect(ids).toHaveLength(45);expect(new Set(ids).size).toBe(45)
  expect((await other.query(api.runtimeReceipts.historyPage,{paginationOpts:{cursor:null,numItems:20}})).page).toEqual([])
  await expect(t.query(api.runtimeReceipts.historyPage,{paginationOpts:{cursor:null,numItems:20}})).rejects.toThrow(/Authenticated/)
  await expect(owner.query(api.runtimeReceipts.historyPage,{paginationOpts:{cursor:null,numItems:21}})).rejects.toThrow(/1–20/)
  const summary=await owner.query(api.runtimeReceipts.activeSummary,{})
  expect(summary.complete).toBe(true);expect(summary.rows.every(r=>r.kind==='custom-kind')).toBe(true)
 })
})
