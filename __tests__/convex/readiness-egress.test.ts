// @vitest-environment edge-runtime
import {afterEach,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts'),url='https://example.com/'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
function fixture(){
 const t=convexTest(schema,modules)
 vi.stubEnv('RESEARCH_EGRESS_GATEWAY_URL','https://egress.example.org')
 vi.stubEnv('RESEARCH_EGRESS_GATEWAY_TOKEN','fixture-only')
 return{t,owner:t.withIdentity({subject:'owner'}),other:t.withIdentity({subject:'other'})}
}
const html='<!doctype html><html><head><title>Controlled deployment</title><meta name="viewport" content="width=device-width"><meta charset="utf-8"></head><body>Fixture</body></html>'
it('uses only the gateway for redirected readiness and retains private six-check evidence',async()=>{
 const{owner,other}=fixture(),finalUrl='https://www.example.com/'
 const network=vi.fn().mockResolvedValue(Response.json({ok:true,status:200,contentType:'text/html; charset=utf-8',body:html,hops:[url,finalUrl],finalUrl}));vi.stubGlobal('fetch',network)
 const result=await owner.action(api.readiness.run,{siteUrl:url})
 expect(result).toMatchObject({status:'pass',passedCount:6,totalCount:6})
 expect(network).toHaveBeenCalledTimes(1);expect(network.mock.calls[0][0]).toBe('https://egress.example.org/fetch')
 expect(JSON.parse(network.mock.calls[0][1].body)).toEqual({url,maxBytes:120000})
 const stored=await owner.query(api.readiness.getRun,{runId:result.runId})
 expect(stored.checks).toHaveLength(6);expect(JSON.stringify(stored)).toContain(finalUrl)
 await expect(other.query(api.readiness.getRun,{runId:result.runId})).rejects.toThrow(/access denied/)
})
it('fails closed without a configured gateway and makes no direct request',async()=>{
 const{owner}=fixture();vi.stubEnv('RESEARCH_EGRESS_GATEWAY_URL','')
 const network=vi.fn();vi.stubGlobal('fetch',network)
 expect(await owner.action(api.readiness.run,{siteUrl:url})).toMatchObject({status:'fail'})
 expect(network).not.toHaveBeenCalled()
})
it('does not fetch HTTP or unsafe destinations',async()=>{
 const{owner}=fixture(),network=vi.fn();vi.stubGlobal('fetch',network)
 expect(await owner.action(api.readiness.run,{siteUrl:'http://example.com/'})).toMatchObject({status:'fail'})
 await expect(owner.action(api.readiness.run,{siteUrl:'https://127.0.0.1/'})).rejects.toThrow(/hostname/)
 expect(network).not.toHaveBeenCalled()
})
it('does not use body content from an unsafe redirect or an oversized source',async()=>{
 const{owner}=fixture()
 const network=vi.fn().mockResolvedValueOnce(Response.json({ok:true,status:200,contentType:'text/html',body:html,hops:[url,'https://127.0.0.1/'],finalUrl:'https://127.0.0.1/'})).mockResolvedValueOnce(Response.json({ok:true,status:200,contentType:'text/html',body:html+'x'.repeat(120000),hops:[url],finalUrl:url}))
 vi.stubGlobal('fetch',network)
 for(let i=0;i<2;i++)expect(await owner.action(api.readiness.run,{siteUrl:url})).toMatchObject({status:'fail'})
 expect(network.mock.calls.every(c=>c[0]==='https://egress.example.org/fetch')).toBe(true)
})
it('bounds readiness metadata before egress or evidence writes',async()=>{
 const{t,owner}=fixture(),network=vi.fn();vi.stubGlobal('fetch',network)
 await expect(owner.action(api.readiness.run,{siteUrl:url,label:'x'.repeat(161)})).rejects.toThrow(/160/)
 await expect(owner.action(api.readiness.run,{siteUrl:url+'x'.repeat(2048)})).rejects.toThrow(/2048/)
 expect(network).not.toHaveBeenCalled()
 expect(await t.run(c=>c.db.query('readinessRuns').collect())).toEqual([])
})
it('denies anonymous calls before egress and retains previous runs when a target is rejected',async()=>{
 const{t,owner}=fixture(),network=vi.fn().mockResolvedValue(Response.json({ok:false},{status:400}));vi.stubGlobal('fetch',network)
 await expect(t.action(api.readiness.run,{siteUrl:url})).rejects.toThrow(/Authenticated/)
 expect(network).not.toHaveBeenCalled()
 const a=await owner.action(api.readiness.run,{siteUrl:url}),b=await owner.action(api.readiness.run,{siteUrl:url})
 const history=await owner.query(api.readiness.listRuns,{})
 expect(history.map((r:any)=>r._id)).toEqual([b.runId,a.runId])
})
