"use node"
import {createHash} from 'node:crypto'
import {Buffer} from 'node:buffer'
import {v,ConvexError} from 'convex/values'
import {action} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {internal} from './_generated/api'
import {boundedText} from './boundedResponse'
import {canonical} from './evaluationModel'
import {repoIdentity,treeInventory,packageSummary,ciEvidence,architecture,type TreeEntry,type PackageSummary} from './appImportModel'
async function get<T>(repository:string,path:string,maxBytes:number):Promise<T>{
 let response:Response
 try{response=await fetch('https://api.github.com/repos/'+repository+path,{method:'GET',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw new ConvexError('Public GitHub read failed; no repository commands or writes were attempted')}
 if(!response.ok){await response.body?.cancel();throw new ConvexError('Public GitHub read returned HTTP '+response.status+'. Check public access, exact commit or rate limits.')}
 try{return JSON.parse(await boundedText(response,maxBytes)) as T}catch{throw new ConvexError('GitHub response was incomplete, malformed or exceeded the read bound')}
}
export const assess=action({args:{projectId:v.id('studioProjects'),requestKey:v.string(),repository:v.string(),commitSha:v.string()},returns:v.id('appImportSnapshots'),handler:async(ctx,a):Promise<Id<'appImportSnapshots'>>=>{
 const identity=repoIdentity(a.repository,a.commitSha),args={...a,...identity},old=await ctx.runQuery(internal.appImports.preflight,args)
 if(old)return old
 const repo=await get<{private:boolean;full_name:string}>(identity.repository,'',32768)
 if(repo.private!==false||typeof repo.full_name!=='string'||repo.full_name.toLowerCase()!==identity.repository)throw new ConvexError('Only exact publicly accessible repositories are supported by this starter')
 const commit=await get<{sha:string;tree:{sha:string}}>(identity.repository,'/git/commits/'+identity.commitSha,131072)
 if(commit.sha!==identity.commitSha||!commit.tree||!/^[a-f0-9]{40}$/.test(commit.tree.sha))throw new ConvexError('GitHub commit identity mismatch')
 const tree=await get<{sha:string;truncated:boolean;tree:TreeEntry[]}>(identity.repository,'/git/trees/'+commit.tree.sha+'?recursive=1',1024*1024),inventory=treeInventory(tree,commit.tree.sha),root=inventory.files.find(f=>f.path==='package.json')
 let pkg:PackageSummary={state:root?'unavailable':'absent',sha:root?.sha??null,dependencyNames:[],scriptNames:[]}
 if(root&&root.size<=32768){
 const blob=await get<{sha:string;size:number;encoding:string;content:string}>(identity.repository,'/git/blobs/'+root.sha,65536)
 if(blob.sha!==root.sha||blob.size!==root.size||blob.encoding!=='base64'||typeof blob.content!=='string')throw new ConvexError('Root package metadata mismatch')
 const encoded=blob.content.replace(/\s/g,'')
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new ConvexError('Invalid root package encoding')
 const bytes=Buffer.from(encoded,'base64'),sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')
 if(bytes.length!==root.size||sha!==root.sha||bytes.toString('base64')!==encoded)throw new ConvexError('Root package Git blob hash mismatch')
 pkg=packageSummary(new TextDecoder('utf-8',{fatal:true}).decode(bytes),root.sha)
 }
 let ciRaw:Parameters<typeof ciEvidence>[0]=null
 try{ciRaw=await get<NonNullable<typeof ciRaw>>(identity.repository,'/actions/runs?head_sha='+identity.commitSha+'&per_page=20',512*1024)}catch{/* CI absence or transport failure is explicit unknown, never success. */}
 const ci=ciEvidence(ciRaw,identity.repository,identity.commitSha),report=canonical({version:'public-repository-baseline-v1',...identity,treeSha:commit.tree.sha,observedAt:Date.now(),access:'anonymous-public-read-only',inventory,package:pkg,architecture:architecture(inventory.files,pkg),ci,execution:'No checkout, installation, script execution, migration, inference or repository write performed.'})
 return ctx.runMutation(internal.appImports.save,{...args,report})
}})
