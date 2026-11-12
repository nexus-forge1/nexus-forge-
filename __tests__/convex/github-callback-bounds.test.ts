// @vitest-environment edge-runtime
import {describe,it,expect,vi,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
const modules=import.meta.glob('../../convex/**/*.ts')
afterEach(()=>vi.unstubAllEnvs())
describe('GitHub callback request boundaries',()=>{
 for(const path of ['delivery-result','deployment-result']){
  it(path+' authenticates before consuming a body',async()=>{
   vi.stubEnv('NEXUS_FORGE_DELIVERY_SECRET','callback-test-only')
   const t=convexTest(schema,modules)
   const response=await t.fetch('/github-actions/'+path,{method:'POST',body:'{'.repeat(20000)})
   expect(response.status).toBe(401)
   expect(await t.run(ctx=>ctx.db.query('deliveries').collect())).toEqual([])
  })
  it(path+' rejects oversized and malformed authenticated bodies without delivery effects',async()=>{
   vi.stubEnv('NEXUS_FORGE_DELIVERY_SECRET','callback-test-only')
   const t=convexTest(schema,modules)
   for(const body of [JSON.stringify({summary:'😀'.repeat(5000)}),'{']){
    const response=await t.fetch('/github-actions/'+path,{method:'POST',headers:{Authorization:'Bearer callback-test-only'},body})
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({error:'Invalid JSON body'})
   }
   expect(await t.run(ctx=>ctx.db.query('deliveries').collect())).toEqual([])
   expect(await t.run(ctx=>ctx.db.query('readinessRuns').collect())).toEqual([])
  })
 }
})
