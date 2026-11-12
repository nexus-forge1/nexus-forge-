import { afterEach, describe, expect, it, vi } from 'vitest'
import { callAiProvider, callGraphProvider, callNamedEvaluationProvider, getProviderRoutingPlan, graphProviderConfiguration } from '../convex/aiProvider'
import { OLLAMA_MODELS } from '../convex/ollamaModels'
import { reserveUsage } from '../convex/billingUsage'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
const reply=(model:string)=>new Response(JSON.stringify({model,done:true,message:{content:'OK'},prompt_eval_count:9,eval_count:2}),{status:200})
describe('Ollama Cloud integration',()=>{
 it('uses the six requested cloud IDs and no retired fallback',()=>{
  expect(OLLAMA_MODELS.map(m=>m.model)).toEqual(['deepseek-v4.1-flash','gemma4:31b','glm-5.3-flash','gpt-oss:120b','minimax-m3.1-flash','nemotron-3-nano:30b'])
  expect(getProviderRoutingPlan().fallbackOrder).toHaveLength(6)
  expect(getProviderRoutingPlan().roles.every(r=>r.failoverOrder.every(p=>p.startsWith('ollama-')))).toBe(true)
 })
 it('does not call inference without a real configured key',async()=>{
  vi.stubEnv('OLLAMA_API_KEY','');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  await expect(callAiProvider('planner','Hi',512)).rejects.toThrow('OLLAMA_API_KEY')
  expect(fetcher).not.toHaveBeenCalled()
 })
 it('sends authenticated native cloud requests and records token counts',async()=>{
  vi.stubEnv('OLLAMA_API_KEY','test-secret');const record=vi.fn(),fetcher=vi.fn(async()=>reply('deepseek-v4.1-flash'));vi.stubGlobal('fetch',fetcher)
  expect(await callAiProvider('planner','Hi',512,record)).toBe('OK')
  const [url,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit]
  expect(url).toBe('https://ollama.com/api/chat')
  expect((options.headers as Record<string,string>).Authorization).toBe('Bearer test-secret')
  expect(JSON.parse(String(options.body))).toMatchObject({model:'deepseek-v4.1-flash',stream:false,options:{num_predict:512}})
  expect(record).toHaveBeenCalledWith(expect.objectContaining({provider:'ollama-deepseek',model:'deepseek-v4.1-flash',promptTokens:9,completionTokens:2,totalTokens:11}))
 })
 it.each([401,403,429,500])('does not multiply account-wide or uncertain paid work (%s)',async status=>{
  vi.stubEnv('OLLAMA_API_KEY','test-secret');const fetcher=vi.fn(async()=>new Response('test-secret',{status}));vi.stubGlobal('fetch',fetcher)
  await expect(callAiProvider('planner','Hi',512)).rejects.toThrow(status===500?'Automatic fallback stopped':'HTTP '+status)
  expect(fetcher).toHaveBeenCalledTimes(1)
 })
 it('falls back within the selected models only after a model rejection',async()=>{
  vi.stubEnv('OLLAMA_API_KEY','test-secret');const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(reply('gemma4:31b'));vi.stubGlobal('fetch',fetcher)
  expect(await callAiProvider('planner','Hi',512)).toBe('OK');expect(fetcher).toHaveBeenCalledTimes(2)
 })
 it('never replays a successful call when accounting persistence fails',async()=>{
  vi.stubEnv('OLLAMA_API_KEY','test-secret');const fetcher=vi.fn(async()=>reply('deepseek-v4.1-flash'));vi.stubGlobal('fetch',fetcher)
  expect(await callAiProvider('planner','Hi',512,async()=>{throw Error('save failed')})).toBe('OK');expect(fetcher).toHaveBeenCalledTimes(1)
 })
 it('refuses retired graph and evaluation providers',async()=>{
  vi.stubEnv('OLLAMA_API_KEY','test-secret');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  expect(graphProviderConfiguration('groq').configured).toBe(false)
  await expect(callGraphProvider('groq','old-model','Hi',256)).rejects.toThrow('unavailable')
  await expect(callNamedEvaluationProvider('cerebras','Hi',256)).rejects.toThrow('retired')
  expect(fetcher).not.toHaveBeenCalled()
 })
 it('pauses wallet admission without reading balances or requiring Stripe configuration',async()=>{
  vi.stubEnv('AI_ALLOWANCE_ENFORCEMENT','false');vi.stubEnv('VITE_STRIPE_MODE','')
  const db=new Proxy({},{get:()=>{throw Error('wallet accessed')}})
  await expect(reserveUsage({db},'invocation','owner')).resolves.toBeUndefined()
 })
 it('does not accept thinking-only or wrong-model answers as usable completions',async()=>{
  vi.stubEnv('OLLAMA_API_KEY','test-secret');const fetcher=vi.fn(async()=>new Response(JSON.stringify({model:'unexpected',done:true,message:{thinking:'OK'}}),{status:200}));vi.stubGlobal('fetch',fetcher)
  await expect(callAiProvider('planner','Hi',512)).rejects.toThrow('Automatic fallback stopped');expect(fetcher).toHaveBeenCalledTimes(1)
 })
})
