import { useMemo, useState, type FormEvent } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useActiveMission } from '../hooks/use-active-mission'
import { operatorError } from '../lib/operator-error'

type ResearchReceipt = { ok: boolean; result: string; citations: string[]; researchId: string; message: string }

export function ResearchOpportunityWorkbench() {
  const { missionId, mission, research } = useActiveMission()
  const discover = useAction(api.research.search)
  const [candidate, setCandidate] = useState('')
  const [market, setMarket] = useState('')
  const [novelty, setNovelty] = useState(3)
  const [feasibility, setFeasibility] = useState(3)
  const [differentiation, setDifferentiation] = useState(3)
  const [evidenceStrength, setEvidenceStrength] = useState(2)
  const [deep, setDeep] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<ResearchReceipt | null>(null)
  const score = useMemo(() => Math.round((novelty * 0.25 + feasibility * 0.35 + differentiation * 0.2 + evidenceStrength * 0.2) * 10), [novelty, feasibility, differentiation, evidenceStrength])
  const runDiscovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!missionId) { setError('Select an owned mission before running persistent research.'); return }
    setBusy(true); setError(''); setReceipt(null)
    try {
      const query = `Opportunity candidate: ${candidate.trim()}. Target market: ${market.trim()}. Assess novelty, market feasibility, differentiation, evidence gaps, risks, and the next validation experiment. Separate cited evidence from inference.`
      const result = await discover({ missionId, query, deepResearch: deep })
      setReceipt(result as ResearchReceipt)
    } catch (cause) { setError(operatorError(cause, 'Research discovery could not be completed.')) }
    finally { setBusy(false) }
  }
  const downloadDossier = () => {
    if (!receipt) return
    const dossier = { schema: 'nexus-forge-opportunity-dossier-v1', missionId, missionTitle: mission?.title ?? null, candidate, targetMarket: market, assessment: { novelty, feasibility, differentiation, evidenceStrength, weightedScore: score, scoringMethod: 'operator-entered 1–5 ratings; weighted heuristic, not an independent market fact' }, research: receipt, priorSavedResearchCount: research.length, generatedAt: new Date().toISOString() }
    const url = URL.createObjectURL(new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'nexus-forge-opportunity-dossier.json'; link.click(); URL.revokeObjectURL(url)
  }
  return <section className="dashboard-section">
    <div className="glass-card research-card" id="opportunity-discovery">
      <div className="panel-title"><span>OPPORTUNITY DISCOVERY INTAKE</span><span className="live-pill">{missionId ? 'MISSION BOUND' : 'MISSION REQUIRED'}</span></div>
      <p>Capture a concrete opportunity hypothesis, score the candidate, and run cited research against the active mission. Scores are operator judgments; research citations remain attached to the saved record.</p>
      <form onSubmit={runDiscovery}>
        <label>Candidate opportunity<input required minLength={8} maxLength={500} value={candidate} onChange={e=>setCandidate(e.target.value)} placeholder="What customer problem or product opportunity should be investigated?"/></label>
        <label>Target market / user segment<input required minLength={3} maxLength={300} value={market} onChange={e=>setMarket(e.target.value)} placeholder="Who experiences this problem, and in what market?"/></label>
        <div className="field-grid">
          <label>Novelty · {novelty}/5<input type="range" min="1" max="5" value={novelty} onChange={e=>setNovelty(Number(e.target.value))}/></label>
          <label>Market feasibility · {feasibility}/5<input type="range" min="1" max="5" value={feasibility} onChange={e=>setFeasibility(Number(e.target.value))}/></label>
          <label>Differentiation · {differentiation}/5<input type="range" min="1" max="5" value={differentiation} onChange={e=>setDifferentiation(Number(e.target.value))}/></label>
          <label>Evidence strength · {evidenceStrength}/5<input type="range" min="1" max="5" value={evidenceStrength} onChange={e=>setEvidenceStrength(Number(e.target.value))}/></label>
        </div>
        <div className="decision-line"><span>WEIGHTED OPERATOR SCORE</span><strong>{score}/100</strong></div>
        <label className="checkbox-line"><input type="checkbox" checked={deep} onChange={e=>setDeep(e.target.checked)}/> Use deep research (up to five retrieved sources)</label>
        <button className="primary-button" disabled={busy||!missionId}>{busy?'Discovering and synthesizing cited evidence…':'Run discovery & synthesize dossier'}</button>
      </form>
      {error&&<p role="alert" className="warning">{error}</p>}
      {receipt&&<article className="portfolio-row"><div className="portfolio-main"><strong>{receipt.ok?'CITED RESEARCH SAVED':'RESEARCH REQUIRES REVIEW'}</strong><p>{receipt.message}</p><p>{receipt.result}</p><p>{receipt.citations.length} citation(s) · Research record {receipt.researchId}</p>{receipt.citations.map(url=><p key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></p>)}</div><button type="button" className="secondary-button" onClick={downloadDossier}>Export opportunity dossier JSON</button></article>}
    </div>
  </section>
}

