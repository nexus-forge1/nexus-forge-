import {afterEach,describe,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api,internal} from '../convex/_generated/api'
const modules=import.meta.glob('../convex/**/*.ts'),url='https://example.com/report'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const missionId=await t.run(c=>c.db.insert('missions',{ownerKey:'owner',title:'Controlled source capture',mission:'Verify source provenance',autonomy:'guided',budget:0,status:'draft',approved:false,completion:0}))
 const researchId=await t.run(c=>c.db.insert('research',{missionId,query:'Source evidence',result:'An AI-style summary that is not the source quotation.',citations:[url,'https://localhost/private'],createdAt:100}))
 vi.stubEnv('RESEARCH_EGRESS_GATEWAY_URL','https://egress.test');vi.stubEnv('RESEARCH_EGRESS_GATEWAY_TOKEN','fixture-token')
 const fetchMock=vi.fn(async(_input:unknown)=>new Response(JSON.stringify({ok:true,status:200,contentType:'text/html; charset=utf-8',finalUrl:url,hops:[url],body:'<title>Controlled report</title><meta property="article:published_time" content="2026-01-01"><p>The source reports ten completed observations.</p>'}),{status:200}))
 vi.stubGlobal('fetch',fetchMock)
 const capture=()=>owner.action(api.researchSources.capture,{researchId,citation:url})
 return {t,owner,other,missionId,researchId,capture,fetchMock}
}
describe('private source snapshot receipts',()=>{
 it('uses only the configured gateway and stores a bounded hashed source snapshot',async()=>{
  const {owner,researchId,capture,fetchMock}=await fixture()
  const id=await capture(),rows=await owner.query(api.researchSources.list,{researchId}),snapshot=rows[0].snapshot!
  expect(rows[0]).toMatchObject({_id:id,status:'captured',citation:url})
  expect(snapshot.extractedText).toContain('ten completed observations')
  expect(snapshot.textSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(snapshot).toMatchObject({title:'Controlled report',publicationStatus:'declared',publicationDate:'2026-01-01T00:00:00.000Z',bodyLimitReached:false})
  expect(fetchMock).toHaveBeenCalledOnce();expect(fetchMock.mock.calls[0][0]).toBe('https://egress.test/fetch')
 })
 it('denies anonymous/foreign access and rejects unsafe or unlisted citations before fetch',async()=>{
  const {t,owner,other,researchId,fetchMock}=await fixture()
  for(const client of [t,other]){
   await expect(client.action(api.researchSources.capture,{researchId,citation:url})).rejects.toThrow()
   await expect(client.query(api.researchSources.list,{researchId})).rejects.toThrow()
  }
  for(const citation of ['https://unlisted.example/','https://localhost/private']){
   await expect(owner.action(api.researchSources.capture,{researchId,citation})).rejects.toThrow()
  }
  expect(fetchMock).not.toHaveBeenCalled()
 })
 it('fails closed when the gateway is absent and retains the failed attempt',async()=>{
  const {owner,researchId,capture,fetchMock}=await fixture();vi.stubEnv('RESEARCH_EGRESS_GATEWAY_URL','')
  await expect(capture()).rejects.toThrow(/attempt is recorded/)
  expect(fetchMock).not.toHaveBeenCalled()
  const failed=(await owner.query(api.researchSources.list,{researchId}))[0]
  expect(failed.status).toBe('failed');expect(failed.snapshot).toBeUndefined()
 })
 it('rejects redirect policy failures and unsupported source bodies without a direct fallback',async()=>{
  const {owner,researchId,capture,fetchMock}=await fixture()
  fetchMock.mockImplementationOnce(async()=>new Response(JSON.stringify({ok:true,status:200,contentType:'text/html',finalUrl:'https://localhost/private',hops:[url,'https://localhost/private'],body:'Unsafe'}),{status:200}))
  await expect(capture()).rejects.toThrow()
  fetchMock.mockImplementationOnce(async()=>new Response(JSON.stringify({ok:true,status:200,contentType:'application/pdf',finalUrl:url,hops:[url],body:'PDF'}),{status:200}))
  await expect(capture()).rejects.toThrow()
  expect(fetchMock).toHaveBeenCalledTimes(2);expect((await owner.query(api.researchSources.list,{researchId})).every(r=>r.status==='failed')).toBe(true)
 })
 it('validates source excerpts against the exact capture and preserves summary reviews separately',async()=>{
  const {owner,missionId,researchId,capture}=await fixture(),id=await capture()
  const args={missionId,researchId,citation:url,claim:'The report describes completed observations',finding:'supporting' as const,excerpt:'The source reports ten completed observations.',rationale:'The captured text states the observed count.'}
  await expect(owner.mutation(api.researchClaims.record,args)).rejects.toThrow(/saved research/)
  const reviewId=await owner.mutation(api.researchClaims.record,{...args,sourceCaptureId:id})
  expect(await owner.mutation(api.researchClaims.record,{...args,sourceCaptureId:id})).toBe(reviewId)
  const rows=await owner.query(api.researchClaims.list,{missionId})
  expect(rows[0]).toMatchObject({sourceCaptureId:id,excerptBasis:'retrieved_source',sourceFinalUrl:url})
  expect(rows[0].sourceTextSha256).toMatch(/^[a-f0-9]{64}$/)
  await expect(owner.mutation(api.researchClaims.record,{...args,sourceCaptureId:id,excerpt:'Fabricated content not in the source'})).rejects.toThrow(/retrieved source/)
 })
 it('rejects a capture belonging to another research record',async()=>{
  const {t,owner,missionId,researchId,capture}=await fixture(),id=await capture()
  const otherResearch=await t.run(c=>c.db.insert('research',{missionId,query:'Different research',result:'Different summary',citations:[url],createdAt:100}))
  await expect(owner.mutation(api.researchClaims.record,{missionId,researchId:otherResearch,citation:url,sourceCaptureId:id,claim:'An unrelated claim for another record',finding:'unresolved',excerpt:'The source reports ten completed observations.',rationale:'This must not cross the source record boundary.'})).rejects.toThrow(/exact research/)
 })
 it('bounds concurrent retrieval admission and does not overwrite terminal receipts',async()=>{
  const {t,owner,researchId,capture}=await fixture()
  for(let i=0;i<9;i++)await t.mutation(internal.researchSources.reserve,{ownerKey:'owner',researchId,citation:url})
  const results=await Promise.allSettled([capture(),capture()])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  const rows=await owner.query(api.researchSources.list,{researchId});expect(rows).toHaveLength(10)
  const captured=rows.find(r=>r.status==='captured')!
  await t.mutation(internal.researchSources.finish,{id:captured._id,ownerKey:'owner',failureReason:'Cannot overwrite completed capture'})
  expect((await owner.query(api.researchSources.list,{researchId})).find(r=>r._id===captured._id)?.status).toBe('captured')
 })
})
