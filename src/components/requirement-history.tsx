import{useQuery,useMutation}from'convex/react'
import{useState}from'react'
import{api}from'../../convex/_generated/api'
import type{Id}from'../../convex/_generated/dataModel'
import{operatorError}from'../lib/operator-error'
function HistoryPage({missionId,kind}:{missionId:Id<'missions'>;kind:'resources'|'dependencies'}){
 const[cursors,setCursors]=useState<(string|null)[]>([null])
 const page=useQuery(kind==='resources'?api.orchestration.listResourcesPage:api.orchestration.listDependenciesPage,{missionId,paginationOpts:{numItems:20,cursor:cursors[cursors.length-1]}})
 return <div><p>Page {cursors.length}. Retained records are shown in bounded pages; earlier evidence remains available.</p>
 {!page?<p role="status">Loading requirement history…</p>:<>
 {page.page.length===0&&<p>No records on this page.</p>}
 {page.page.map(row=><div className="guard-item" key={row._id} style={{overflowWrap:'anywhere'}}><div>{'resourceKey'in row?<><strong>{row.resourceKey.slice(0,240)}{row.resourceKey.length>240?'…':''}</strong><small>{row.mode} · {row.status}</small></>:<><strong>{row.kind} dependency</strong><small>{row.dependsOnMissionId}</small>{row.note&&<p>Note excerpt: {row.note.slice(0,500)}{row.note.length>500?'…':''}</p>}</>}</div></div>)}
 <button className="secondary-button" disabled={cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))}>Previous history page</button>
 <button className="secondary-button" disabled={page.isDone} onClick={()=>setCursors(v=>[...v,page.continueCursor])}>Next history page</button>
 </>}
 </div>
}
export function RequirementHistory({missionId}:{missionId:Id<'missions'>}){
 const[open,setOpen]=useState(false),[kind,setKind]=useState<'resources'|'dependencies'>('resources')
 const[busy,setBusy]=useState(false),[receipt,setReceipt]=useState<string|null>(null),[error,setError]=useState<string|null>(null)
 const status=useQuery(api.orchestration.releaseStatus,{missionId}),request=useMutation(api.orchestration.requestRelease)
 return <div className="glass-card research-card"><div className="panel-title"><span>RETAINED REQUIREMENTS & RESOURCE CLEANUP</span></div>
 <p>Inspect saved dependencies and reservations. Releasing held resources preserves their history and blocks new acquisition until cleanup finishes.</p>
 {status===undefined?<p role="status">Loading cleanup status…</p>:status?<p role="status">Cleanup {status.status} · {status.released} reservation(s) released in generation {status.generation}.{status.error?' '+status.error:''}</p>:<p>No cleanup requested for this mission.</p>}
 {receipt&&<p role="status">{receipt}</p>}{error&&<p role="alert">{error}</p>}
 <button className="secondary-button" disabled={busy||status===undefined||status?.status==='pending'} onClick={async()=>{
  setBusy(true);setReceipt(null);setError(null)
  try{const result=await request({missionId});setReceipt(result.pending?'Cleanup started. '+result.totalReleased+' reservation(s) released so far; remaining batches continue automatically.':'Cleanup complete. '+result.totalReleased+' reservation(s) released in this cleanup generation.')}
  catch(e){setError(operatorError(e,'Cleanup could not be confirmed. Review its saved status before another request.'))}finally{setBusy(false)}
 }}>{busy?'Requesting cleanup…':status?.status==='pending'?'Cleanup in progress':status?.status==='review'?'Retry reviewed cleanup':'Release held resources'}</button>
 <button className="secondary-button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Hide requirement history':'Inspect requirement history'}</button>
 {open&&<><label htmlFor="requirement-history-kind">History type</label><select id="requirement-history-kind" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="resources">Resource reservations</option><option value="dependencies">Mission dependencies</option></select><HistoryPage key={missionId+kind} missionId={missionId} kind={kind}/></>}
 </div>
}
