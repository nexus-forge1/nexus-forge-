import {useState} from 'react'
import {useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
export function RuntimeHistory(){
 const summary=useQuery(api.runtimeReceipts.activeSummary,{})
 const[expanded,setExpanded]=useState(false),[cursors,setCursors]=useState<(string|null)[]>([null])
 const page=useQuery(api.runtimeReceipts.historyPage,expanded?{paginationOpts:{numItems:20,cursor:cursors[cursors.length-1]}}:'skip')
 return <details><summary>Runtime receipts</summary>
 {!summary?<p role="status">Loading receipts…</p>:<><p role="status">{summary.scope}</p>{summary.rows.map(j=><div key={j._id}><p>{j.kind} · {j.status} · {j.requestKey}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{j.result??'Pending; do not duplicate this request'}</pre></div>)}</>}
 <button className="secondary-button" onClick={()=>setExpanded(!expanded)}>{expanded?'Hide retained history':'Browse retained history'}</button>
 {expanded&&<><p>Retained history includes archived runtime kinds. Each page reads only your receipts.</p>{!page?<p role="status">Loading history page…</p>:<>{page.page.map(j=><details key={j._id}><summary>{j.kind} · {j.status} · {j.requestKey}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{j.result??'Pending; review before using another request key'}</pre></details>)}{!page.page.length&&<p>No receipts on this page.</p>}<button className="secondary-button" disabled={cursors.length===1} onClick={()=>setCursors(c=>c.slice(0,-1))}>Previous history page</button><button className="secondary-button" disabled={page.isDone} onClick={()=>setCursors(c=>[...c,page.continueCursor])}>Next history page</button></>}</>}
 </details>
}
