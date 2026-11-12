import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

type LaunchCheck = { key: string; complete: boolean; evidence: string[] }
const initialChecks: LaunchCheck[] = [
  { key: 'owner-and-cohort', complete: false, evidence: [] },
  { key: 'privacy-review', complete: false, evidence: [] },
  { key: 'support-readiness', complete: false, evidence: [] },
  { key: 'rollback-plan', complete: false, evidence: [] },
]
export function GovernedLaunchGrowthBoard() {
  const [launchKey, setLaunchKey] = useState('launch-review-001')
  const [requestKey, setRequestKey] = useState('request-launch-001')
  const [stage, setStage] = useState<'alpha'|'beta'|'ga'>('alpha')
  const [checks, setChecks] = useState<LaunchCheck[]>(initialChecks)
  const [approver, setApprover] = useState('')
  const [decision, setDecision] = useState<'approved'|'rejected'>('rejected')
  const [visitors, setVisitors] = useState(0)
  const [conversions, setConversions] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const gate = useMutation(api.scopeDFunctionsBatchTwo.gateLaunchStage)
  const conversion = useQuery(api.scopeDFunctionsBatchTwo.aggregateLaunchExperimentConversion, launchKey.trim() ? { launchKey } : 'skip')
  const signoff = useMutation(api.scopeDFunctionsBatchTwo.recordLaunchPhaseSignoff)
  const run = async (task: () => Promise<unknown>, label: string) => { setBusy(true); setNotice(''); try { const result = await task(); setNotice(label + ': ' + JSON.stringify(result)) } catch (e) { setNotice(e instanceof Error ? e.message : 'Operation failed') } finally { setBusy(false) } }
  return <section className="dashboard-section" aria-labelledby="d28-title"><div className="glass-card research-card">
    <p className="section-kicker">SCOPE D · D28</p><h2 id="d28-title">Governed launch and growth board</h2>
    <p>Record a launch-stage gate and phase sign-off. This records governance only; it does not publish or launch externally.</p>
    <label>Launch key<input value={launchKey} onChange={e=>setLaunchKey(e.target.value)} /></label>
    <label>Request key<input value={requestKey} onChange={e=>setRequestKey(e.target.value)} /></label>
    <label>Launch phase<select value={stage} onChange={e=>setStage(e.target.value as typeof stage)}><option value="alpha">Alpha</option><option value="beta">Beta</option><option value="ga">GA</option></select></label>
    <h3>Exit checklist</h3>{checks.map((c,i)=><fieldset key={c.key}><legend>{c.key}</legend><label><input type="checkbox" checked={c.complete} onChange={e=>setChecks(old=>old.map((x,j)=>i===j?{...x,complete:e.target.checked,evidence:e.target.checked&&x.evidence.length===0?['operator-review']:x.evidence}:x))}/> Complete</label><label>Evidence references<input aria-label={c.key+' evidence references'} value={c.evidence.join(', ')} onChange={e=>setChecks(old=>old.map((x,j)=>i===j?{...x,evidence:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)}:x))}/></label></fieldset>)}
    <button className="primary-button" disabled={busy||!launchKey.trim()||!requestKey.trim()} onClick={()=>void run(()=>gate({requestKey,launchKey,stage,checklist:checks}),'Launch gate')}>Record launch gate</button>
    <h3>Experiment conversion</h3>{!launchKey.trim()?'Enter a launch key to load metrics':conversion===undefined?'Loading conversion metrics…':<p>Visitors: {conversion.visitors} · Conversions: {conversion.conversions} · Rate: {(conversion.conversionRate*100).toFixed(2)}%</p>}
    <div className="field-grid"><label>Visitors<input type="number" min="0" value={visitors} onChange={e=>setVisitors(Math.max(0,Number(e.target.value)||0))}/></label><label>Conversions<input type="number" min="0" max={visitors} value={conversions} onChange={e=>setConversions(Math.min(visitors,Math.max(0,Number(e.target.value)||0)))}/></label></div>
    <label>Approver key<input value={approver} onChange={e=>setApprover(e.target.value)}/></label><label>Decision<select value={decision} onChange={e=>setDecision(e.target.value as typeof decision)}><option value="rejected">Reject</option><option value="approved">Approve</option></select></label>
    <button className="primary-button" disabled={busy||!launchKey.trim()||!approver.trim()||conversions>visitors} onClick={()=>void run(()=>signoff({launchKey,decision,approverKey:approver,visitors,conversions}),'Phase sign-off')}>Record phase sign-off</button>
    {notice&&<p role="status" aria-live="polite">{notice}</p>}
  </div></section>
}