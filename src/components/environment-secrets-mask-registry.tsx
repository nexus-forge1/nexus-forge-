import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

type SecretRef={name:string;reference:string}
export function EnvironmentSecretsMaskRegistry(){
 const [refsText,setRefsText]=useState('[{"name":"CONVEX_URL","reference":"env:VITE_CONVEX_URL"},{"name":"API_TOKEN","reference":"vault:nexus/api-token"}]')
 const [requestedText,setRequestedText]=useState('["read:preview","rotate:secrets"]')
 const [allowedText,setAllowedText]=useState('["read:preview","rotate:secrets"]')
 const [requestKey,setRequestKey]=useState('request-secret-001')
 const [environmentKey,setEnvironmentKey]=useState('preview-env')
 const [reference,setReference]=useState('vault:nexus/api-token')
 const [actorKey,setActorKey]=useState('')
 const [outcome,setOutcome]=useState<'planned'|'completed'|'failed'>('planned')
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const refs=useMemo<SecretRef[]>(()=>{try{const x=JSON.parse(refsText);return Array.isArray(x)?x.filter(v=>v&&typeof v.name==='string'&&typeof v.reference==='string'):[]}catch{return []}},[refsText])
 const requestedScopes=useMemo<string[]>(()=>{try{const x=JSON.parse(requestedText);return Array.isArray(x)?x.filter(v=>typeof v==='string'):[]}catch{return []}},[requestedText])
 const allowedScopes=useMemo<string[]>(()=>{try{const x=JSON.parse(allowedText);return Array.isArray(x)?x.filter(v=>typeof v==='string'):[]}catch{return []}},[allowedText])
 const masked=useQuery(api.scopeDFunctionsBatchTwo.generateMaskedSecretReferences,{references:refs})
 const policy=useQuery(api.scopeDFunctionsBatchTwo.verifyEnvironmentScopePolicy,{requestedScopes,allowedScopes})
 const rotate=useMutation(api.scopeDFunctionsBatchTwo.recordEnvironmentSecretRotation)
 const run=async()=>{setBusy(true);setNotice('');try{setNotice('Rotation audit: '+JSON.stringify(await rotate({requestKey,environmentKey,reference,actorKey,outcome})))}catch(e){setNotice(e instanceof Error?e.message:'Operation failed')}finally{setBusy(false)}}
 return <section className="dashboard-section" aria-labelledby="d32-title"><div className="glass-card research-card"><p className="section-kicker">SCOPE D · D32</p><h2 id="d32-title">Environment secrets mask registry</h2><p>Only secret references are accepted. Never paste a secret value into this workspace.</p>
 <label>Secret references (JSON array of name/reference objects)<textarea rows={4} value={refsText} onChange={e=>setRefsText(e.target.value)}/></label><h3>Masked registry</h3>{masked===undefined?'Masking secret references…':<><p>{masked.count} references processed</p><pre>{JSON.stringify(masked.references,null,2)}</pre></>}
 <label>Requested scopes (JSON string array)<textarea rows={2} value={requestedText} onChange={e=>setRequestedText(e.target.value)}/></label><label>Allowed scopes (JSON string array)<textarea rows={2} value={allowedText} onChange={e=>setAllowedText(e.target.value)}/></label><p role="status">{policy===undefined?'Verifying scope policy…':policy.allowed?'Scope policy permits all requested scopes':'Denied scopes: '+policy.denied.join(', ')}</p>
 <h3>Rotation audit</h3><label>Request key<input value={requestKey} onChange={e=>setRequestKey(e.target.value)}/></label><label>Environment key<input value={environmentKey} onChange={e=>setEnvironmentKey(e.target.value)}/></label><label>Secret reference<input value={reference} onChange={e=>setReference(e.target.value)}/></label><label>Actor key<input value={actorKey} onChange={e=>setActorKey(e.target.value)}/></label><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}>{['planned','completed','failed'].map(v=><option key={v}>{v}</option>)}</select></label>
 <button className="primary-button" disabled={busy||!requestKey.trim()||!environmentKey.trim()||!reference.trim()||!actorKey.trim()} onClick={()=>void run()}>Record rotation audit</button>{notice&&<p role="status" aria-live="polite">{notice}</p>}</div></section>
}