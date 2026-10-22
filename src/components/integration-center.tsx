import {useEffect,useState} from 'react'
import {useQuery} from 'convex/react'
import {Link} from '@tanstack/react-router'
import {api} from '../../convex/_generated/api'
import {ExternalJsonLookup} from './external-json-lookup'
export function IntegrationCenter(){
 const adapters=useQuery(api.externalRuntime.list,{}),[mounted,setMounted]=useState(false)
 useEffect(()=>setMounted(true),[])
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Integration center</h2><p>Inspect and test the existing governed public JSON lookup adapters. Enabled means permission is configured; only a successful retained request establishes an observed response. OAuth account connections and arbitrary authenticated service connectors remain planned.</p><div className="hero-actions"><Link className="primary-button" to="/developers">Register a typed adapter or review GitHub write plans →</Link><Link className="secondary-button" to="/resilience">Inspect runtime history and limits →</Link></div></div>
 {adapters===undefined?<p role="status">Loading connection inventory…</p>:adapters.length===0?<div className="glass-card research-card"><p>No JSON lookup adapters configured. Register and validate a contract in Developer Integrations first.</p></div>:adapters.map(a=><article className="glass-card research-card" key={a._id}><p>Contract: {a.packageId} · Access: {a.enabled?'Enabled':'Revoked'} · Tool scope: bounded public GET through the egress gateway</p>{mounted?<ExternalJsonLookup adapter={a}/>:<p>Loading request controls…</p>}</article>)}</section>
}
