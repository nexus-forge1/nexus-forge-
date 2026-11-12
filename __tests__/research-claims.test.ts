import { describe,it,expect } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api } from '../convex/_generated/api'
const modules=import.meta.glob('../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const missionId=await t.run(c=>c.db.insert('missions',{ownerKey:'owner',title:'Research',mission:'Assess evidence',autonomy:'guided',budget:0,status:'draft',approved:false,completion:0}))
 const researchId=await t.run(c=>c.db.insert('research',{missionId,query:'Demand evidence',result:'The survey included forty respondents. Adoption remains uncertain.',citations:['https://example.com/report','javascript:alert(1)'],createdAt:100}))
 const args={missionId,researchId,claim:'Customers need this product',citation:'https://example.com/report',excerpt:'The survey included forty respondents.',finding:'unresolved' as const,rationale:'The sample does not establish adoption.'}
 return {t,owner,other,missionId,researchId,args}
}
describe('private research claim reviews',()=>{
 it('retains an exact immutable snapshot and handles identical retries',async()=>{
  const {t,owner,researchId,args,missionId}=await fixture()
  const id=await owner.mutation(api.researchClaims.record,args)
  expect(await owner.mutation(api.researchClaims.record,args)).toBe(id)
  await t.run(c=>c.db.patch(researchId,{result:'Research changed',query:'Changed query',citations:[]}))
  const rows=await owner.query(api.researchClaims.list,{missionId})
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({...args,researchQuery:'Demand evidence',researchSavedAt:100,ownerKey:'owner'})
 })
 it('rejects anonymous and foreign-owner reads and writes',async()=>{
  const {t,owner,other,args,missionId}=await fixture();await owner.mutation(api.researchClaims.record,args)
  for(const client of [t,other]){
   await expect(client.query(api.researchClaims.list,{missionId})).rejects.toThrow()
   await expect(client.mutation(api.researchClaims.record,args)).rejects.toThrow()
  }
 })
 it('rejects research from another mission even for the same owner',async()=>{
  const {t,owner,args}=await fixture()
  const missionId=await t.run(c=>c.db.insert('missions',{ownerKey:'owner',title:'Other',mission:'Different scope',autonomy:'guided',budget:0,status:'draft',approved:false,completion:0}))
  await expect(owner.mutation(api.researchClaims.record,{...args,missionId})).rejects.toThrow(/selected mission/)
 })
 it('rejects fabricated excerpts and citations and unsafe saved URLs',async()=>{
  const {owner,args}=await fixture()
  await expect(owner.mutation(api.researchClaims.record,{...args,excerpt:'A fabricated quotation.'})).rejects.toThrow(/match/)
  await expect(owner.mutation(api.researchClaims.record,{...args,citation:'https://unlisted.example/'})).rejects.toThrow(/exact citation/)
  await expect(owner.mutation(api.researchClaims.record,{...args,citation:'javascript:alert(1)'})).rejects.toThrow(/usable web/)
 })
 it('retains opposing assessments without promoting either to verified truth',async()=>{
  const {owner,args,missionId}=await fixture()
  await owner.mutation(api.researchClaims.record,{...args,finding:'supporting'})
  await owner.mutation(api.researchClaims.record,{...args,finding:'contradicting'})
  expect((await owner.query(api.researchClaims.list,{missionId})).map(r=>r.finding).sort()).toEqual(['contradicting','supporting'])
 })
 it('bounds text and rejects blank review rationale',async()=>{
  const {owner,args}=await fixture()
  for(const change of [{claim:'short'},{claim:'x'.repeat(1501)},{excerpt:'x'.repeat(2001)},{rationale:'  '}]){
   await expect(owner.mutation(api.researchClaims.record,{...args,...change})).rejects.toThrow()
  }
 })
 it('serializes the 100-review capacity and still returns an identical receipt at the cap',async()=>{
  const {t,owner,args,missionId}=await fixture()
  await t.run(async c=>{for(let i=0;i<99;i++)await c.db.insert('researchClaims',{...args,claim:'Existing claim '+i,researchQuery:'Demand evidence',researchSavedAt:100,createdAt:100,ownerKey:'owner'})})
  const results=await Promise.allSettled([owner.mutation(api.researchClaims.record,args),owner.mutation(api.researchClaims.record,{...args,claim:'Different final claim'})])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  const rows=await owner.query(api.researchClaims.list,{missionId});expect(rows).toHaveLength(100)
  const final=rows.find(r=>r.claim===args.claim||r.claim==='Different final claim')!
  expect(await owner.mutation(api.researchClaims.record,{...args,claim:final.claim})).toBe(final._id)
 })
})
