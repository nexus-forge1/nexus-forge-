// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {transformSync} from 'esbuild'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import type {Id} from '../convex/_generated/dataModel'
import {digest} from '../convex/studioModel'
import {canonical} from '../convex/evaluationModel'
import {defaultVisual,visualCss,visualScope,visualPreviewDocument} from '../src/lib/visual-task-contract'
import type {SourceFile} from '../convex/featurePackSources'
const modules=import.meta.glob('../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'visual-owner'}),other=t.withIdentity({subject:'visual-other'})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Visual fixture',brief:'Edit a controlled owner-private task presentation.',audience:'Controlled fixtures',criteria:['Preserve protected runtime contracts'],budget:0}),p=await owner.mutation(api.studio.startProject,{templateId,title:'Visual fixture'})
 const specificationId=await owner.mutation(api.featureBuilder.prepareSpecification,{projectId:p.projectId,featureKey:'visual-tasks',title:'Visual tasks'}),s=(await owner.query(api.studio.specifications,{projectId:p.projectId}))[0]
 const featureArgs={projectId:p.projectId,specificationId,featureKey:'visual-tasks',title:'Visual tasks',expectedRevision:0,requestKey:'source',requirementKeys:[s.requirements[0].key]},featureId=await owner.mutation(api.featureBuilder.create,featureArgs),context=await owner.query(api.visualBuilder.context,{featureId})
 const args={featureId,expectedSourceDigest:context.sourceDigest,expectedRevision:0,requestKey:'visual-1',config:{...context.defaultConfig,heading:'Edited private tasks',density:'roomy' as const,columns:'two-desktop' as const}}
 const save=()=>owner.mutation(api.visualBuilder.save,args)
 return{t,owner,other,...p,featureId,featureArgs,context,args,save}
}
describe('visual builder exact source contract',()=>{
 it('maps bounded layout controls into scoped responsive CSS',()=>{
 const c={...defaultVisual('Private tasks'),columns:'two-desktop' as const,density:'compact' as const},css=visualCss(visualScope('private-tasks'),c)
 expect(css).toContain('@media(min-width:48rem)');expect(css).toContain('repeat(2,minmax(0,1fr))');expect(css).toContain('padding:.75rem')
 expect(()=>visualScope('../invalid')).toThrow();expect(()=>visualCss('body',c)).toThrow()
 })
 it('escapes arbitrary labels and confines preview behavior to nonce-bound selection',()=>{
 const c={...defaultVisual('</h2><script>bad()</script>'),buttonLabel:'"><img src=x>'},theme={'ink':'196 43% 8%','ink-soft':'197 20% 35%',paper:'190 40% 97%',card:'0 0% 100%',cyan:'184 92% 55%',line:'188 44% 20% / .13',secondary:'190 27% 92%'}
 const html=visualPreviewDocument(c,'vf_private_tasks','0123456789abcdef','live',[{title:'<iframe src=bad>',status:'open',archived:false}],theme)
 expect(html).not.toContain('<script>bad()');expect(html).not.toContain('<img src=x>');expect(html).not.toContain('<iframe src=bad>');expect((html.match(/<script nonce=/g)??[]).length).toBe(1)
 expect(html).toContain("connect-src 'none'");expect(html).toContain('nexus-visual-select');expect(html).toContain('nonce:"0123456789abcdef"')
 expect(()=>visualPreviewDocument(c,'vf_private_tasks','bad','empty',[],theme)).toThrow(/nonce/)
 expect(()=>visualPreviewDocument(c,'vf_private_tasks','0123456789abcdef','empty',[],{...theme,ink:'red;</style>'})).toThrow(/theme/)
 })
 it('changes only the component and scoped CSS while keeping six protected files exact',async()=>{
 const f=await fixture(),id=await f.save(),base=JSON.parse((await f.owner.query(api.featureBuilder.detail,{featureId:f.featureId})).packageSnapshot),d=await f.owner.query(api.visualBuilder.detail,{visualId:id}),p=JSON.parse(d.packageSnapshot),diff=JSON.parse(d.diff)
 expect(p.files).toHaveLength(8);expect(diff.changed).toHaveLength(2);expect(diff.protectedFiles).toHaveLength(6)
 for(const file of diff.protectedFiles){expect(p.files.find((v:SourceFile)=>v.path===file.path)).toEqual(base.files.find((v:SourceFile)=>v.path===file.path))}
 for(const file of p.files.filter((v:SourceFile)=>/\.(ts|tsx)$/.test(v.path)))expect(()=>transformSync(file.content,{loader:file.path.endsWith('.tsx')?'tsx':'ts',format:'esm'})).not.toThrow()
 expect(p.contract.productionReady).toBe(false);expect(p.contract.targetIntegrationVerified).toBe(false)
 })
 it('retains original feature source and data through visual edits',async()=>{
 const f=await fixture(),before=await f.t.run(ctx=>ctx.db.get(f.featureId as Id<'featurePackages'>)),itemId=await f.owner.mutation(api.featureBuilder.createItem,{featureId:f.featureId,requestKey:'untouched',title:'Existing native preview row'}),items=await f.owner.query(api.featureBuilder.items,{featureId:f.featureId})
 await f.save()
 expect(await f.t.run(ctx=>ctx.db.get(f.featureId as Id<'featurePackages'>))).toEqual(before)
 expect(await f.owner.query(api.featureBuilder.items,{featureId:f.featureId})).toEqual(items);expect(itemId).toBeTruthy()
 })
 it('rejects rehashed but modified protected source and unsupported packages',async()=>{
 const f=await fixture()
 await f.t.run(async ctx=>{const r=await ctx.db.get(f.featureId as Id<'featurePackages'>);if(!r)throw Error('fixture');const p=JSON.parse(r.packageSnapshot);p.files[1].content+='\n// changed API';p.files[1].sha256=await digest(p.files[1].content);const snapshot=canonical(p);await ctx.db.patch(r._id,{packageSnapshot:snapshot,packageDigest:await digest(snapshot)})})
 await expect(f.owner.query(api.visualBuilder.context,{featureId:f.featureId})).rejects.toThrow(/Source changed/)
 })
 it('requires exact source and current head while preserving historical keyed retries',async()=>{
 const f=await fixture(),id=await f.save()
 expect(await f.save()).toBe(id)
 await expect(f.owner.mutation(api.visualBuilder.save,{...f.args,requestKey:'stale'})).rejects.toThrow(/history changed/)
 await expect(f.owner.mutation(api.visualBuilder.save,{...f.args,config:{...f.args.config,heading:'Conflict'}})).rejects.toThrow(/immutable inputs/)
 await expect(f.owner.mutation(api.visualBuilder.save,{...f.args,requestKey:'wrong-source',expectedRevision:1,expectedSourceDigest:'0'.repeat(64)})).rejects.toThrow(/source changed/)
 await f.owner.mutation(api.visualBuilder.save,{...f.args,requestKey:'visual-2',expectedRevision:1,config:{...f.args.config,buttonLabel:'Add task'}})
 expect(await f.save()).toBe(id)
 })
 it('restores retained design as a new immutable revision without erasing later history',async()=>{
 const f=await fixture(),first=await f.save()
 await f.owner.mutation(api.visualBuilder.save,{...f.args,requestKey:'visual-2',expectedRevision:1,config:{...f.args.config,buttonLabel:'Add task'}})
 const args={featureId:f.featureId,targetId:first,requestKey:'restore-1',expectedRevision:2,expectedSourceDigest:f.context.sourceDigest},restored=await f.owner.mutation(api.visualBuilder.restore,args)
 expect(await f.owner.mutation(api.visualBuilder.restore,args)).toBe(restored)
 const rows=await f.owner.query(api.visualBuilder.list,{featureId:f.featureId});expect(rows).toHaveLength(3);expect(rows[0]).toMatchObject({revision:3,parentRevision:2,operation:'restore',restoredFrom:first,config:f.args.config})
 const a=await f.owner.query(api.visualBuilder.detail,{visualId:first}),b=await f.owner.query(api.visualBuilder.detail,{visualId:restored})
 expect(JSON.parse(a.packageSnapshot).files).toEqual(JSON.parse(b.packageSnapshot).files);expect(a.packageDigest).not.toBe(b.packageDigest)
 })
 it('enforces foreign-owner and anonymous isolation on source, history and writes',async()=>{
 const f=await fixture(),id=await f.save(),d=await f.owner.query(api.visualBuilder.detail,{visualId:id})
 for(const client of [f.other,f.t]){
 await expect(client.query(api.visualBuilder.context,{featureId:f.featureId})).rejects.toThrow()
 await expect(client.query(api.visualBuilder.list,{featureId:f.featureId})).rejects.toThrow()
 await expect(client.query(api.visualBuilder.detail,{visualId:id})).rejects.toThrow()
 await expect(client.mutation(api.visualBuilder.save,{...f.args,requestKey:'foreign',expectedRevision:1})).rejects.toThrow()
 await expect(client.mutation(api.visualBuilder.restore,{featureId:f.featureId,targetId:id,requestKey:'foreign',expectedRevision:1,expectedSourceDigest:f.context.sourceDigest})).rejects.toThrow()
 await expect(client.mutation(api.visualBuilder.handoff,{visualId:id,expectedDigest:d.packageDigest})).rejects.toThrow()
 }
 })
 it('refuses same-owner restores across different feature source versions',async()=>{
 const f=await fixture(),first=await f.save(),second=await f.owner.mutation(api.featureBuilder.create,{...f.featureArgs,requestKey:'source-2',expectedRevision:1}),c=await f.owner.query(api.visualBuilder.context,{featureId:second})
 await expect(f.owner.mutation(api.visualBuilder.restore,{featureId:second,targetId:first,requestKey:'cross-source',expectedRevision:0,expectedSourceDigest:c.sourceDigest})).rejects.toThrow(/same feature/)
 })
 it('retains one awaiting-review visual artifact and leaves mission authority unchanged',async()=>{
 const f=await fixture(),before=await f.t.run(ctx=>ctx.db.get(f.missionId as Id<'missions'>)),id=await f.save(),d=await f.owner.query(api.visualBuilder.detail,{visualId:id}),args={visualId:id,expectedDigest:d.packageDigest}
 const artifactId=await f.owner.mutation(api.visualBuilder.handoff,args);expect(await f.owner.mutation(api.visualBuilder.handoff,args)).toBe(artifactId)
 expect(await f.t.run(ctx=>ctx.db.get(artifactId as Id<'artifacts'>))).toMatchObject({content:d.packageSnapshot,status:'awaiting_approval',requiresApproval:true})
 expect(await f.t.run(ctx=>ctx.db.get(f.missionId as Id<'missions'>))).toEqual(before)
 })
 it('retains the complete bounded history and blocks overflow without deleting revisions',async()=>{
 const f=await fixture();for(let i=0;i<20;i++)await f.owner.mutation(api.visualBuilder.save,{...f.args,requestKey:'revision-'+i,expectedRevision:i})
 await expect(f.owner.mutation(api.visualBuilder.save,{...f.args,requestKey:'overflow',expectedRevision:20})).rejects.toThrow(/20 retained/)
 expect(await f.owner.query(api.visualBuilder.list,{featureId:f.featureId})).toHaveLength(20)
 })
 it('rejects arbitrary style fields and preserves script-like labels as text source',async()=>{
 const f=await fixture(),hostile={...f.args.config,heading:'</h2><script>bad()</script>',buttonLabel:'" onClick={bad}'}
 const id=await f.owner.mutation(api.visualBuilder.save,{...f.args,config:hostile}),d=await f.owner.query(api.visualBuilder.detail,{visualId:id}),component=JSON.parse(d.packageSnapshot).files.find((s:SourceFile)=>s.path.endsWith('.tsx')&&s.path.includes('/components/'))
 expect(()=>transformSync(component.content,{loader:'tsx',format:'esm'})).not.toThrow()
 await expect(f.owner.mutation(api.visualBuilder.save,{...f.args,requestKey:'css',expectedRevision:1,config:{...f.args.config,customCss:'url(https://bad)'}} as unknown as typeof f.args)).rejects.toThrow()
 })
})
