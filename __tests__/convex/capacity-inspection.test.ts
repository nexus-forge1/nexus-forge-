// @vitest-environment edge-runtime
import{describe,it,expect}from'vitest'
import{convexTest}from'convex-test'
import schema from'../../convex/schema'
import{api}from'../../convex/_generated/api'
import{inspectCapacity,capacityBudget,CAPACITY_INSPECTION_LIMITS}from'../../convex/capacityInspection'
const modules=import.meta.glob('../../convex/**/*.ts')
function fixture(){const t=convexTest(schema,modules);return{t,owner:t.withIdentity({subject:'owner'}),other:t.withIdentity({subject:'other'})}}
describe('bounded private capacity inspection',()=>{
 it('does not advertise available slots when large retained report bodies stop inspection',async()=>{
  const{t,owner,other}=fixture()
  await t.run(async ctx=>{for(let i=0;i<10;i++)await ctx.db.insert('benchmarkRuns',{ownerKey:'owner',version:'private-'+i,report:'PRIVATE_REPORT'+ 'x'.repeat(600000),createdAt:i})})
  const result=await owner.query(api.resourceCapacity.collection,{id:'benchmarks'})
  expect(result).toMatchObject({complete:false,readLimited:true,blocked:true,remaining:0,limit:100})
  expect(result.count).toBeGreaterThan(0);expect(result.count).toBeLessThan(10)
  expect(result.scope).toMatch(/not proof that the record quota is full/)
  expect(JSON.stringify(result)).not.toContain('PRIVATE_REPORT')
  expect(await other.query(api.resourceCapacity.collection,{id:'benchmarks'})).toMatchObject({count:0,complete:true,readLimited:false,blocked:false,remaining:100})
  expect(await t.run(ctx=>ctx.db.query('benchmarkRuns').collect())).toHaveLength(10)
 })
 it('shares one budget in the legacy overview while independent collection counts remain available',async()=>{
  const{t,owner}=fixture()
  await t.run(async ctx=>{
   for(const kind of ['comparison','science']as const)for(let i=0;i<3;i++)await ctx.db.insert('labProtocols',{ownerKey:'owner',kind,title:'Private '+kind,hypothesis:'x'.repeat(700000),metric:'score',unit:'points',direction:'higher',target:1,minimumSamples:2,domains:['planning'],heldOutDomains:[],status:'closed',createdAt:i})
   await ctx.db.insert('benchmarkRuns',{ownerKey:'owner',version:'retained',report:'Private benchmark',createdAt:1})
  })
  const combined=await owner.query(api.resourceCapacity.overview,{})
  expect(combined.rows).toHaveLength(10)
  expect(combined.rows.find(r=>r.id==='comparison')).toMatchObject({count:3,complete:true,blocked:false})
  expect(combined.rows.find(r=>r.id==='science')).toMatchObject({readLimited:true,complete:false,blocked:true,remaining:0})
  expect(combined.rows.find(r=>r.id==='benchmarks')).toMatchObject({count:0,readLimited:true,complete:false,blocked:true,remaining:0})
  expect(await owner.query(api.resourceCapacity.collection,{id:'benchmarks'})).toMatchObject({count:1,complete:true,readLimited:false,remaining:99})
  expect(JSON.stringify(combined)).not.toContain('Private benchmark')
  expect(await t.run(ctx=>ctx.db.query('labProtocols').collect())).toHaveLength(6)
 })
 it('counts retired runtime history against the scan budget without treating it as active admission',async()=>{
  const{t,owner}=fixture()
  await t.run(async ctx=>{
   for(let i=0;i<600;i++)await ctx.db.insert('runtimeJobs',{ownerKey:'owner',requestKey:'retained-'+i,kind:'media-chain',input:'{}',status:'complete',result:'Retained evidence',createdAt:i})
   await ctx.db.insert('runtimeJobs',{ownerKey:'owner',requestKey:'active-later',kind:'external-agent',input:'{}',status:'pending',createdAt:601})
  })
  expect(await owner.query(api.resourceCapacity.collection,{id:'runtime'})).toMatchObject({count:0,complete:false,readLimited:true,remaining:0,blocked:true})
  expect(await t.run(ctx=>ctx.db.query('runtimeJobs').collect())).toHaveLength(601)
 })
 it('stops subsequent streams on budget exhaustion and preserves the distinct over-limit result',async()=>{
  const budget=capacityBudget();let consumed=0
  async function* large(){for(let i=0;i<10;i++){consumed++;yield{value:'x'.repeat(1000000)}}}
  expect(await inspectCapacity(large(),100,budget)).toMatchObject({complete:false,readLimited:true})
  expect(budget.bytes).toBeLessThanOrEqual(CAPACITY_INSPECTION_LIMITS.bytes)
  const before=consumed
  expect(await inspectCapacity(large(),100,budget)).toEqual({count:0,complete:false,readLimited:true})
  expect(consumed).toBe(before)
  async function* small(){yield 1;yield 2;yield 3;yield 4}
  expect(await inspectCapacity(small(),2,capacityBudget())).toEqual({count:3,complete:false,readLimited:false})
 })
})
