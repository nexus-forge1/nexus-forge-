import {useState} from 'react'
import {Link} from '@tanstack/react-router'
import {useQuery,useMutation} from 'convex/react'
import {api} from '../../convex/_generated/api'
import {operatorError} from '../lib/operator-error'
export function NotificationCenter(){
 const rows=useQuery(api.studio.notifications,{}),read=useMutation(api.studio.readNotice),[unread,setUnread]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState('')
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Notification center</h2><p>Latest 100 project, template, specification, document and client-review events. Existing mission incidents remain in Incident Center. Email and push delivery are not enabled.</p><label><input type="checkbox" checked={unread} onChange={e=>setUnread(e.target.checked)}/> Unread only</label><Link className="secondary-button" to="/incidents">Mission incidents →</Link></div>{rows===undefined?<p role="status">Loading notifications…</p>:rows.filter(n=>!unread||!n.read).length===0?<p>No matching notifications.</p>:rows.filter(n=>!unread||!n.read).map(n=><article className="glass-card research-card" key={n._id}><h3>{n.title}</h3><p>{n.detail}</p><small>{new Date(n.createdAt).toLocaleString()} · {n.read?'Read':'Unread'}</small><div className="hero-actions"><Link className="primary-button" to={n.path as any}>Open related page →</Link><button className="secondary-button" disabled={!!busy} onClick={async()=>{setBusy(n._id);setError('');try{await read({id:n._id,read:!n.read})}catch(e){setError(operatorError(e,'Unable to update read state.'))}finally{setBusy('')}}}>{n.read?'Mark unread':'Mark read'}</button></div></article>)}{error&&<p role="alert">{error}</p>}</section>
}
