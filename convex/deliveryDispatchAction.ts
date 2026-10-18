import type {ActionCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {internal} from './_generated/api'
import {boundedText} from './boundedResponse'
import {ConvexError} from 'convex/values'
import {qaCallbackInputs} from './deliveryRecovery'
export type DispatchResult={ok:boolean;workflowUrl:string;artifactPath:string}
const requestOptions={redirect:'error' as const}
async function send(url:string,options:RequestInit){
 try{return await fetch(url,options)}catch{throw Error('GitHub request could not be confirmed. Review connection health before another request.')}
}
async function readJson(response:Response,limit:number){
 try{return JSON.parse(await boundedText(response,limit))}catch{throw Error('GitHub metadata was incomplete, oversized or invalid; no automatic replay was made.')}
}
export async function requireQaCallbackWorkflow(target:string,branch:string,headers:Record<string,string>){
 if(target!=='nexus-forge1/no-dispatch'||branch!=='qa-only')return
 const r=await send('https://api.github.com/repos/'+target+'/contents/.github/workflows/nexus-forge-delivery.yml?ref='+encodeURIComponent(branch),{headers,...requestOptions,signal:AbortSignal.timeout(15000)})
 if(!r.ok){await r.body?.cancel().catch(()=>{});throw new ConvexError('Cannot verify QA workflow callback support; no retry or artifact upload attempted')}
 const body=await readJson(r,128*1024)
 const content=body.encoding==='base64'?atob(String(body.content).replace(/\s/g,'')):String(body.content??'')
 if(!content.includes('callback_origin:')||!content.includes('inputs.callback_origin'))throw new ConvexError('QA workflow upgrade required: apply docs/qa-workflow/nexus-forge-delivery.yml to nexus-forge1/no-dispatch on qa-only. No retry or artifact upload attempted.')
}
function encodeBase64(value:string){const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)}
export async function dispatchApprovedDelivery(ctx:ActionCtx,id:Id<'deliveries'>):Promise<DispatchResult>{
 const admission=await ctx.runMutation(internal.deliveryDispatch.reserve,{id})
 if('cached' in admission&&admission.cached)return JSON.parse(admission.cached) as DispatchResult
 if(!('attemptId' in admission)||!admission.attemptId||!admission.delivery||!admission.artifact)throw Error('Delivery admission was not confirmed')
 const{attemptId,delivery:d,artifact}=admission
 try{
  const token=process.env.GITHUB_ACCESS_TOKEN?.trim().replace(/^["']|["']$/g,'')
  if(!token)throw Error('GITHUB_ACCESS_TOKEN is not configured in Live Convex')
  const configured=(process.env.NEXUS_FORGE_GITHUB_REPO_ALLOWLIST??'').split(',').map(s=>s.trim()).filter(Boolean)
  const allowed=new Set(['nexus-forge1/nexus-forge-',process.env.NEXUS_FORGE_GITHUB_REPO||'nexus-forge1/nexus-forge-','nexus-forge1/no-dispatch',...configured])
  if(!allowed.has(d.target)||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(d.target)||d.target.split('/').some(s=>s==='.'||s==='..')||d.target.length>201||!d.branch||d.branch.length>200)throw Error('Delivery target or branch is not allowlisted or valid')
  const apiBase='https://api.github.com/repos/'+d.target,headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}
  const get=async(path:string)=>send(apiBase+path,{headers,...requestOptions,signal:AbortSignal.timeout(15000)})
  const repo=await get('');await repo.body?.cancel().catch(()=>{})
  if(!repo.ok)throw Error(repo.status===404?'Repository not found or GITHUB_ACCESS_TOKEN lacks access. No artifact upload or workflow dispatch was attempted.':'Repository preflight failed with HTTP '+repo.status+'. No artifact upload or workflow dispatch was attempted.')
  const branch=await get('/branches/'+encodeURIComponent(d.branch));await branch.body?.cancel().catch(()=>{})
  if(!branch.ok)throw Error(branch.status===404?'Branch "'+d.branch+'" was not found or is inaccessible. No artifact upload or workflow dispatch was attempted.':'Branch preflight failed with HTTP '+branch.status+'. No artifact upload or workflow dispatch was attempted.')
  await requireQaCallbackWorkflow(d.target,d.branch,headers)
  const callback=qaCallbackInputs(d.target,d.branch,process.env.CONVEX_SITE_URL)
  const artifactPath='nexus-forge-deliveries/'+d._id+'/index.html'
  const existing=await get('/contents/'+artifactPath+'?ref='+encodeURIComponent(d.branch))
  let sha:string|undefined
  if(existing.ok){const body=await readJson(existing,1024*1024);if(!/^[a-f0-9]{40}$/i.test(body.sha??''))throw Error('GitHub artifact identity is invalid');sha=body.sha}
  else{await existing.body?.cancel().catch(()=>{});if(existing.status!==404)throw Error('GitHub artifact lookup failed: '+existing.status)}
  await ctx.runMutation(internal.deliveryDispatch.advance,{attemptId,phase:'commit'})
  const commit=await send(apiBase+'/contents/'+artifactPath,{method:'PUT',headers,...requestOptions,signal:AbortSignal.timeout(20000),body:JSON.stringify({message:'nexus-forge: deliver '+d._id,content:encodeBase64(artifact.content),branch:d.branch,...(sha?{sha}:{})})})
  if(!commit.ok){await commit.body?.cancel().catch(()=>{});throw Error('GitHub artifact commit was not confirmed')}
  const committed=await readJson(commit,256*1024)
  if(!/^[a-f0-9]{40}$/i.test(committed.commit?.sha??''))throw Error('GitHub returned no exact commit receipt')
  await ctx.runMutation(internal.deliveryDispatch.recordCommit,{attemptId,commitSha:committed.commit.sha})
  await ctx.runMutation(internal.deliveryDispatch.advance,{attemptId,phase:'dispatch',commitSha:committed.commit.sha})
  const dispatch=await send(apiBase+'/actions/workflows/nexus-forge-delivery.yml/dispatches',{method:'POST',headers,...requestOptions,signal:AbortSignal.timeout(20000),body:JSON.stringify({ref:d.branch,inputs:{mission_id:d.missionId,delivery_id:d._id,artifact_ref:artifactPath,...callback}})})
  await dispatch.body?.cancel().catch(()=>{})
  if(dispatch.status!==204)throw Error('GitHub workflow dispatch was not confirmed')
  const result={ok:true,workflowUrl:'https://github.com/'+d.target+'/actions/workflows/nexus-forge-delivery.yml',artifactPath}
  await ctx.runMutation(internal.deliveryDispatch.complete,{attemptId,result:JSON.stringify(result)})
  return result
 }catch(error){
  const message=error instanceof Error?error.message:'Delivery request was not confirmed'
  try{await ctx.runMutation(internal.deliveryDispatch.failed,{attemptId,message})}catch{/* The running claim still blocks replay if uncertainty persistence was interrupted. */}
  // Raw transport messages can contain credentials or request details.
  const status=await ctx.runQuery(internal.delivery.getInternal,{id}).catch(()=>null)
  if(status?.stage==='blocked')throw Error(status.status)
  throw Error('Delivery execution could not be confirmed. Review the retained attempt and GitHub evidence before another request.')
 }
}
