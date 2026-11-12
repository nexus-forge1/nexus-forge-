import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useMissionGuide } from '../lib/use-mission-guide'
import { ScopeAPanel, ScopeAField, ScopeAResult, ScopeASubmit } from './scope-a-ui-kit'

export function ReleaseEvidenceGrid() {
 const { missionId } = useMissionGuide(), submitEvidence = useMutation(api.scopeAFunctions.submitMissionEvidence)
 const [requestKey,setRequestKey]=useState('evidence-'+Date.now().toString(36)),[agent,setAgent]=useState('operator'),[reference,setReference]=useState(''),[message,setMessage]=useState(''),[score,setScore]=useState('75'),[severity,setSeverity]=useState<'info'|'warning'|'critical'>('info')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('')
 async function submit(e:React.FormEvent){e.preventDefault();if(!missionId)return;setBusy(true);setError('');setResult('');try{const id=await submitEvidence({missionId,requestKey,agent,reference,message,score:Number(score),severity});setResult('Evidence recorded · '+String(id))}catch(x){setError(x instanceof Error?x.message:'Evidence submission failed')}finally{setBusy(false)}}
 return <ScopeAPanel title="Release evidence ledger" eyebrow="A3 · EVIDENCE">
 <form onSubmit={submit}><ScopeAField label="Request key" value={requestKey} onChange={setRequestKey}/><ScopeAField label="Agent / owner" value={agent} onChange={setAgent}/><ScopeAField label="Evidence reference (URL or record key)" value={reference} onChange={setReference}/><label className="scope-a-field">Evidence summary<textarea value={message} onChange={e=>setMessage(e.target.value)} minLength={3} required/></label><ScopeAField label="Evidence score (0–100)" value={score} type="number" onChange={setScore}/><label className="scope-a-field">Severity<select value={severity} onChange={e=>setSeverity(e.target.value as typeof severity)}><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label><div className="decision-line"><span>SUBMISSION SCORE</span><strong>{Math.max(0,Math.min(100,Number(score)||0))}%</strong></div><progress max={100} value={Math.max(0,Math.min(100,Number(score)||0))} aria-label="Evidence score"/><ScopeASubmit busy={busy} label="Submit evidence"/></form><ScopeAResult value={result} error={error}/>
 </ScopeAPanel>
}
