// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
function fixture(){const t=convexTest(schema,modules);return{t,owner:t.withIdentity({subject:'owner'}),other:t.withIdentity({subject:'other'})}}
describe('independent private resource collections',()=>{
 it('requires authentication and lists parent limits without pretending to count their account-wide capacity',async()=>{
  const{t,owner}=fixture()
  await expect(t.query(api.resourceCapacity.catalog,{})).rejects.toThrow(/Authenticated/)
  await expect(t.query(api.resourceCapacity.collection,{id:'missions'})).rejects.toThrow(/Authenticated/)
  const data=await owner.query(api.resourceCapacity.catalog,{})
  expect(data.collections).toHaveLength(13)
  expect(new Set(data.collections.map(c=>c.id)).size).toBe(13)
  expect(data.scopedLimits.map(r=>[r.id,r.parent,r.limit])).toEqual([
   ['source-captures','Each research record',10],['claim-reviews','Each mission',100],['opportunity-plans','Each strategy',20],['opportunity-observations','Each plan',50],['lab-trials','Each protocol',100],
  ])
  expect(data.scopedLimits.every(row=>!('count'in row)&&!('remaining'in row))).toBe(true)
  for(const {id}of data.collections)expect(await owner.query(api.resourceCapacity.collection,{id})).toMatchObject({id,count:0,remaining:expect.any(Number),complete:true,blocked:false})
 })
 it('returns bounded counts rather than documents, and keeps manual receipts separate from historical notes',async()=>{
  const{t,owner,other}=fixture()
  await owner.mutation(api.frontierControls.setPolicy,{maxRecords:2,maxMediaBytes:1024,maxManualSaves:2})
  await t.run(async ctx=>{
   for(let i=0;i<4;i++)await ctx.db.insert('extensionPackages',{ownerKey:'owner',name:'private-'+i,version:'1.0.0',description:'Private body must never be sent',inputFields:['secretInput'],outputFields:['secretOutput'],status:'retired',createdAt:1})
   const memoryId=await ctx.db.insert('memories',{ownerKey:'owner',category:'old',key:'Private historical note',value:'Private note body',confidence:.5,source:'old'})
   await ctx.db.insert('manualMemoryAdmissions',{ownerKey:'owner',memoryId,createdAt:1})
   await ctx.db.insert('learningReviews',{ownerKey:'owner',kind:'retrieval',sourceIds:[],snapshots:[],notes:'Private review notes',summary:'Private computed summary',createdAt:1})
  })
  expect(await owner.query(api.resourceCapacity.collection,{id:'packages'})).toMatchObject({count:3,complete:false,limit:2,blocked:true})
  expect(await owner.query(api.resourceCapacity.collection,{id:'manual-memory'})).toMatchObject({count:1,limit:2})
  const review=await owner.query(api.resourceCapacity.collection,{id:'learning-reviews'})
  expect(review).toMatchObject({count:1,limit:20,remaining:19})
  const catalog=await owner.query(api.resourceCapacity.catalog,{})
  const own=await Promise.all(catalog.collections.map(({id})=>owner.query(api.resourceCapacity.collection,{id})))
  for(const secret of ['Private body','secretInput','secretOutput','Private historical note','Private note body','Private review notes','Private computed summary'])expect(JSON.stringify(own)).not.toContain(secret)
  const foreign=await Promise.all(catalog.collections.map(({id})=>other.query(api.resourceCapacity.collection,{id})))
  expect(foreign.every(row=>row.count===0)).toBe(true)
 })
})
