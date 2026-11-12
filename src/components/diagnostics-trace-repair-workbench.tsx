import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

type PatchFile={path:string;beforeDigest:string;afterDigest:string}
const defaultPatch:PatchFile[]=[{path:'src/repair-target.ts',beforeDigest:'0123456789abcdef',afterDigest:'fedcba9876543210'}]
export function DiagnosticsTraceRepairWorkbench(){
 const [traceText,setTraceText]=useState('["timeout observed in preview","service unavailable during rehearsal"]')
 const [patchText,setPatchText]=useState(JSON.stringify(defaultPatch,null,2))
 const [maxFiles,setMaxFiles]=useState(5);const [requireReversible,setRequireReversible]=useState(true)
 const [requestKey,setRequestKey]=useState('request-incident-001');const [incidentKey,setIncidentKey]=useState('incident-review-001');const [receipt,setReceipt]=useState('')
 const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('')
 const trace=useMemo<string[]>(()=>{try{const x=JSON.parse(traceText);return Array.isArray(x)?x.filter(v=>typeof v==='string'):[]}catch{return []}},[traceText])
 const patchFiles=useMemo<PatchFile[]>(()=>{try{const x=JSON.parse(patchText);return Array.isArray(x)?x.filter(v=>v&&typeof v.path==='string'&&typeof v.beforeDigest==='string'&&typeof v.afterDigest==='string'):[]}catch{return []}},[patchText])
 const classification=useQuery(api.scopeDFunctionsBatchTwo.classifyIncidentTrace,{trace})
 const validation=useQuery(api.scopeDFunctionsBatchTwo.validateBoundedRepairPatch,{files:patchFiles,maxFiles:Math.max(1,Math.min(50,maxFiles)),requireReversible})
 const record=useMutation(api.scopeDFunctionsBatchTwo.recordIncidentContainmentReceipt)
 const run=async()=>{if(!classification||!validation)return;setBusy(true);setNotice('');try{setNotice('Containment receipt: '+JSON.stringify(await record({requestKey,incidentKey,traceDigest:classification.traceDigest,category:classification.category,severity:classification.severity,patchFiles,containmentReceipt:receipt})))}catch(e){setNotice(e instanceof Error?e.message:'Operation failed')}finally{setBusy(false)}}
 return <section className="dashboard-section" aria-labelledby="d35-title"><div className="glass-card research-card"><p className="section-kicker">SCOPE D · D35</p><h2 id="d35-title">Diagnostics trace and repair workbench</h2><p>Classify supplied trace text and validate a bounded patch. This component does not read production logs or apply code changes.</p>
 <label>Incident trace (JSON string array)<textarea rows={4} value={traceText} onChange={e=>setTraceText(e.target.value)}/></label><h3>Trace classification</h3>{classification===undefined?'Classifying trace…':<p role="status">Category: {classification.category} · Severity: {classification.severity} · Indicators: {classification.indicators.join(', ')||'none'}</p>}
 <label>Patch files (JSON array of path/beforeDigest/afterDigest objects)<textarea rows={5} value={patchText} onChange={e=>setPatchText(e.target.value)}/></label><div className="field-grid"><label>Maximum files<input type="number" min="1" max="50" value={maxFiles} onChange={e=>setMaxFiles(Math.min(50,Math.max(1,Number(e.target.value)||1)))}/></label><label><input type="checkbox" checked={requireReversible} onChange={e=>setRequireReversible(e.target.checked)}/> Require reversible change</label></div><p role="status">{validation===undefined?'Validating patch bounds…':validation.valid?'Patch passes structural bounds':validation.blockers.join('; ')}</p>
 <label>Request key<input value={requestKey} onChange={e=>setRequestKey(e.target.value)}/></label><label>Incident key<input value={incidentKey} onChange={e=>setIncidentKey(e.target.value)}/></label><label>Containment receipt<textarea rows={3} value={receipt} onChange={e=>setReceipt(e.target.value)}/></label>
 <button className="primary-button" disabled={busy||!requestKey.trim()||!incidentKey.trim()||!receipt.trim()||!classification||!validation||patchFiles.length>50} onClick={()=>void run()}>Record incident containment receipt</button>{notice&&<p role="status" aria-live="polite">{notice}</p>}</div></section>
}