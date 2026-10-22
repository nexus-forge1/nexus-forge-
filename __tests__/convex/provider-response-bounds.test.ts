// @vitest-environment edge-runtime
import {afterEach,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
import {callAiProvider,callNamedEvaluationProvider} from '../../convex/aiProvider'
const modules=import.meta.glob('../../convex/**/*.ts'),secret='fixture-only-provider-key-'+('k'.repeat(48))
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
function configure(){
 for(const name of ['GROQ_API_KEY','CEREBRAS_API_KEY','CLOUDFLARE_API_TOKEN','OPENROUTER_API_KEY','MISTRAL_API_KEY','HUGGINGFACE_API_KEY'])vi.stubEnv(name,'')
 vi.stubEnv('GROQ_API_KEY',secret)
}
it.each([200,429])('bounds oversized HTTP %s replies without issuing another inference',async status=>{
 configure();vi.stubEnv('CEREBRAS_API_KEY','fixture-fallback-key')
 let pulls=0;const cancel=vi.fn()
 const stream=new ReadableStream<Uint8Array>({pull(c){pulls++;c.enqueue(new Uint8Array(200000));if(pulls===20)c.close()},cancel},{highWaterMark:0})
 const network=vi.fn().mockResolvedValue(new Response(stream,{status}));vi.stubGlobal('fetch',network)
 await expect(callAiProvider('planner','Controlled prompt',100)).rejects.toThrow(/Automatic fallback stopped/)
 expect(network).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalled();expect(pulls).toBeLessThan(20)
 expect(network.mock.calls[0][1].redirect).toBe('error')
})
it('redacts a configured-key echo before truncating a named-provider rejection',async()=>{
 configure()
 const network=vi.fn().mockResolvedValue(new Response('prefix '.repeat(25)+secret,{status:401}));vi.stubGlobal('fetch',network)
 try{await callNamedEvaluationProvider('groq','Controlled prompt',100);throw Error('Expected rejection')}
 catch(error){const message=String(error);expect(message).toContain('[redacted]');expect(message).not.toContain(secret.slice(0,20))}
 expect(network).toHaveBeenCalledTimes(1)
})
async function funded(){
 configure();vi.stubEnv('CONVEX_CLOUD_URL','https://quick-rabbit-810.eu-west-1.convex.cloud');vi.stubEnv('VITE_STRIPE_MODE','test')
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'health-owner'})
 await t.mutation(internal.billing.seed,{})
 const intent=await owner.mutation(internal.billing.intent,{sku:'credit-10',requestKey:'health_fixture_checkout_001'})
 await t.mutation(internal.billing.grant,{intentId:intent.id,mode:'test',key:'fixture-health-grant',paidCents:intent.product.price*100,customerId:'fixture-health-customer'})
 return{t,owner}
}
it('bounds diagnostic responses while retaining owner-private failure evidence',async()=>{
 const{t,owner}=await funded()
 const network=vi.fn().mockResolvedValue(new Response('x'.repeat(256*1024+1)));vi.stubGlobal('fetch',network)
 const results=await owner.action(api.providerHealth.check,{})
 expect(results.find((r:any)=>r.name==='groq')).toMatchObject({status:'offline',detail:expect.stringContaining('could not be confirmed')})
 expect(network).toHaveBeenCalledTimes(1)
 const history=await owner.query(api.providerHealth.history,{})
 expect(history).toHaveLength(4)
 expect(await t.withIdentity({subject:'other'}).query(api.providerHealth.history,{})).toEqual([])
})
it.each(['body','transport'])('does not disclose keys in diagnostic %s failures',async kind=>{
 const{owner}=await funded()
 const network=kind==='body'?vi.fn().mockResolvedValue(new Response('prefix '.repeat(20)+secret,{status:401})):vi.fn().mockRejectedValue(new Error('transport '+secret))
 vi.stubGlobal('fetch',network)
 const results=await owner.action(api.providerHealth.check,{})
 expect(JSON.stringify(results)).not.toContain(secret.slice(0,20))
 expect(network).toHaveBeenCalledTimes(1)
})
