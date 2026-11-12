import {useMemo,useState} from 'react'
import {Link} from '@tanstack/react-router'
import {useQuery,useMutation} from 'convex/react'
import {api} from '../../convex/_generated/api'
import {operatorError} from '../lib/operator-error'
type Priority='Critical'|'Action Required'|'Info'
function priorityOf(row:{title:string;detail:string}):Priority{
 const text=(row.title+' '+row.detail).toLowerCase()
 if(/critical|security breach|data loss|production down|payment activation|unauthorized|credential leak/.test(text))return 'Critical'
 if(/blocked|failed|approval|review required|action required|expired|revoked|retry|warning|needs attention/.test(text))return 'Action Required'
 return 'Info'
}
function exportDigest(rows:readonly any[],priority:string){
 const payload={generatedAt:new Date().toISOString(),scope:'Latest 100 project events returned by the owner-scoped notification query',priorityFilter:priority,items:rows.map(n=>({_id:n._id,title:n.title,detail:n.detail,priority:priorityOf(n),read:n.read,createdAt:n.createdAt,path:n.path}))}
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nexus-notification-digest.json';a.click();URL.revokeObjectURL(url)
}
export function NotificationCenter(){
 const rows=useQuery(api.studio.notifications,{}),read=useMutation(api.studio.readNotice)
 const [unread,setUnread]=useState(false),[priority,setPriority]=useState<'All'|Priority>('All'),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState('')
 const filtered=useMemo(()=>((rows??[]).filter(n=>(!unread||!n.read)&&(priority==='All'||priorityOf(n)===priority))),[rows,unread,priority])
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Notification center</h2><p>Live owner-scoped event stream: latest 100 project, template, specification, document and client-review events. Priority is a transparent title/detail triage heuristic, not a source-provided incident severity. Email and push delivery are not enabled.</p>
 <div className="field-grid"><label>Priority filter<select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option>All</option><option>Critical</option><option>Action Required</option><option>Info</option></select></label><label><input type="checkbox" checked={unread} onChange={e=>setUnread(e.target.checked)}/> Unacknowledged only</label></div>
 <div className="hero-actions"><button className="secondary-button" disabled={!!busy||!rows||!rows.some(n=>!n.read)} onClick={async()=>{if(!rows)return;const pending=rows.filter(n=>!n.read);setBusy('all');setError('');setStatus('');try{await Promise.all(pending.map(n=>read({id:n._id,read:true})));setStatus(`Acknowledged ${pending.length} loaded event(s).`)}catch(e){setError(operatorError(e,'Unable to acknowledge all loaded notifications. Some may remain unread.'))}finally{setBusy('')}}}>{busy==='all'?'Acknowledging…':'Acknowledge all loaded'}</button><button className="secondary-button" disabled={!rows?.length} onClick={()=>exportDigest(filtered,priority)}>Export filtered digest</button><Link className="secondary-button" to="/incidents">Mission incidents →</Link></div></div>
 {rows===undefined?<p role="status">Loading notification event stream…</p>:filtered.length===0?<p>No notifications match these filters.</p>:filtered.map(n=>{const level=priorityOf(n);return <article className="glass-card research-card" key={n._id}><div className="panel-title"><h3>{n.title}</h3><span className="live-pill">{level.toUpperCase()}</span></div><p>{n.detail}</p><small>{new Date(n.createdAt).toLocaleString()} · {n.read?'Acknowledged':'Unacknowledged'}</small><div className="hero-actions"><Link className="primary-button" to={n.path as any}>Open related page →</Link><button className="secondary-button" disabled={!!busy} onClick={async()=>{setBusy(n._id);setError('');setStatus('');try{await read({id:n._id,read:!n.read});setStatus(n.read?'Notification marked unacknowledged.':'Notification acknowledged.')}catch(e){setError(operatorError(e,'Unable to update acknowledgement state.'))}finally{setBusy('')}}}>{n.read?'Mark unacknowledged':'Acknowledge'}</button></div></article>})}{error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}</section>
}
