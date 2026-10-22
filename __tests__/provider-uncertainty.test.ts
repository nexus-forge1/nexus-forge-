import { afterEach, expect, it, vi } from 'vitest'
import { callAiProvider } from '../convex/aiProvider'
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function setup(response: () => Promise<Response>) {
 vi.stubEnv('GROQ_API_KEY','test'); vi.stubEnv('CEREBRAS_API_KEY','test')
 vi.stubEnv('CLOUDFLARE_API_TOKEN','')
 const fetchMock=vi.fn().mockImplementation(response); vi.stubGlobal('fetch',fetchMock)
 return fetchMock
}
it.each([408,409,425,500,502,503,504])('does not replay HTTP %i uncertainty',async status=>{
 const fetchMock=setup(async()=>new Response('uncertain',{status}))
 await expect(callAiProvider('planner','test',100)).rejects.toThrow(/review the invocation/)
 expect(fetchMock).toHaveBeenCalledTimes(1)
})
it.each(['transport','body','json','empty'])('does not replay a %s failure',async kind=>{
 const fetchMock=setup(async()=>{
  if(kind==='transport')throw new Error('socket closed')
  if(kind==='body')return new Response(new ReadableStream({start(controller){controller.error(new Error('body interrupted'))}}),{status:200})
  return new Response(kind==='json'?'invalid':JSON.stringify({choices:[]}),{status:200})
 })
 await expect(callAiProvider('planner','test',100)).rejects.toThrow(/Automatic fallback stopped/)
 expect(fetchMock).toHaveBeenCalledTimes(1)
})
it.each([400,401,403,404,405,413,415,422,429])('allows fallback after explicit HTTP %i rejection',async status=>{
 const fetchMock=setup(async()=>new Response('rejected',{status}))
 fetchMock.mockResolvedValueOnce(new Response('rejected',{status}))
 fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({text:'accepted'}),{status:200}))
 await expect(callAiProvider('planner','test',100)).resolves.toBe('accepted')
 expect(fetchMock).toHaveBeenCalledTimes(2)
})
