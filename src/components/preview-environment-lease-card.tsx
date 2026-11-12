import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

export function PreviewEnvironmentLeaseCard(){
 const [requestKey,setRequestKey]=useState('request-preview-001')
 const [environmentKey,setEnvironmentKey]=useState('preview-env-review')
 const [leaseKey,setLeaseKey]=useState('preview-lease-001')
 const [ttlHours,setTtlHours]=useState(24)
 const [createdAt,setCreatedAt]=useState(Date.now())
 const [state,setState]=useState<'ready'|'expired'|'teardown_requested'|'torn_down'>('teardown_requested')
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const expiration=useQuery(api.scopeDFunctionsBatchTwo.calculatePreviewLeaseExpiration,{createdAt,ttlMs:Math.max(1,Math.round(ttlHours*60*60*1000))})
 const request=useMutation(api.scopeDFunctionsBatchTwo.requestEphemeralEnvironment)
 const transition=useMutation(api.scopeDFunctionsBatchTwo.transitionPreviewTeardownState)
 const run=async(task:()=>Promise<unknown>,label:string)=>{setBusy(true);setNotice('');try{setNotice(label+': '+JSON.stringify(await task()))}catch(e){setNotice(e instanceof Error?e.message:'Operation failed')}finally{setBusy(false)}}
 return <section className="dashboard-section" aria-labelledby="d31-title"><div className="glass-card research-card"><p className="section-kicker">SCOPE D · D31</p><h2 id="d31-title">Preview environment lease</h2><p>Creates an internal lease request record only. It never provisions cloud resources.</p>
 <label>Request key<input value={requestKey} onChange={e=>setRequestKey(e.target.value)}/></label><label>Environment key<input value={environmentKey} onChange={e=>setEnvironmentKey(e.target.value)}/></label><label>Lease key<input value={leaseKey} onChange={e=>setLeaseKey(e.target.value)}/></label><label>Lease duration (hours)<input type="number" min="0.02" max="168" step="0.5" value={ttlHours} onChange={e=>setTtlHours(Math.min(168,Math.max(0.02,Number(e.target.value)||0.02)))}/></label>
 <button className="primary-button" disabled={busy||!requestKey.trim()||!environmentKey.trim()||!leaseKey.trim()} onClick={()=>void run(async()=>{const result=await request({requestKey,environmentKey,leaseKey,ttlMs:Math.round(ttlHours*3600000)});setCreatedAt(Date.now());return result},'Lease request')}>Record preview lease request</button>
 <h3>Lease expiration</h3>{expiration===undefined?'Calculating lease expiration…':<p role="status">{expiration.expired?'Lease expired':`Expires ${new Date(expiration.expiresAt).toLocaleString()} · ${Math.ceil(expiration.remainingMs/60000)} minutes remaining`}</p>}
 <label>Lease lifecycle state<select value={state} onChange={e=>setState(e.target.value as typeof state)}>{['ready','expired','teardown_requested','torn_down'].map(v=><option key={v} value={v}>{v}</option>)}</select></label><button className="primary-button" disabled={busy||!leaseKey.trim()} onClick={()=>void run(()=>transition({leaseKey,state}),'Lease transition')}>Record lifecycle transition</button>
 {notice&&<p role="status" aria-live="polite">{notice}</p>}</div></section>
}