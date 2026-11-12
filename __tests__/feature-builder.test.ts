// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {transformSync} from 'esbuild'
import * as server from 'convex/server'
import * as values from 'convex/values'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import type {Id} from '../convex/_generated/dataModel'
import {requireOperator} from '../convex/permissions'
import {featureSources} from '../convex/featurePackSources'
import {featureKey,taskTitle} from '../convex/featureBuilderModel'
const modules=import.meta.glob('../convex/**/*.ts')
// Only internally generated fixed templates are evaluated here; app-runtime never evaluates uploaded source.
function compile(source:string,path:string){
 const result=transformSync(source,{sourcefile:path,loader:path.endsWith('.tsx')?'tsx':'ts',format:'cjs',target:'es2022',jsx:'automatic'})
 return result.code
}
function emittedModule(source:string,path:string){
 const module={exports:{} as Record<string,unknown>}
 const deps:Record<string,unknown>={'convex/server':server,'convex/values':values,'./_generated/server':{query:server.queryGeneric,mutation:server.mutationGeneric},'./permissions':{requireOperator}}
 new Function('require','exports','module',compile(source,path))((name:string)=>{if(!(name in deps))throw Error('Unexpected generated import '+name);return deps[name]},module.exports,module)
 return module.exports
}
function generated(){
 const files=featureSources('qa-tasks','QA private tasks'),tables=emittedModule(files[0].content,files[0].path).featureTables as Parameters<typeof server.defineSchema>[0],backend=emittedModule(files[1].content,files[1].path),s=server.defineSchema(tables)
 const t=convexTest(s,{'./generated/_generated/server.ts':async()=>server,'./generated/feature_qa_tasks.ts':async()=>backend}),owner=t.withIdentity({subject:'generated-owner'}),other=t.withIdentity({subject:'generated-other'})
 const ref=(name:string)=>server.makeFunctionReference<'mutation'>('feature_qa_tasks:'+name),list=server.makeFunctionReference<'query'>('feature_qa_tasks:list')
 return{files,t,owner,other,ref,list}
}
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'feature-owner'}),other=t.withIdentity({subject:'feature-other'})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Feature fixture',brief:'Build a controlled private task feature.',audience:'Controlled fixtures',criteria:['Preserve owner isolation'],budget:0}),p=await owner.mutation(api.studio.startProject,{templateId,title:'Feature fixture'})
 const specificationId=await owner.mutation(api.featureBuilder.prepareSpecification,{projectId:p.projectId,featureKey:'qa-tasks',title:'QA private tasks'}),spec=(await owner.query(api.studio.specifications,{projectId:p.projectId}))[0]
 const args={projectId:p.projectId,specificationId,requestKey:'package-1',featureKey:'qa-tasks',title:'QA private tasks',expectedRevision:0,requirementKeys:[spec.requirements[0].key]},featureId=await owner.mutation(api.featureBuilder.create,args)
 return{t,owner,other,...p,specificationId,args,featureId}
}
describe('generated full-stack task pack',()=>{
 it('emits seven syntax-valid files without replacing target schema or env',()=>{
 const g=generated();expect(g.files).toHaveLength(7);for(const f of g.files.filter(f=>/\.(ts|tsx)$/.test(f.path)))compile(f.content,f.path)
 expect(new Set(g.files.map(f=>f.path)).size).toBe(7);expect(g.files.some(f=>f.path==='convex/schema.ts'||f.path.includes('.env'))).toBe(false)
 expect(g.files[6].content).toMatch(/additive new empty indexed table/)
 })
 it('executes generated create, rename, status and archive against its own schema',async()=>{
 const g=generated(),id=await g.owner.mutation(g.ref('create'),{requestKey:'item',title:'Original'})
 await g.owner.mutation(g.ref('update'),{id,title:'Renamed',status:'done'});await g.owner.mutation(g.ref('archive'),{id})
 expect((await g.owner.query(g.list,{}))[0]).toMatchObject({title:'Renamed',status:'done',archived:true})
 expect(await g.owner.mutation(g.ref('create'),{requestKey:'item',title:'Original'})).toBe(id)
 await expect(g.owner.mutation(g.ref('update'),{id,title:'Blocked',status:'open'})).rejects.toThrow(/unavailable/)
 })
 it('executes generated foreign-owner and anonymous rejection paths',async()=>{
 const g=generated(),id=await g.owner.mutation(g.ref('create'),{requestKey:'item',title:'Private'})
 expect(await g.other.query(g.list,{})).toEqual([])
 await expect(g.other.mutation(g.ref('update'),{id,title:'Foreign',status:'done'})).rejects.toThrow(/unavailable/)
 await expect(g.other.mutation(g.ref('archive'),{id})).rejects.toThrow(/unavailable/)
 await expect(g.t.query(g.list,{})).rejects.toThrow(/Authenticated/)
 await expect(g.t.mutation(g.ref('create'),{requestKey:'anon',title:'Anonymous'})).rejects.toThrow(/Authenticated/)
 })
 it('enforces generated UTF-8 title, request identity and retained capacity limits',async()=>{
 const g=generated()
 await expect(g.owner.mutation(g.ref('create'),{requestKey:'x',title:'🙂'.repeat(41)})).rejects.toThrow(/160/)
 await expect(g.owner.mutation(g.ref('create'),{requestKey:'bad key',title:'Valid'})).rejects.toThrow(/request key/)
 const id=await g.owner.mutation(g.ref('create'),{requestKey:'first',title:'First'})
 await expect(g.owner.mutation(g.ref('create'),{requestKey:'first',title:'Changed'})).rejects.toThrow(/different content/)
 for(let i=0;i<24;i++)await g.owner.mutation(g.ref('create'),{requestKey:'item-'+i,title:'Item '+i})
 await g.owner.mutation(g.ref('archive'),{id});await expect(g.owner.mutation(g.ref('create'),{requestKey:'overflow',title:'Extra'})).rejects.toThrow(/25 retained/)
 })
})
describe('native feature builder provenance and preview',()=>{
 it('validates paths, supported requirements and frozen package/file digests',async()=>{
 const f=await fixture(),d=await f.owner.query(api.featureBuilder.detail,{featureId:f.featureId}),p=JSON.parse(d.packageSnapshot)
 expect(p.files).toHaveLength(7);expect(p.contract.productionReady).toBe(false);expect(p.contract.targetIntegrationVerified).toBe(false);expect(p.traceability[0].requirementKey).toBe(f.args.requirementKeys[0]);expect(p.files.every((r:{sha256:string})=>/^[a-f0-9]{64}$/.test(r.sha256))).toBe(true)
 expect(()=>featureKey('../bad')).toThrow();expect(()=>taskTitle('🙂'.repeat(41))).toThrow()
 await expect(f.owner.mutation(api.featureBuilder.create,{...f.args,requestKey:'wrong',featureKey:'wrong-route'})).rejects.toThrow(/supports Owner/)
 })
 it('retains exact retries and requires current family revision for successors',async()=>{
 const f=await fixture();expect(await f.owner.mutation(api.featureBuilder.create,f.args)).toBe(f.featureId)
 await expect(f.owner.mutation(api.featureBuilder.create,{...f.args,title:'Conflicting package'})).rejects.toThrow(/immutable inputs/)
 await expect(f.owner.mutation(api.featureBuilder.create,{...f.args,requestKey:'v2'})).rejects.toThrow(/version changed/)
 const next=await f.owner.mutation(api.featureBuilder.create,{...f.args,requestKey:'v2',expectedRevision:1})
 expect(await f.owner.query(api.featureBuilder.items,{featureId:next})).toEqual([])
 await expect(f.owner.mutation(api.featureBuilder.prepareSpecification,{projectId:f.projectId,featureKey:'new-tasks',title:'New tasks'})).rejects.toThrow(/already has/)
 })
 it('exercises native CRUD and preserves exact creation retries after edits/retirement',async()=>{
 const f=await fixture(),a={featureId:f.featureId,requestKey:'task',title:'Original'},id=await f.owner.mutation(api.featureBuilder.createItem,a)
 await f.owner.mutation(api.featureBuilder.updateItem,{featureId:f.featureId,itemId:id,title:'Renamed',status:'done'});await f.owner.mutation(api.featureBuilder.archiveItem,{featureId:f.featureId,itemId:id})
 expect(await f.owner.mutation(api.featureBuilder.createItem,a)).toBe(id)
 expect((await f.owner.query(api.featureBuilder.items,{featureId:f.featureId}))[0]).toMatchObject({title:'Renamed',status:'done',archived:true})
 await expect(f.owner.mutation(api.featureBuilder.updateItem,{featureId:f.featureId,itemId:id,title:'Blocked',status:'open'})).rejects.toThrow(/unavailable/)
 })
 it('isolates packages, preview rows and artifacts from foreign/anonymous callers',async()=>{
 const f=await fixture(),d=await f.owner.query(api.featureBuilder.detail,{featureId:f.featureId})
 for(const client of [f.other,f.t]){
 await expect(client.query(api.featureBuilder.list,{projectId:f.projectId})).rejects.toThrow()
 await expect(client.query(api.featureBuilder.detail,{featureId:f.featureId})).rejects.toThrow()
 await expect(client.query(api.featureBuilder.items,{featureId:f.featureId})).rejects.toThrow()
 await expect(client.mutation(api.featureBuilder.createItem,{featureId:f.featureId,requestKey:'foreign',title:'Foreign'})).rejects.toThrow()
 await expect(client.mutation(api.featureBuilder.handoff,{featureId:f.featureId,expectedDigest:d.packageDigest})).rejects.toThrow()
 }
 })
 it('refuses cross-version item access even for the same operator',async()=>{
 const f=await fixture(),itemId=await f.owner.mutation(api.featureBuilder.createItem,{featureId:f.featureId,requestKey:'one',title:'Private task'}),otherVersion=await f.owner.mutation(api.featureBuilder.create,{...f.args,requestKey:'version-2',expectedRevision:1})
 await expect(f.owner.mutation(api.featureBuilder.updateItem,{featureId:otherVersion,itemId,title:'Cross version',status:'done'})).rejects.toThrow(/unavailable/)
 await expect(f.owner.mutation(api.featureBuilder.archiveItem,{featureId:otherVersion,itemId})).rejects.toThrow(/unavailable/)
 })
 it('hands off exactly one awaiting-review source artifact without altering authority',async()=>{
 const f=await fixture(),before=await f.t.run(ctx=>ctx.db.get(f.missionId as Id<'missions'>)),d=await f.owner.query(api.featureBuilder.detail,{featureId:f.featureId})
 await expect(f.owner.mutation(api.featureBuilder.handoff,{featureId:f.featureId,expectedDigest:'0'.repeat(64)})).rejects.toThrow(/digest/)
 const a={featureId:f.featureId,expectedDigest:d.packageDigest},id=await f.owner.mutation(api.featureBuilder.handoff,a)
 expect(await f.owner.mutation(api.featureBuilder.handoff,a)).toBe(id)
 const artifact=await f.t.run(ctx=>ctx.db.get(id as Id<'artifacts'>));expect(artifact).toMatchObject({content:d.packageSnapshot,status:'awaiting_approval',requiresApproval:true})
 expect(await f.t.run(ctx=>ctx.db.get(f.missionId as Id<'missions'>))).toEqual(before)
 })
})
