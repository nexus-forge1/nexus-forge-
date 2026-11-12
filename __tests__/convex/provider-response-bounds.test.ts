// @vitest-environment edge-runtime
import {afterEach,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
import {callAiProvider,callNamedEvaluationProvider} from '../../convex/aiProvider'
import {OLLAMA_MODELS} from '../../convex/ollamaModels'
const modules=import.meta.glob('../../convex/**/*.ts'),secret='controlled-fixture-'+('k'.repeat(48))
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
function configure(){vi.stubEnv('OLLAMA_API_KEY',secret);vi.stubEnv('AI_ALLOWANCE_ENFORCEMENT','true')}
it.each([200,429])('bounds oversized HTTP %s replies without issuing another inference',async status=>{
 configure()
 let pulls=0;const cancel=vi.fn()
 const stream=new ReadableStream<Uint8Array>({pull(c){pulls++;c.enqueue(new Uint8Array(200000));if(pulls===20)c.close()},cancel},{highWaterMark:0})
 const network=vi.fn().mockResolvedValue(new Response(stream,{status}));vi.stubGlobal('fetch',network)
 await expect(callAiProvider('planner','Controlled prompt',100)).rejects.toThrow(/Automatic fallback stopped/)
 expect(network).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalled();expect(pulls).toBeLessThan(20)
 expect(network.mock.calls[0][1].redirect).toBe('error')
})
it('omits a configured-key echo from a named-model rejection',async()=>{
 configure()
 const network=vi.fn().mockResolvedValue(new Response('prefix '.repeat(25)+secret,{status:401}));vi.stubGlobal('fetch',network)
 try{await callNamedEvaluationProvider('ollama-deepseek','Controlled prompt',100);throw Error('Expected rejection')}
 catch(error){const message=String(error);expect(message).toContain('HTTP 401');expect(message).not.toContain(secret)}
 expect(network).toHaveBeenCalledTimes(1)
})
it('rejects a retired provider before any network request',async()=>{
 configure();const network=vi.fn();vi.stubGlobal('fetch',network)
 await expect(callNamedEvaluationProvider('groq','Controlled prompt',100)).rejects.toThrow(/retired/)
 expect(network).not.toHaveBeenCalled()
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
 const network=vi.fn().mockResolvedValue(new Response('x'.repeat(1024*1024+1)));vi.stubGlobal('fetch',network)
 const results=await owner.action(api.providerHealth.check,{})
 expect(results.find((r:any)=>r.name==='ollama-deepseek')).toMatchObject({status:'degraded',detail:expect.stringContaining('could not be confirmed')})
 expect(network).toHaveBeenCalledTimes(1)
 const history=await owner.query(api.providerHealth.history,{})
 expect(history).toHaveLength(6)
 expect(await t.withIdentity({subject:'other'}).query(api.providerHealth.history,{})).toEqual([])
})
it('checks only the six selected Ollama models even when retired credentials remain configured',async()=>{
 const{owner}=await funded()
 vi.stubEnv('MISTRAL_API_KEY','mistral-fixture-key');vi.stubEnv('HUGGINGFACE_API_KEY','huggingface-fixture-key')
 const network=vi.fn().mockImplementation(async()=>Response.json({done:true,message:{content:'OK'},prompt_eval_count:1,eval_count:1,cost:0}))
 vi.stubGlobal('fetch',network)
 const results=await owner.action(api.providerHealth.check,{})
 expect(results).toHaveLength(6);expect(results.every((r:any)=>r.configured&&r.status==='healthy')).toBe(true)
 expect(network).toHaveBeenCalledTimes(6)
 expect(network.mock.calls.every(([url]:any[])=>String(url)==='https://ollama.com/api/chat')).toBe(true)
 const models=network.mock.calls.map(([,init]:any[])=>JSON.parse(String(init.body)).model).sort()
 expect(models).toEqual(OLLAMA_MODELS.map(row=>row.model).sort())
 expect(results.some((r:any)=>r.name==='mistral'||r.name==='huggingface')).toBe(false)
})
it.each(['body','transport'])('does not disclose keys in diagnostic %s failures',async kind=>{
 const{owner}=await funded()
 const network=kind==='body'?vi.fn().mockResolvedValue(new Response('prefix '.repeat(20)+secret,{status:401})):vi.fn().mockRejectedValue(new Error('transport '+secret))
 vi.stubGlobal('fetch',network)
 const results=await owner.action(api.providerHealth.check,{})
 expect(JSON.stringify(results)).not.toContain(secret)
 expect(network).toHaveBeenCalledTimes(1)
})
