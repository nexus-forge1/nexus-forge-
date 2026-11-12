// @vitest-environment edge-runtime
import {describe,it,expect,vi,afterEach} from 'vitest'
import {createHash} from 'node:crypto'
import {Buffer} from 'node:buffer'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import type {Id} from '../convex/_generated/dataModel'
import {repoIdentity,treeInventory,packageSummary,ciEvidence,failedWorkflows} from '../convex/appImportModel'
const modules=import.meta.glob('../convex/**/*.ts'),shaA='a'.repeat(40),shaB='b'.repeat(40),treeA='c'.repeat(40),treeB='d'.repeat(40)
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
async function fixture(options:{private?:boolean;truncated?:boolean;badBlob?:boolean;ciUnavailable?:boolean;wrongCi?:boolean}={}){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'import-owner'}),other=t.withIdentity({subject:'import-other'})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Import fixture',brief:'Inspect controlled repository metadata only.',audience:'Controlled fixtures',criteria:['No external write or execution'],budget:0}),p=await owner.mutation(api.studio.startProject,{templateId,title:'Import fixture'})
 const text=JSON.stringify({dependencies:{react:'19.0.0',convex:'1.0.0'},scripts:{build:'echo DO_NOT_PERSIST_SCRIPT_COMMAND'},private:true}),bytes=Buffer.from(text),blobSha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
 expect(init?.method).toBe('GET');expect((init?.headers as Record<string,string>).Authorization).toBeUndefined();expect(init?.redirect).toBe('error')
 const path=new URL(url).pathname.replace('/repos/example/existing-app',''),query=new URL(url).search
 let data:unknown
 if(!path)data={private:options.private??false,full_name:'example/existing-app'}
 else if(path.startsWith('/git/commits/')){const sha=path.split('/').pop();data={sha,tree:{sha:sha===shaA?treeA:treeB}}}
 else if(path.startsWith('/git/trees/')){const ts=path.split('/').pop();data={sha:ts,truncated:options.truncated??false,tree:[{path:'package.json',sha:blobSha,size:bytes.length,mode:'100644',type:'blob'},{path:'src/routes/index.tsx',sha:ts===treeA?'1'.repeat(40):'2'.repeat(40),size:42,mode:'100644',type:'blob'},{path:'.env.local',sha:'3'.repeat(40),size:20,mode:'100644',type:'blob'},{path:'linked',sha:'4'.repeat(40),size:10,mode:'120000',type:'blob'}]}}
 else if(path.startsWith('/git/blobs/'))data={sha:blobSha,size:bytes.length,encoding:'base64',content:options.badBlob?Buffer.from('wrong').toString('base64'):bytes.toString('base64')}
 else if(path==='/actions/runs'){
 if(options.ciUnavailable)return new Response('rate limit',{status:403})
 const commit=new URLSearchParams(query).get('head_sha'),ids=commit===shaA?[1]:[1,2]
 data={total_count:ids.length,workflow_runs:ids.map(id=>({id:commit===shaA?id:id+100,workflow_id:id,run_attempt:1,name:'Controlled workflow '+id,status:'completed',conclusion:'failure',created_at:'2026-10-19T12:00:00Z',head_sha:options.wrongCi?shaB:commit,repository:{full_name:'example/existing-app'}}))}
 }else throw new Error('Unexpected external read '+path)
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})
 })
 vi.stubGlobal('fetch',fetcher)
 const args={projectId:p.projectId,requestKey:'baseline',repository:'Example/Existing-App',commitSha:shaA}
 const assess=()=>owner.action(api.appImportActions.assess,args)
 const planArgs=(snapshotId:Id<'appImportSnapshots'>,expectedDigest:string)=>({snapshotId,expectedDigest,requestKey:'modernize',objective:'Inspect a controlled modernization change.',protectedAreas:'Preserve existing authentication and permissions.',changes:'Propose one scoped change on a later review branch.',verification:'Retain baseline CI failures and add independent acceptance.',recovery:'Keep the exact source and avoid production migrations.',decision:'hold' as const})
 return{t,owner,other,...p,args,assess,planArgs,fetcher}
}
describe('existing application import boundaries',()=>{
 it('validates repository identities and full immutable commits',()=>{
 expect(repoIdentity(' Example/Existing-App ',shaA.toUpperCase())).toEqual({repository:'example/existing-app',commitSha:shaA})
 for(const repo of ['https://github.com/a/b','a/../b','a/b?token=secret','a/.'])expect(()=>repoIdentity(repo,shaA)).toThrow()
 expect(()=>repoIdentity('a/b','main')).toThrow(/40-character/)
 })
 it('rejects unsafe paths and treats sensitive or special entries as omitted',()=>{
 const row={path:'../bad',sha:shaA,size:1,type:'blob',mode:'100644'}
 expect(()=>treeInventory({sha:treeA,truncated:false,tree:[row]},treeA)).toThrow(/path/)
 expect(()=>treeInventory({sha:treeB,truncated:false,tree:[]},treeA)).toThrow(/malformed/)
 expect(()=>treeInventory({sha:treeA,truncated:false,tree:Array(1501).fill(row)},treeA)).toThrow(/1500/)
 })
 it('retains verified public inventory without credentials, scripts or secret contents',async()=>{
 const f=await fixture(),id=await f.assess(),d=await f.owner.query(api.appImports.detail,{snapshotId:id}),r=JSON.parse(d.report)
 expect(r.inventory).toMatchObject({complete:true,omittedSensitive:1,specialEntries:1});expect(r.inventory.files).toHaveLength(2)
 expect(r.package).toMatchObject({state:'read',dependencyNames:['convex','react'],scriptNames:['build']})
 expect(d.report).not.toContain('DO_NOT_PERSIST_SCRIPT_COMMAND');expect(d.report).not.toContain('.env.local');expect(d.digest).toMatch(/^[a-f0-9]{64}$/)
 expect(r.ci.runs[0].conclusion).toBe('failure')
 })
 it('does not refetch on exact import retries and refuses conflicting keys',async()=>{
 const f=await fixture(),id=await f.assess(),calls=f.fetcher.mock.calls.length;expect(await f.assess()).toBe(id);expect(f.fetcher).toHaveBeenCalledTimes(calls)
 await expect(f.owner.action(api.appImportActions.assess,{...f.args,commitSha:shaB})).rejects.toThrow(/different commit/)
 })
 it('rejects private repositories and bad root package hashes without saving a baseline',async()=>{
 for(const options of [{private:true},{badBlob:true}]){const f=await fixture(options);await expect(f.assess()).rejects.toThrow();expect(await f.owner.query(api.appImports.list,{projectId:f.projectId})).toEqual([])}
 })
 it('keeps incomplete trees and unavailable CI explicit rather than claiming acceptance',async()=>{
 const f=await fixture({truncated:true,ciUnavailable:true}),id=await f.assess(),d=await f.owner.query(api.appImports.detail,{snapshotId:id}),r=JSON.parse(d.report)
 expect(r.inventory.complete).toBe(false);expect(r.ci).toEqual({state:'unavailable',complete:false,runs:[]})
 })
 it('rejects CI that does not match the requested exact commit',async()=>{
 const f=await fixture({wrongCi:true});await expect(f.assess()).rejects.toThrow(/exact repository and commit/)
 expect(ciEvidence(null,'example/existing-app',shaA).complete).toBe(false)
 })
 it('does not fetch or disclose evidence for foreign or anonymous operators',async()=>{
 const f=await fixture();await expect(f.other.action(api.appImportActions.assess,f.args)).rejects.toThrow();await expect(f.t.action(api.appImportActions.assess,f.args)).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled()
 const id=await f.assess(),d=await f.owner.query(api.appImports.detail,{snapshotId:id})
 for(const client of [f.other,f.t]){await expect(client.query(api.appImports.detail,{snapshotId:id})).rejects.toThrow();await expect(client.mutation(api.appImports.plan,f.planArgs(id,d.digest))).rejects.toThrow()}
 })
 it('binds immutable modernization plans to exact sources without changing mission authority',async()=>{
 const f=await fixture(),before=await f.t.run(ctx=>ctx.db.get(f.missionId as Id<'missions'>)),id=await f.assess(),d=await f.owner.query(api.appImports.detail,{snapshotId:id}),a=f.planArgs(id,d.digest)
 await expect(f.owner.mutation(api.appImports.plan,{...a,expectedDigest:'0'.repeat(64)})).rejects.toThrow(/exact baseline/)
 const plan=await f.owner.mutation(api.appImports.plan,a);expect(await f.owner.mutation(api.appImports.plan,a)).toBe(plan)
 await expect(f.owner.mutation(api.appImports.plan,{...a,changes:'Conflicting modernization intent.'})).rejects.toThrow(/immutable/)
 expect(await f.t.run(ctx=>ctx.db.get(f.missionId as Id<'missions'>))).toEqual(before)
 })
 it('separates retained baseline failures from newly reported workflows without causal claims',async()=>{
 const f=await fixture(),baselineId=await f.assess(),candidateId=await f.owner.action(api.appImportActions.assess,{...f.args,requestKey:'candidate',commitSha:shaB}),r=JSON.parse(await f.owner.query(api.appImports.compare,{baselineId,candidateId}))
 expect(r.modified).toEqual(['src/routes/index.tsx']);expect(r.reportedFailedAtBoth).toEqual([1]);expect(r.newlyReportedFailed).toEqual([2]);expect(r.note).toMatch(/not proven regressions/)
 await expect(f.other.query(api.appImports.compare,{baselineId,candidateId})).rejects.toThrow()
 await expect(f.owner.query(api.appImports.compare,{baselineId,candidateId:baselineId})).rejects.toThrow(/distinct commits/)
 })
 it('retains bounded history and refuses new network work after the quota',async()=>{
 const f=await fixture(),id=await f.assess()
 await f.t.run(async ctx=>{const r=await ctx.db.get(id as Id<'appImportSnapshots'>);if(!r)throw Error('fixture');const {_id,_creationTime,...rest}=r;for(let i=0;i<19;i++)await ctx.db.insert('appImportSnapshots',{...rest,requestKey:'retained-'+i})})
 const calls=f.fetcher.mock.calls.length
 await expect(f.owner.action(api.appImportActions.assess,{...f.args,requestKey:'overflow'})).rejects.toThrow(/20 retained/)
 expect(f.fetcher).toHaveBeenCalledTimes(calls)
 })
 it('keeps package commands out and evaluates the latest workflow attempt only',()=>{
 expect(packageSummary('{"scripts":{"build":"untrusted command"},"dependencies":{"react":"url-with-secret"}}',shaA)).toMatchObject({dependencyNames:['react'],scriptNames:['build']})
 const old={id:1,workflowId:1,attempt:1,name:'CI',status:'completed',conclusion:'failure',createdAt:'2026-10-19T12:00:00Z'}
 expect(failedWorkflows([old,{...old,attempt:2,conclusion:'success'}])).toEqual([])
 })
})
