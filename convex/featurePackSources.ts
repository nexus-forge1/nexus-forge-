import {featureContract} from './featureBuilderModel'
export type SourceFile={path:string;content:string}
export function featureSources(key:string,title:string):SourceFile[]{
 const name='feature_'+key.replaceAll('-','_'),table=name+'_items',route='/features/'+key,Q=JSON.stringify
 const schema=[
 "import {defineTable} from 'convex/server'",
 "import {v} from 'convex/values'",
 'export const featureTables={'+Q(table)+":defineTable({ownerKey:v.string(),requestKey:v.string(),initialTitle:v.string(),title:v.string(),status:v.union(v.literal('open'),v.literal('done')),archived:v.boolean(),createdAt:v.number(),updatedAt:v.number()}).index('by_owner',['ownerKey'])}",
 ].join('\n')
 const backend=[
 "import {v,ConvexError} from 'convex/values'",
 "import {query,mutation} from './_generated/server'",
 "import {requireOperator} from './permissions'",
 "function title(value:string){const s=value.trim();if(!s||new TextEncoder().encode(s).length>160||s.includes('\\0'))throw new ConvexError('Task title requires 1–160 UTF-8 bytes');return s}",
 'const row=v.object({_id:v.id('+Q(table)+"),_creationTime:v.number(),ownerKey:v.string(),requestKey:v.string(),initialTitle:v.string(),title:v.string(),status:v.union(v.literal('open'),v.literal('done')),archived:v.boolean(),createdAt:v.number(),updatedAt:v.number()})",
 'export const list=query({args:{},returns:v.array(row),handler:async ctx=>{const owner=await requireOperator(ctx);return ctx.db.query('+Q(table)+").withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(25)}})",
 'export const create=mutation({args:{requestKey:v.string(),title:v.string()},returns:v.id('+Q(table)+'),handler:async(ctx,a)=>{const owner=await requireOperator(ctx),value=title(a.title),key=a.requestKey.trim();if(!/^[A-Za-z0-9_-]{1,80}$/.test(key))throw new ConvexError("Invalid request key");const rows=await ctx.db.query('+Q(table)+").withIndex('by_owner',q=>q.eq('ownerKey',owner)).take(25),old=rows.find(r=>r.requestKey===key);if(old){if(old.initialTitle!==value)throw new ConvexError('Request key has different content');return old._id}if(rows.length>=25)throw new ConvexError('25 retained items per owner');const now=Date.now();return ctx.db.insert("+Q(table)+",{ownerKey:owner,requestKey:key,initialTitle:value,title:value,status:'open',archived:false,createdAt:now,updatedAt:now})}})",
 'export const update=mutation({args:{id:v.id('+Q(table)+"),title:v.string(),status:v.union(v.literal('open'),v.literal('done'))},returns:v.null(),handler:async(ctx,a)=>{const owner=await requireOperator(ctx),r=await ctx.db.get(a.id);if(!r||r.ownerKey!==owner||r.archived)throw new ConvexError('Task unavailable');const value=title(a.title);if(r.title!==value||r.status!==a.status)await ctx.db.patch(r._id,{title:value,status:a.status,updatedAt:Date.now()});return null}})",
 'export const archive=mutation({args:{id:v.id('+Q(table)+")},returns:v.null(),handler:async(ctx,a)=>{const owner=await requireOperator(ctx),r=await ctx.db.get(a.id);if(!r||r.ownerKey!==owner)throw new ConvexError('Task unavailable');if(!r.archived)await ctx.db.patch(r._id,{archived:true,updatedAt:Date.now()});return null}})",
 ].join('\n')
 const component=[
 "import {useState} from 'react'",
 "import {useMutation,useQuery} from 'convex/react'",
 "import {api} from '../../convex/_generated/api'",
 "import type {Doc} from '../../convex/_generated/dataModel'",
 'export function FeatureTasks(){const rows=useQuery(api.'+name+'.list,{}),create=useMutation(api.'+name+".create),[key,setKey]=useState(''),[title,setTitle]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);",
 'return <section className="dashboard-section"><div className="glass-card research-card"><h2>{'+Q(title)+'}</h2><p>Private to the authenticated owner. Maximum 25 retained items; archiving preserves records.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await create({requestKey:key,title})}catch{setError("Creation refused. Retry the same key after checking the current state.")}finally{setBusy(false)}}}><label>Creation key<input required maxLength={80} value={key} onChange={e=>setKey(e.target.value)}/></label><label>Task title<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><button className="primary-button" disabled={busy||rows===undefined}>Create task</button></form>{error&&<p role="alert">{error}</p>}{rows===undefined?<p>Loading tasks…</p>:rows.length===0?<p>No tasks yet.</p>:rows.map(r=><TaskRow key={r._id} r={r}/>)}</div></section>}',
 'function TaskRow({r}:{r:Doc<'+Q(table)+'>}){const update=useMutation(api.'+name+'.update),archive=useMutation(api.'+name+'.archive),[title,setTitle]=useState(r.title),[status,setStatus]=useState<"open"|"done">(r.status),[busy,setBusy]=useState(false),[error,setError]=useState("");async function act(f:()=>Promise<unknown>){setBusy(true);setError("");try{await f()}catch{setError("Task action refused. Check current ownership and archive state.")}finally{setBusy(false)}}return <article><h3>{r.title}</h3><p>{r.status} · {r.archived?"archived":"active"}</p><form onSubmit={e=>{e.preventDefault();void act(()=>update({id:r._id,title,status}))}}><label>Title<input disabled={busy||r.archived} required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Status<select disabled={busy||r.archived} value={status} onChange={e=>setStatus(e.target.value as "open"|"done")}><option>open</option><option>done</option></select></label><button className="secondary-button" disabled={busy||r.archived}>Save task</button><button type="button" className="secondary-button" disabled={busy||r.archived} onClick={()=>void act(()=>archive({id:r._id}))}>Archive</button></form>{error&&<p role="alert">{error}</p>}</article>}',
 ].join('\n')
 const routeSource=[
 "import {createFileRoute} from '@tanstack/react-router'",
 "import {routeHead} from '../lib/route-metadata'",
 "import {WorkspaceLayout} from '../components/workspace-layout'",
 'import {FeatureTasks} from '+Q('../components/'+name),
 'export const Route=createFileRoute('+Q(route)+')({head:()=>routeHead('+Q(route)+'),component:Page})',
 'function Page(){return <WorkspaceLayout title={'+Q(title)+'} eyebrow="PRIVATE TASKS"><FeatureTasks/></WorkspaceLayout>}',
 ].join('\n')
 const tests=[
 '// @vitest-environment edge-runtime',
 "import {it,expect} from 'vitest'",
 "import {convexTest} from 'convex-test'",
 "import schema from '../convex/schema'",
 "import {api} from '../convex/_generated/api'",
 "const modules=import.meta.glob('../convex/**/*.ts')",
 "it('isolates owners and preserves archived records',async()=>{const t=convexTest(schema,modules),owner=t.withIdentity({subject:'pack-owner'}),other=t.withIdentity({subject:'pack-other'});const id=await owner.mutation(api."+name+".create,{requestKey:'fixture',title:'Private task'});expect(await owner.mutation(api."+name+".create,{requestKey:'fixture',title:'Private task'})).toBe(id);expect(await other.query(api."+name+".list,{})).toEqual([]);await expect(other.mutation(api."+name+".update,{id,title:'Foreign',status:'done'})).rejects.toThrow();await expect(t.query(api."+name+".list,{})).rejects.toThrow();await owner.mutation(api."+name+".update,{id,title:'Renamed task',status:'done'});await owner.mutation(api."+name+".archive,{id});expect((await owner.query(api."+name+".list,{}))[0]).toMatchObject({title:'Renamed task',status:'done',archived:true});await expect(owner.mutation(api."+name+".update,{id,title:'Blocked',status:'open'})).rejects.toThrow()})",
 ].join('\n')
 const readme=[
 '# '+title+' — private task feature pack',
 'Contract: '+featureContract.version+'. Target: existing authenticated TanStack/Convex app with requireOperator, WorkspaceLayout and routeHead. This is not a standalone app.',
 '1. Review every generated file and resolve path/table/route collisions in a branch. No files were installed automatically.',
 '2. Add featureTables from convex/'+name+'Schema.ts to the existing defineSchema object. Do not replace schema.ts or auth tables.',
 '3. Add the backend and component files. Add route metadata from the snippet to src/metadata.json; preserve the existing root bridge and auth provider.',
 '4. Regenerate Convex types and route types in the target, run both TypeScript checks, generated backend tests and real browser create/update/archive plus foreign-owner and anonymous denial tests.',
 '5. Deploy only to an isolated preview first. Existing production schema/data, permissions, approvals and payments remain unchanged.',
 'Migration: additive new empty indexed table only. No data backfill or destructive migration is generated. Preserve this table during code rollback; do not delete records to reverse a release.',
 'Rollback: retain the prior commit and schema-compatible build, review exact target changes, stop new feature traffic and restore application code only after compatibility checks.',
 'Limits: 25 retained items per owner; no hard delete, teams, email, payments, file uploads or background jobs. Archive is logical retirement. Title/API validation is server-side.',
 'Acceptance mappings are traceability links, not proof that free-form requirements are satisfied. Generated tests must run in the target; native preview results do not certify target installation.',
 'No inferred success from timestamps. Production readiness and target integration remain HOLD.',
 ].join('\n')
 return[
 {path:'convex/'+name+'Schema.ts',content:schema},
 {path:'convex/'+name+'.ts',content:backend},
 {path:'src/components/'+name+'.tsx',content:component},
 {path:'src/routes/features.'+key+'.tsx',content:routeSource},
 {path:'__tests__/'+name+'.test.ts',content:tests},
 {path:'metadata/'+name+'.json',content:JSON.stringify({[route]:{title:title+' — Private Tasks',description:'Authenticated owner-private task workflow.'}},null,2)},
 {path:'README-feature.md',content:readme},
 ]
}
