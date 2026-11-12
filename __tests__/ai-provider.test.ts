import { afterEach, expect, it, vi } from 'vitest'
import { callAiProvider } from '../convex/aiProvider'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
const response=(data:object)=>new Response(JSON.stringify({done:true,message:{content:'answer'},...data}),{status:200})
it('does not use old provider credentials when Ollama is unconfigured',async()=>{
 vi.stubEnv('OLLAMA_API_KEY','');vi.stubEnv('GROQ_API_KEY','retired');vi.stubEnv('CEREBRAS_API_KEY','retired')
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 await expect(callAiProvider('planner','Hi',100)).rejects.toThrow('OLLAMA_API_KEY');expect(fetcher).not.toHaveBeenCalled()
})
it('never leaks provider error bodies containing a key',async()=>{
 vi.stubEnv('OLLAMA_API_KEY','private-test-key');vi.stubGlobal('fetch',vi.fn(async()=>new Response('private-test-key',{status:401})))
 await expect(callAiProvider('planner','Hi',100)).rejects.toThrow('HTTP 401')
 try{await callAiProvider('planner','Hi',100)}catch(error){expect(String(error)).not.toContain('private-test-key')}
})
it('retains missing token components and costs as unknown',async()=>{
 vi.stubEnv('OLLAMA_API_KEY','test');vi.stubGlobal('fetch',vi.fn(async()=>response({prompt_eval_count:31})))
 const record=vi.fn();await callAiProvider('planner','Hi',100,record)
 expect(record).toHaveBeenCalledWith(expect.objectContaining({promptTokens:31,completionTokens:undefined,totalTokens:undefined,reportedCostUsd:undefined}))
})
it('preserves an explicitly reported zero cost and derives valid totals',async()=>{
 vi.stubEnv('OLLAMA_API_KEY','test');vi.stubGlobal('fetch',vi.fn(async()=>response({prompt_eval_count:31,eval_count:17,cost:0})))
 const record=vi.fn();await callAiProvider('planner','Hi',100,record)
 expect(record).toHaveBeenCalledWith(expect.objectContaining({promptTokens:31,completionTokens:17,totalTokens:48,reportedCostUsd:0}))
})
it.each([{prompt_eval_count:-1,eval_count:1.5,cost:-1},{prompt_eval_count:100000001,eval_count:null,cost:1000001}])('ignores invalid provider usage %j',async data=>{
 vi.stubEnv('OLLAMA_API_KEY','test');vi.stubGlobal('fetch',vi.fn(async()=>response(data)))
 const record=vi.fn();expect(await callAiProvider('planner','Hi',100,record)).toBe('answer');expect(record).not.toHaveBeenCalled()
})
