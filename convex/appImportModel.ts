import {defineTable} from 'convex/server'
import {v,ConvexError} from 'convex/values'
export const appImportTables={
 appImportSnapshots:defineTable({ownerKey:v.string(),projectId:v.id('studioProjects'),requestKey:v.string(),repository:v.string(),commitSha:v.string(),report:v.string(),digest:v.string(),createdAt:v.number()}).index('by_project',['projectId']),
 appModernizationPlans:defineTable({ownerKey:v.string(),snapshotId:v.id('appImportSnapshots'),requestKey:v.string(),sourceDigest:v.string(),objective:v.string(),protectedAreas:v.string(),changes:v.string(),verification:v.string(),recovery:v.string(),decision:v.union(v.literal('plan'),v.literal('hold')),createdAt:v.number()}).index('by_snapshot',['snapshotId']),
}
export function repoIdentity(repository:string,commitSha:string){
 const repo=repository.trim().toLowerCase(),sha=commitSha.trim().toLowerCase()
 if(!/^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9_.-]{1,100}$/.test(repo)||repo.split('/')[1]==='.'||repo.split('/')[1]==='..')throw new ConvexError('Use owner/repository, without a URL or credentials')
 if(!/^[0-9a-f]{40}$/.test(sha))throw new ConvexError('Use a full 40-character commit SHA')
 return{repository:repo,commitSha:sha}
}
export type FileEntry={path:string;sha:string;size:number}
export type TreeEntry={path:string;sha:string;size?:number;mode:string;type:string}
export function treeInventory(tree:{sha:string;truncated:boolean;tree:TreeEntry[]},expected:string){
 if(tree.sha!==expected||typeof tree.truncated!=='boolean'||!Array.isArray(tree.tree)||tree.tree.length>1500)throw new ConvexError('Repository tree is malformed or exceeds the 1500-entry starter limit')
 const files:FileEntry[]=[],seen=new Set<string>();let omittedSensitive=0,specialEntries=0
 for(const f of tree.tree){
 if(typeof f.path!=='string'||new TextEncoder().encode(f.path).length>240||f.path.split('/').length>24||f.path.split('/').some(p=>!p||p==='.'||p==='..')||/[\\\x00-\x1f\x7f]/.test(f.path)||!/^([a-f0-9]{40})$/.test(f.sha)||seen.has(f.path))throw new ConvexError('Invalid or duplicated tree path')
 seen.add(f.path)
 if(f.type==='tree'&&f.mode==='040000')continue
 if(f.type!=='blob'||!['100644','100755'].includes(f.mode)){specialEntries++;continue}
 if(!Number.isInteger(f.size)||f.size!<0||f.size!>1000000000)throw new ConvexError('Invalid regular-file metadata')
 if(/(^|\/)(\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519)$|\.(pem|key|p12|pfx)$/i.test(f.path)){omittedSensitive++;continue}
 files.push({path:f.path,sha:f.sha,size:f.size!})
 }
 return{files:files.sort((a,b)=>a.path.localeCompare(b.path)),complete:!tree.truncated,omittedSensitive,specialEntries}
}
export type PackageSummary={state:'absent'|'read'|'unavailable';sha:string|null;dependencyNames:string[];scriptNames:string[]}
export function packageSummary(text:string,sha:string):PackageSummary{
 let p:Record<string,unknown>;try{p=JSON.parse(text)}catch{throw new ConvexError('Root package.json is not valid JSON')}
 if(!p||typeof p!=='object'||Array.isArray(p))throw new ConvexError('Root package.json must be an object')
 const names=new Set<string>()
 for(const key of ['dependencies','devDependencies']){const values=p[key];if(values&&typeof values==='object'&&!Array.isArray(values)){for(const name of Object.keys(values)){if(!/^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)||name.length>160)throw new ConvexError('Invalid dependency name');names.add(name)}}}
 const scriptNames=p.scripts&&typeof p.scripts==='object'&&!Array.isArray(p.scripts)?Object.keys(p.scripts):[]
 if(names.size>200||scriptNames.length>40||scriptNames.some(n=>!/^[-a-zA-Z0-9:_]{1,80}$/.test(n)))throw new ConvexError('Package inventory exceeds safe dependency/script bounds')
 // Commands, URLs, credentials and version values are deliberately never retained.
 return{state:'read',sha,dependencyNames:[...names].sort(),scriptNames:scriptNames.sort()}
}
export type CiRun={id:number;workflowId:number;attempt:number;name:string;status:string;conclusion:string|null;createdAt:string}
export function ciEvidence(raw:{total_count:number;workflow_runs:Array<{id:number;workflow_id:number;run_attempt:number;name:string;status:string;conclusion:string|null;created_at:string;head_sha:string;repository:{full_name:string}}>}|null,repository:string,commitSha:string){
 if(!raw)return{state:'unavailable' as const,complete:false,runs:[] as CiRun[]}
 if(!Number.isInteger(raw.total_count)||raw.total_count<0||!Array.isArray(raw.workflow_runs)||raw.workflow_runs.length>20||raw.total_count<raw.workflow_runs.length)throw new ConvexError('Malformed workflow evidence')
 const runs:CiRun[]=raw.workflow_runs.map(r=>{
 if(r.head_sha!==commitSha||r.repository?.full_name.toLowerCase()!==repository||![r.id,r.workflow_id,r.run_attempt].every(n=>Number.isSafeInteger(n)&&n>0)||typeof r.name!=='string'||r.name.length>160||!['queued','in_progress','completed','waiting','pending','requested'].includes(r.status)||!(r.conclusion===null||['success','failure','neutral','cancelled','skipped','timed_out','action_required','stale','startup_failure'].includes(r.conclusion))||!Number.isFinite(Date.parse(r.created_at)))throw new ConvexError('Workflow evidence does not match the exact repository and commit')
 return{id:r.id,workflowId:r.workflow_id,attempt:r.run_attempt,name:r.name,status:r.status,conclusion:r.conclusion,createdAt:r.created_at}
 })
 return{state:raw.total_count===0?'none' as const:'reported' as const,complete:raw.total_count<=20&&raw.total_count===runs.length,runs}
}
export function architecture(files:FileEntry[],pkg:PackageSummary){
 const groups=[
 ['Routes and API candidates',/(^|\/)(routes?|pages|api)\/|(^|\/)(app|src\/app)\//],
 ['Database and migrations',/(^|\/)(convex|prisma|migrations|drizzle|db)\//],
 ['Authentication and authorization candidates',/(^|\/)[^/]*(auth|permission|session)[^/]*\.(ts|tsx|js|jsx)$/i],
 ['Test files',/(__tests__\/|\.(test|spec)\.[^.]+$|(^|\/)(test|tests|e2e)\/)/],
 ['Deployment configuration',/(^|\/)(Dockerfile|docker-compose[^/]*|vercel\.json|netlify\.toml|wrangler\.[^/]+|railway\.[^/]+|\.github\/workflows\/[^/]+)$/]
 ] as const
 return{groups:groups.map(([area,re])=>{const matches=files.filter(f=>re.test(f.path));return{area,count:matches.length,sample:matches.slice(0,12).map(f=>f.path),note:'Path-based inventory only; implementation, coverage and deployment compatibility require review.'}}),dependencies:pkg.dependencyNames.filter(n=>['react','next','vite','convex','@tanstack/react-start','express','typescript','@playwright/test','vitest'].includes(n)),gaps:['No repository commands, tests or migrations were run.','File names and dependency presence do not verify architecture correctness, tenant isolation or security.','CI results are historical provider reports, not independent acceptance or proof that this commit is deployable.','Private repositories, source checkout, repair branch creation and executable modernization remain pending.']}
}
export function failedWorkflows(runs:CiRun[]){
 const latest=new Map<number,CiRun>()
 for(const r of runs){const old=latest.get(r.workflowId);if(!old||Date.parse(r.createdAt)>Date.parse(old.createdAt)||r.createdAt===old.createdAt&&(r.id>old.id||r.id===old.id&&r.attempt>old.attempt))latest.set(r.workflowId,r)}
 return[...latest.values()].filter(r=>r.status==='completed'&&['failure','timed_out','startup_failure'].includes(r.conclusion??'')).map(r=>r.workflowId).sort((a,b)=>a-b)
}
