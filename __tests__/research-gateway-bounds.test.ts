// @vitest-environment edge-runtime
import {afterEach,describe,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {internal} from '../convex/_generated/api'
import {fetchResearchPageViaGateway} from '../convex/research'
const modules=import.meta.glob('../convex/**/*.ts'),url='https://example.com/research'
const valid={ok:true,status:200,contentType:'text/html',finalUrl:url,hops:[url],body:'Valid source'}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
function config(response:Response){
 vi.stubEnv('RESEARCH_EGRESS_GATEWAY_URL','https://egress.example.com')
 vi.stubEnv('RESEARCH_EGRESS_GATEWAY_TOKEN','fixture-only')
 const fetcher=vi.fn().mockResolvedValue(response);vi.stubGlobal('fetch',fetcher);return fetcher
}
describe('bounded research gateway contracts',()=>{
 it('stops oversized streamed replies and cancels before consuming the full stream',async()=>{
  let pulls=0;const cancel=vi.fn()
  const body=new ReadableStream<Uint8Array>({pull(c){pulls++;c.enqueue(new Uint8Array(200000).fill(32));if(pulls===20)c.close()},cancel},{highWaterMark:0})
  const fetcher=config(new Response(body))
  await expect(fetchResearchPageViaGateway(url)).rejects.toThrow(/oversized/)
  expect(cancel).toHaveBeenCalled();expect(pulls).toBeLessThan(20);expect(fetcher).toHaveBeenCalledTimes(1)
 })
 it('accepts the exact UTF-8 source limit with JSON-escaped content',async()=>{
  const body='\u0000'.repeat(120000)
  config(Response.json({...valid,body}))
  expect((await fetchResearchPageViaGateway(url)).body).toBe(body)
 })
 it.each([
  {body:'界'.repeat(40001)},
  {body:123},
  {status:NaN},
  {status:99},
  {contentType:'x'.repeat(257)},
 ])('rejects invalid or excessive decoded contracts %j',async patch=>{
  config(Response.json({...valid,...patch}))
  await expect(fetchResearchPageViaGateway(url)).rejects.toThrow(/invalid page contract/)
 })
 it('does not accept a successful-looking body on a failed HTTP response',async()=>{
  config(Response.json(valid,{status:403}))
  await expect(fetchResearchPageViaGateway(url)).rejects.toThrow(/invalid page contract/)
 })
 it('rejects more redirect hops than the supported gateway policy',async()=>{
  config(Response.json({...valid,hops:Array(6).fill(url)}))
  await expect(fetchResearchPageViaGateway(url)).rejects.toThrow(/redirect chain/)
 })
 it('rejects malformed JSON and truncated UTF-8 without direct-fetch fallback',async()=>{
  const fetcher=config(new Response(new Uint8Array([123,34,120,34,58,34,0xe2,0x82])))
  await expect(fetchResearchPageViaGateway(url)).rejects.toThrow(/invalid or oversized/)
  expect(fetcher).toHaveBeenCalledTimes(1)
 })
 it('bounds health replies and retains only short policy labels',async()=>{
  config(Response.json({ok:true,policy:'x'.repeat(9000)}))
  const t=convexTest(schema,modules)
  expect(await t.action(internal.research.egressHealth,{})).toEqual({configured:true,healthy:false,policy:null})
 })
})
