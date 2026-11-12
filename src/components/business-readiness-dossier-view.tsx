import { useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

type Check = { key: string; required: boolean; complete: boolean; evidence: string[] }
type Risk = { key: string; severity: 'low'|'medium'|'high'|'critical'; mitigation: string; owner: string }
const defaultChecks: Check[] = [
 {key:'terms-review',required:true,complete:false,evidence:[]},
 {key:'privacy-review',required:true,complete:false,evidence:[]},
 {key:'security-review',required:true,complete:false,evidence:[]},
 {key:'payments-gated-review',required:true,complete:false,evidence:[]},
 {key:'operations-owner',required:true,complete:false,evidence:[]},
]
export function BusinessReadinessDossierView() {
 const [dossierKey,setDossierKey]=useState('business-readiness-001')
 const [requestKey,setRequestKey]=useState('request-dossier-001')
 const [checks,setChecks]=useState<Check[]>(defaultChecks)
 const [riskKey,setRiskKey]=useState('operational-risk-001')
 const [severity,setSeverity]=useState<Risk['severity']>('medium')
 const [mitigation,setMitigation]=useState('')
 const [owner,setOwner]=useState('')
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const compliance=useQuery(api.scopeDFunctionsBatchTwo.verifyComplianceChecklist,{checklist:checks})
 const recordRisk=useMutation(api.scopeDFunctionsBatchTwo.recordOperationalRisk)
 const compile=useAction(api.scopeDFunctionsBatchTwo.compileExecutiveReadinessDossier)
 const run=async(task:()=>Promise<unknown>,label:string)=>{setBusy(true);setNotice('');try{setNotice(label+': '+JSON.stringify(await task()))}catch(e){setNotice(e instanceof Error?e.message:'Operation failed')}finally{setBusy(false)}}
 return <section className="dashboard-section" aria-labelledby="d29-title"><div className="glass-card research-card">
 <p className="section-kicker">SCOPE D · D29</p><h2 id="d29-title">Business readiness dossier</h2>
 <p>Checklist evidence and operational risks inform the dossier. Payments remain gated; this does not activate billing or launch services.</p>
 <label>Dossier key<input value={dossierKey} onChange={e=>setDossierKey(e.target.value)}/></label><label>Request key<input value={requestKey} onChange={e=>setRequestKey(e.target.value)}/></label>
 <h3>Compliance checklist</h3>{checks.map((c,i)=><fieldset key={c.key}><legend>{c.key}</legend><label><input type="checkbox" checked={c.complete} onChange={e=>setChecks(old=>old.map((x,j)=>i===j?{...x,complete:e.target.checked}:x))}/> Complete</label><label>Evidence references<input value={c.evidence.join(', ')} aria-label={c.key+' evidence'} onChange={e=>setChecks(old=>old.map((x,j)=>i===j?{...x,evidence:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)}:x))}/></label></fieldset>)}
 <p role="status">{compliance===undefined?'Checking compliance…':compliance.ready?'Checklist is complete with required evidence.':`Open items: ${[...compliance.missing,...compliance.evidenceGaps].join(', ')||'none'}`}</p>
 <h3>Operational risk</h3><label>Risk key<input value={riskKey} onChange={e=>setRiskKey(e.target.value)}/></label><label>Severity<select value={severity} onChange={e=>setSeverity(e.target.value as Risk['severity'])}>{['low','medium','high','critical'].map(v=><option key={v}>{v}</option>)}</select></label><label>Mitigation<textarea value={mitigation} onChange={e=>setMitigation(e.target.value)} rows={3}/></label><label>Risk owner<input value={owner} onChange={e=>setOwner(e.target.value)}/></label>
 <button className="primary-button" disabled={busy||!dossierKey.trim()||!requestKey.trim()||!riskKey.trim()||!mitigation.trim()||!owner.trim()} onClick={()=>void run(()=>recordRisk({requestKey,dossierKey,checklist:checks,risk:{key:riskKey,severity,mitigation,owner}}),'Risk record')}>Record operational risk</button>
 <button className="primary-button" disabled={busy||!dossierKey.trim()||!owner.trim()} onClick={()=>void run(()=>compile({dossierKey,checklist:checks,risks:[{key:riskKey,severity,mitigation:mitigation||'Mitigation to be assigned before approval',owner:owner||'unassigned'}]}),'Executive dossier')}>Compile executive readiness dossier</button>
 {notice&&<p role="status" aria-live="polite">{notice}</p>}
 </div></section>
}