// @vitest-environment edge-runtime
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
import {scoreAnswer} from '../../convex/liveComparisons'
const modules=import.meta.glob('../../convex/**/*.ts')
const answer='{"arithmetic":"89","sorting":"2,5,9","logic":"yes"}'
beforeEach(()=>{
 vi.stubEnv('VITE_STRIPE_MODE','test');vi.stubEnv('CONVEX_CLOUD_URL','https://quick-rabbit-810.eu-west-1.convex.cloud')
 vi.stubEnv('CLOUDFLARE_ACCOUNT_ID','fixture');vi.stubEnv('CLOUDFLARE_API_TOKEN','fixture')
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
async function fixture(prepaid=1000){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 await t.run(c=>c.db.insert('billingAccounts',{ownerKey:'owner',mode:'test',prepaid,included:0,expiresAt:0,held:0,unresolved:0,frozen:false}))
 const network=vi.fn(async()=>Response.json({choices:[{message:{content:answer}}]}))
 vi.stubGlobal('fetch',network)
 return {t,owner,other,network}
}
it('retains an answered row and five unstarted cases when unknown usage blocks the next admission',async()=>{
 const {t,owner,network}=await fixture()
 const args={requestKey:'partial-comparison-0001'},result=await owner.action(api.liveComparisons.run,args),report=JSON.parse(result)
 expect(report.status).toBe('partial')
 expect(report.rows[0]).toMatchObject({status:'complete',answer,passed:3})
 expect(report.rows.slice(1).every((row:any)=>row.status==='not_run'&&!row.invocationId)).toBe(true)
 expect(network).toHaveBeenCalledTimes(1)
 const jobs=await owner.query(api.runtimeReceipts.list,{})
 expect(jobs[0]).toMatchObject({status:'failed',result})
 await expect(owner.action(api.liveComparisons.run,args)).rejects.toThrow(/already attempted/)
 expect(network).toHaveBeenCalledTimes(1)
 expect(await t.run(c=>c.db.query('providerInvocations').collect())).toHaveLength(1)
 expect((await owner.query(api.billing.mine,{})).account).toMatchObject({held:100,unresolved:1})
})
it('records all cases as unstarted when initial accounting admission fails, without inference',async()=>{
 const {t,owner,network}=await fixture(0)
 const report=JSON.parse(await owner.action(api.liveComparisons.run,{requestKey:'unfunded-comparison-0001'}))
 expect(report.rows).toHaveLength(6)
 expect(report.rows.every((row:any)=>row.status==='not_run')).toBe(true)
 expect(network).not.toHaveBeenCalled()
 expect(await t.run(c=>c.db.query('providerInvocations').collect())).toEqual([])
})
it('protects checkpoint ownership, append-only rows and pending request identity',async()=>{
 const {owner,other}=await fixture()
 const report=JSON.parse(await owner.action(api.liveComparisons.run,{requestKey:'source-progress-0001'}))
 const admitted=await owner.mutation(internal.runtimeReceipts.admit,{ownerKey:'owner',kind:'provider-comparison',requestKey:'checkpoint-fixture-0001',input:'{"version":"matched-provider-comparison-v2"}'})
 const snapshot={...report,rows:report.rows.slice(0,1),status:'in-progress'}
 await owner.mutation(internal.liveComparisons.checkpoint,{jobId:admitted.jobId,result:JSON.stringify(snapshot)})
 await expect(other.mutation(internal.liveComparisons.checkpoint,{jobId:admitted.jobId,result:JSON.stringify(snapshot)})).rejects.toThrow(/cannot be changed/)
 await expect(owner.mutation(internal.liveComparisons.checkpoint,{jobId:admitted.jobId,result:JSON.stringify({...snapshot,rows:[]})})).rejects.toThrow(/immutable/)
 await expect(owner.mutation(internal.liveComparisons.checkpoint,{jobId:admitted.jobId,result:JSON.stringify({...snapshot,rows:[{...snapshot.rows[0],answer:'changed'}]})})).rejects.toThrow(/immutable/)
 await expect(owner.action(api.liveComparisons.run,{requestKey:'checkpoint-fixture-0001'})).rejects.toThrow(/already attempted/)
})
it('rejects extra response keys and retains failures for invalid JSON envelopes',()=>{
 expect(scoreAnswer('{"arithmetic":"89","sorting":"2,5,9","logic":"yes","extra":"unsupported"}').every(row=>!row.passed)).toBe(true)
 const fence=String.fromCharCode(96).repeat(3)
 for(const raw of ['null','[]','89',fence+'json\n'+answer+'\n'+fence])expect(scoreAnswer(raw).every(row=>!row.passed)).toBe(true)
 expect(scoreAnswer(answer).every(row=>row.passed)).toBe(true)
})