export function SafeCapabilityExpansion() {
  const [capability, setCapability] = useState('')
  const [purpose, setPurpose] = useState('')
  const [dataScope, setDataScope] = useState('synthetic-only')
  const [network, setNetwork] = useState('blocked')
  const [writeAccess, setWriteAccess] = useState(false)
  const [requestState, setRequestState] = useState<'draft'|'review'|'contained'>('draft')
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState('')
  const contained = dataScope === 'synthetic-only' && network === 'blocked' && !writeAccess
  return <section className="dashboard-section">
    <div className="glass-card research-card" id="capability-expansion-boundary">
      <div className="panel-title"><span>SAFE CAPABILITY EXPANSION</span><span className="live-pill">{contained?'CONTAINED DEFAULTS':'ELEVATED SCOPE REVIEW'}</span></div>
      <p>Stage an explicit permission-escalation request. This interface never grants the permission itself. Requests remain review records in this browser session; execution, credentials, and host access are not changed.</p>
      <form onSubmit={event=>{event.preventDefault();setError('');if(capability.trim().length<4||purpose.trim().length<12){setError('Provide a capability name and a purpose of at least 12 characters.');return}setRequestState('review');setReviewNote('')}}>
        <label>Capability requested<input required minLength={4} maxLength={160} value={capability} onChange={e=>setCapability(e.target.value)}/></label>
        <label>Purpose and bounded task<textarea required minLength={12} maxLength={1000} rows={3} value={purpose} onChange={e=>setPurpose(e.target.value)}/></label>
        <label>Data boundary<select value={dataScope} onChange={e=>setDataScope(e.target.value)}><option value="synthetic-only">Synthetic / public data only</option><option value="approved-records">Explicitly approved records</option><option value="sensitive">Sensitive or customer data — blocked pending security review</option></select></label>
        <label>Network egress<select value={network} onChange={e=>setNetwork(e.target.value)}><option value="blocked">Blocked</option><option value="allowlisted">Allowlisted destinations only</option><option value="unrestricted">Unrestricted — prohibited</option></select></label>
        <label className="checkbox-line"><input type="checkbox" checked={writeAccess} onChange={e=>setWriteAccess(e.target.checked)}/> Request write / destructive capability</label>
        <div className="decision-line"><span>CONTAINMENT EVALUATION</span><strong>{contained?'CONTAINED BASELINE':'REVIEW REQUIRED'}</strong></div>
        <button className="primary-button" disabled={requestState==='review'}>Submit permission escalation for review</button>
      </form>
      {error&&<p role="alert" className="warning">{error}</p>}
      {requestState==='review'&&<div className="research-card"><h3>Containment review</h3><p>Requested: {capability}. Data: {dataScope}. Egress: {network}. Write access: {writeAccess?'requested':'not requested'}.</p><p>{dataScope==='sensitive'||network==='unrestricted'||writeAccess?'BLOCKED: elevated scope requires a separately authorized security review and isolated environment.':'Review required: confirm least privilege, scope, expiry, auditability and rollback before any implementation.'}</p><label>Reviewer rationale<textarea rows={3} minLength={12} maxLength={1000} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Record scope, risks, owner, expiry and containment evidence"/></label><div className="hero-actions"><button type="button" className="secondary-button" onClick={()=>{setRequestState('contained');setReviewNote('Denied or contained; no permission granted.')}}>Deny / retain containment</button><button type="button" className="secondary-button" disabled={reviewNote.trim().length<12||dataScope==='sensitive'||network==='unrestricted'||writeAccess} onClick={()=>setRequestState('contained')}>Record contained review</button></div></div>}
      {requestState==='contained'&&<p role="status" className="decision-line"><span>FINAL REVIEW STATE</span><strong>CONTAINED — NO PERMISSION GRANTED. {reviewNote||'Review recorded.'}</strong></p>}
    </div>
  </section>
}

export function CostResourceIntelligence() {
  const mine = useQuery(api.billing.mine, {})
  const capacity = useQuery(api.resourceCapacity.overview, {})
  const [inputTokens, setInputTokens] = useState('10000')
  const [outputTokens, setOutputTokens] = useState('2000')
  const [inputRate, setInputRate] = useState('0.5')
  const [outputRate, setOutputRate] = useState('1.5')
  const [budget, setBudget] = useState('10')
  const estimate = Math.max(0, Number(inputTokens)||0) * Math.max(0, Number(inputRate)||0) / 1_000_000 + Math.max(0, Number(outputTokens)||0) * Math.max(0, Number(outputRate)||0) / 1_000_000
  const usage = mine?.usage ?? []
  const trend = usage.slice(0, 12).slice().reverse()
  const amounts = trend.map((row:any)=>Math.max(0, Number(row.charged ?? row.reserved ?? 0)/100))
  const maxAmount = Math.max(0.01, ...amounts)
  const total = amounts.reduce((sum,value)=>sum+value,0)
  const dailyBurn = trend.length>1 ? total / Math.max(1,(trend[trend.length-1].createdAt-trend[0].createdAt)/86400000) : null
  return <section className="dashboard-section">
    <div className="glass-card research-card" id="cost-resource-calculator">
      <div className="panel-title"><span>COST & RESOURCE INTELLIGENCE</span><span className="live-pill">{mine?'BILLING DATA LOADED':'LOADING BILLING DATA'}</span></div>
      <p>Estimate token cost using rates you supply. Historical figures come from the currently loaded account usage records; reservations are not treated as settled charges.</p>
      <div className="field-grid">
        <label>Input tokens<input inputMode="numeric" value={inputTokens} onChange={e=>setInputTokens(e.target.value)}/></label>
        <label>Output tokens<input inputMode="numeric" value={outputTokens} onChange={e=>setOutputTokens(e.target.value)}/></label>
        <label>Input USD / 1M tokens<input inputMode="decimal" value={inputRate} onChange={e=>setInputRate(e.target.value)}/></label>
        <label>Output USD / 1M tokens<input inputMode="decimal" value={outputRate} onChange={e=>setOutputRate(e.target.value)}/></label>
        <label>Step budget (USD)<input inputMode="decimal" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
      </div>
      <div className="stats-strip compact"><div><strong>${estimate.toFixed(6)}</strong><span>Estimated step cost</span></div><div><strong>${Math.max(0,Number(budget)||0).toFixed(2)}</strong><span>Configured step budget</span></div><div><strong>{estimate<=Math.max(0,Number(budget)||0)?'WITHIN BUDGET':'BUDGET ALERT'}</strong><span>Estimate check</span></div></div>
      {estimate>Math.max(0,Number(budget)||0)&&<p role="alert" className="warning">Estimated token cost exceeds the configured step budget. Reduce tokens, adjust supplied rates, or obtain a separately approved budget change.</p>}
    </div>
    <div className="glass-card research-card">
      <div className="panel-title"><span>RECORDED PROVIDER COST TREND</span><span className="live-pill">{usage.length} USAGE RECORDS LOADED</span></div>
      {trend.length===0?<p>No billing usage records are currently available. Cost trends and burn rate remain unavailable, not zero-cost.</p>:<><div className="stats-strip compact"><div><strong>${total.toFixed(2)}</strong><span>Recent recorded spend/reservations</span></div><div><strong>{dailyBurn===null?'—':'$'+dailyBurn.toFixed(2)}</strong><span>Approx. daily burn (USD/day)</span></div><div><strong>{usage.filter((row:any)=>row.status==='review').length}</strong><span>Usage records requiring review</span></div></div><div className="provider-list">{trend.map((row:any,index:number)=><div className="portfolio-row" key={row._id}><div className="portfolio-main"><strong>{row.costBasis??'Provider cost basis not recorded'}</strong><p>{new Date(row.createdAt).toLocaleString()} · {row.status}</p></div><div className="portfolio-cell"><small>{row.status==='settled'?'SETTLED':'RESERVED / REVIEW'}</small><b>${(Number(row.charged??row.reserved??0)/100).toFixed(2)}</b></div><div style={{width:'100%',maxWidth:160,height:8,background:'var(--muted)',borderRadius:99,overflow:'hidden'}}><div style={{width:((amounts[index]??0)/maxAmount*100)+'%',height:'100%',background:'var(--primary)'}}/></div></div>)}</div></>}
      <p className="muted-copy">Provider-specific trend grouping depends on the cost basis returned by billing records. This view does not invent provider token usage or substitute estimates for invoices.</p>
    </div>
    <div className="glass-card research-card"><div className="panel-title"><span>RESOURCE QUOTA TELEMETRY</span><span className="live-pill">{capacity?'CAPACITY DATA LOADED':'LOADING'}</span></div>{!capacity?<p>Loading retained record-capacity counters…</p>:<><p>{capacity.scope}</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Collection</th><th>Count</th><th>Limit</th><th>Remaining</th><th>Admission</th></tr></thead><tbody>{capacity.rows.map((row:any)=><tr key={row.id}><th>{row.label}</th><td>{row.complete?row.count:'At least '+row.count}</td><td>{row.limit}</td><td>{row.readLimited?'Unknown':row.remaining}</td><td>{row.blocked?'LIMIT REACHED':row.readLimited?'REVIEW REQUIRED':'AVAILABLE'}</td></tr>)}</tbody></table></div></>}</div>
  </section>
}

const paymentGates = [
  {id:'account', label:'Billing account ownership and mode confirmed', detail:'Account and payment mode reviewed against the intended environment.'},
  {id:'terms', label:'Commercial terms, tax and refund policy approved', detail:'Terms, jurisdiction, tax treatment and refunds reviewed by the responsible operator.'},
  {id:'rails', label:'Payment provider keys and webhook reconciliation independently verified', detail:'Provider setup is verified without creating a checkout or charge.'},
  {id:'ledger', label:'Receipt, idempotency, refund and reconciliation controls evidenced', detail:'Ledger invariants and duplicate-event handling have written evidence.'},
  {id:'security', label:'Security, privacy and access review signed off', detail:'Data retention, permissions, incident response and audit access reviewed.'},
  {id:'release', label:'Release owner and rollback plan explicitly approved', detail:'A separate release approval and documented rollback plan exist.'},
] as const

export function PaymentActivationReadiness() {
  const [checked,setChecked] = useState<Record<string,boolean>>({})
  const [reviewNote,setReviewNote] = useState('')
  const completed = paymentGates.filter(gate=>checked[gate.id]).length
  return <section className="dashboard-section">
    <div className="glass-card research-card" id="payment-activation-gate">
      <div className="panel-title"><span>B17 · PAYMENT ACTIVATION BOUNDARY</span><span className="live-pill">RELEASE LOCKED</span></div>
      <h2>Gated boundary &amp; readiness verification</h2>
      <p>This is a readiness-only interface. It does not create checkout sessions, call billing portal actions, change payment mode, configure payment credentials, contact payment rails, or initiate a financial charge. The release lock cannot be removed from this screen.</p>
      <div className="stats-strip compact"><div><strong>{completed}/{paymentGates.length}</strong><span>Prerequisites checked by operator</span></div><div><strong>{paymentGates.length-completed}</strong><span>Unconfirmed prerequisites</span></div><div><strong>LOCKED</strong><span>Live charge capability</span></div></div>
      <div className="decision-line"><span>PAYMENT RELEASE STATE</span><strong>GATED — NO LIVE CHARGES PERMITTED BY THIS FEATURE</strong></div>
      {paymentGates.map(gate=><label className="portfolio-row" key={gate.id}><input type="checkbox" checked={!!checked[gate.id]} onChange={event=>setChecked(current=>({...current,[gate.id]:event.target.checked}))}/><div className="portfolio-main"><strong>{gate.label}</strong><p>{gate.detail}</p></div><span className="live-pill">{checked[gate.id]?'OPERATOR CHECKED':'MISSING GATE'}</span></label>)}
      <label>Readiness review notes<textarea rows={3} maxLength={2000} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Reference evidence, accountable owner, date, and outstanding risks"/></label>
      <button type="button" className="primary-button" disabled>Release payment activation — permanently disabled in this view</button>
      <p role="status">Readiness status: {completed===paymentGates.length&&reviewNote.trim().length>=20?'ALL ITEMS OPERATOR-CHECKED · INDEPENDENT SIGN-OFF STILL REQUIRED':'NOT READY · '+(paymentGates.length-completed)+' GATE(S) UNCONFIRMED'}. Checking a box records only this browser session's review state and is not a verified approval.</p>
    </div>
  </section>
}
