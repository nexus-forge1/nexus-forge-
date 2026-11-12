// @vitest-environment edge-runtime
import {describe,it,expect,vi,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api} from '../../convex/_generated/api'
import {discoverWebSources} from '../../convex/research'
const {model}=vi.hoisted(()=>({model:vi.fn()}))
vi.mock('../../convex/providerAccounting',()=>({callManagedAi:model}))
const modules=import.meta.glob('../../convex/**/*.ts')
const target='https://example.com/research',gateway='https://egress.example.org'
const link=(url:string)=>'<a class="result__a" href="https://html.duckduckgo.com/html/?uddg='+encodeURIComponent(url)+'">Source</a>'
function config(){vi.stubEnv('RESEARCH_EGRESS_GATEWAY_URL',gateway);vi.stubEnv('RESEARCH_EGRESS_GATEWAY_TOKEN','fixture-only')}
function fixture(){const t=convexTest(schema,modules);return{t,owner:t.withIdentity({subject:'owner'})}}
function page(body=link(target)){return new Response(body,{headers:{'content-type':'text/html'}})}
function envelope(data:unknown,status=200){return new Response(JSON.stringify(data),{status})}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();model.mockReset()})
describe('opportunity discovery hardened retrieval',()=>{
 it('rejects anonymous callers before network or inference',async()=>{
  const{t}=fixture(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  await expect(t.action(api.portfolio.discoverOpportunities,{theme:'private research'})).rejects.toThrow(/Authenticated/)
  expect(fetcher).not.toHaveBeenCalled();expect(model).not.toHaveBeenCalled()
 })
 it('bounds the theme before network or inference',async()=>{
  const{owner}=fixture(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  await expect(owner.action(api.portfolio.discoverOpportunities,{theme:'x'.repeat(501)})).rejects.toThrow(/500/)
  expect(fetcher).not.toHaveBeenCalled();expect(model).not.toHaveBeenCalled()
 })
 it('fails closed before search when the gateway is not configured',async()=>{
  vi.stubEnv('RESEARCH_EGRESS_GATEWAY_URL','');vi.stubEnv('RESEARCH_EGRESS_GATEWAY_TOKEN','')
  const{owner}=fixture(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  await expect(owner.action(api.portfolio.discoverOpportunities,{theme:'bounded opportunity'})).rejects.toThrow(/not configured/)
  expect(fetcher).not.toHaveBeenCalled();expect(model).not.toHaveBeenCalled()
 })
 it('uses only fixed search and the gateway, then stores recommendations under the authenticated owner',async()=>{
  config();const{t,owner}=fixture()
  const fetcher=vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(envelope({ok:true,status:200,contentType:'text/html',hops:[target],finalUrl:target,body:'<p>Retrieved evidence</p>'}))
  vi.stubGlobal('fetch',fetcher)
  model.mockResolvedValue(JSON.stringify({recommendations:[{title:'Bounded opportunity',mission:'Test a customer problem',rationale:['A controlled source'],evidence:[target+' — retrieved evidence']}]}))
  await owner.action(api.portfolio.discoverOpportunities,{theme:'bounded opportunity',ownerKey:'other'})
  expect(fetcher.mock.calls.map(([url])=>String(url))).toEqual([expect.stringMatching(/^https:\/\/html\.duckduckgo\.com\/html\/\?q=/),gateway+'/fetch'])
  expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',signal:expect.anything()})
  expect(fetcher.mock.calls[1][1]).toMatchObject({method:'POST',redirect:'error',signal:expect.anything()})
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({url:target,maxBytes:120000})
  expect(model.mock.calls[0][1].prompt).toContain('Retrieved evidence')
  expect(await t.run(ctx=>ctx.db.query('opportunityRecommendations').collect())).toEqual([expect.objectContaining({ownerKey:'owner',status:'recommended',title:'Bounded opportunity'})])
 })
 it.each([401,503])('does not fall back or run inference when the gateway returns %s',async status=>{
  config();const{t,owner}=fixture()
  const fetcher=vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(envelope({},status));vi.stubGlobal('fetch',fetcher)
  await expect(owner.action(api.portfolio.discoverOpportunities,{theme:'bounded opportunity'})).rejects.toThrow(/unavailable/)
  expect(fetcher).toHaveBeenCalledTimes(2);expect(model).not.toHaveBeenCalled()
  expect(await t.run(ctx=>ctx.db.query('opportunityRecommendations').collect())).toEqual([])
 })
 it('rejects private targets and off-origin wrappers without requesting them',async()=>{
  config()
  const html=link('https://127.0.0.1/admin')+link('https://metadata.google.internal/')+'<a class="result__a" href="https://attacker.example/?uddg='+encodeURIComponent(target)+'">Off origin</a>'
  const fetcher=vi.fn().mockResolvedValueOnce(page(html));vi.stubGlobal('fetch',fetcher)
  await expect(discoverWebSources('bounded opportunity',5)).rejects.toThrow(/no usable sources/)
  expect(fetcher).toHaveBeenCalledTimes(1)
 })
 it('retains unavailable-content metadata on source policy rejection without fetching the target directly',async()=>{
  config()
  const fetcher=vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(envelope({ok:false},400));vi.stubGlobal('fetch',fetcher)
  expect(await discoverWebSources('bounded opportunity',5)).toEqual([{url:target,title:'Source',snippet:''}])
  expect(fetcher.mock.calls.map(([url])=>String(url))).not.toContain(target)
  expect(fetcher).toHaveBeenCalledTimes(2)
 })
 it('bounds shared discovery arguments before network access',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  for(const [query,limit]of [['x',5],['x'.repeat(501),5],['valid question',6],['valid question',1.5]]as const)await expect(discoverWebSources(query,limit)).rejects.toThrow(/Discovery requires/)
  expect(fetcher).not.toHaveBeenCalled()
 })
})
