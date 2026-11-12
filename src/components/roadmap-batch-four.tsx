import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

type Incident = { id: string; kind: string; severity: string; detail: string; at: string }
const panel = 'glass-card research-card'
function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
function SectionTitle({title, tag}:{title:string;tag:string}) {
  return <div className="panel-title"><span>{title}</span><span className="live-pill">{tag}</span></div>
}

export function SecurityResilienceScale() {
  const [limits, setLimits] = useState({requests: true, burst: true, suspicious: true, challenge: false, networkShield: false})
  const [threshold, setThreshold] = useState('120')
  const [pattern, setPattern] = useState('repeated-auth-failures')
  const [severity, setSeverity] = useState('high')
  const [detail, setDetail] = useState('')
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [filter, setFilter] = useState('all')
  const visible = incidents.filter(i => filter === 'all' || i.severity === filter)
  function trigger() {
    const row = {id: crypto.randomUUID(), kind: pattern, severity, detail: detail.trim() || 'Operator-triggered security review; investigation required.', at: new Date().toISOString()}
    setIncidents(current => [row, ...current])
    setDetail('')
  }
  return <section className="workspace frontier-feature" id="b19-security-resilience">
    <div className={panel}><SectionTitle title="B19 · SECURITY & RESILIENCE AT SCALE" tag="POLICY INSPECTOR"/>
      <p>Inspect request-admission thresholds, suspicious traffic patterns and operator-triggered incidents. These switches record the intended application policy in this view; they do not configure CDN, WAF, network edge or provider infrastructure.</p>
      <div className="field-grid">
        {([['requests','Request rate limiting'],['burst','Burst anomaly detection'],['suspicious','Suspicious-pattern alerts'],['challenge','Require challenge for elevated risk'],['networkShield','DDoS mitigation escalation policy']] as const).map(([key,label])=><label key={key} className="decision-line"><span>{label}</span><input type="checkbox" checked={limits[key]} onChange={e=>setLimits(s=>({...s,[key]:e.target.checked}))}/></label>)}
      </div>
      <label>Rate-limit alert threshold (requests / minute)<input type="number" min="1" max="100000" value={threshold} onChange={e=>setThreshold(e.target.value)}/></label>
      <div className="decision-line"><span>ACTIVE POLICY DRAFT</span><strong>{Object.values(limits).filter(Boolean).length} of 5 controls enabled · threshold {threshold || 'unset'}/min</strong></div>
      <p className="muted-copy">Enforcement status: NOT CONNECTED TO EDGE PROVIDER. Treat this as an operator policy draft until an infrastructure adapter confirms the applied configuration.</p>
    </div>
    <div className={panel}><SectionTitle title="Suspicious pattern & incident trigger" tag="OPERATOR CONTROL"/>
      <div className="field-grid"><label>Pattern<select value={pattern} onChange={e=>setPattern(e.target.value)}><option value="repeated-auth-failures">Repeated authentication failures</option><option value="request-rate-spike">Request-rate spike</option><option value="credential-stuffing">Credential-stuffing signature</option><option value="unexpected-egress">Unexpected outbound egress</option><option value="privilege-escalation">Privilege-escalation attempt</option></select></label><label>Severity<select value={severity} onChange={e=>setSeverity(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label></div>
      <label>Incident context<textarea value={detail} onChange={e=>setDetail(e.target.value)} maxLength={2000} rows={3} placeholder="What was observed, affected resource, or evidence reference"/></label>
      <button className="primary-button" type="button" onClick={trigger}>Record security incident</button>
      <div className="decision-line"><span>RECORDED INCIDENTS IN THIS VIEW</span><strong>{incidents.length}</strong></div>
      <label>Filter incidents<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
      {visible.length ? visible.map(i=><article key={i.id} className="decision-line"><span>{i.severity.toUpperCase()} · {i.kind}<br/>{new Date(i.at).toLocaleString()}</span><strong>{i.detail}</strong></article>):<p>No matching incidents recorded in this session.</p>}
      <button className="secondary-button" type="button" onClick={()=>downloadJson('nexus-security-incident-ledger.json',{policy:{...limits,requestsPerMinute:Number(threshold)},incidents,exportedAt:new Date().toISOString(),enforcement:'not connected to edge provider'})}>Export incident ledger</button>
    </div>
  </section>
}

export function EnterpriseGovernanceWorkbench() {
  const [organization, setOrganization] = useState('personal')
  const [workspace, setWorkspace] = useState('private')
  const [member, setMember] = useState('')
  const [role, setRole] = useState('Operator')
  const [assignments, setAssignments] = useState<Array<{member:string;role:string;org:string;workspace:string;at:string}>>([])
  const [action, setAction] = useState('all')
  const [audit, setAudit] = useState<Array<{action:string;detail:string;at:string}>>([])
  const [filter, setFilter] = useState('')
  const visible = audit.filter(row => (action === 'all' || row.action === action) && (row.detail.toLowerCase().includes(filter.toLowerCase()) || row.action.toLowerCase().includes(filter.toLowerCase())))
  function record(actionName:string, detailText:string) { setAudit(rows=>[{action:actionName,detail:detailText,at:new Date().toISOString()},...rows]) }
  function assign(e:FormEvent<HTMLFormElement>) { e.preventDefault(); if(!member.trim()) return; const row={member:member.trim(),role,org:organization,workspace,at:new Date().toISOString()};setAssignments(rows=>[row,...rows]);record('role-draft',`${role} role drafted for ${member.trim()} in ${organization}/${workspace}`);setMember('') }
  return <section className="workspace frontier-feature" id="b20-enterprise-governance">
    <div className={panel}><SectionTitle title="B20 · ORGANIZATION & WORKSPACE ISOLATION" tag="SCOPE SELECTOR"/>
      <div className="field-grid"><label>Organization context<select value={organization} onChange={e=>{setOrganization(e.target.value);record('organization-switch',`Selected ${e.target.value}`)}}><option value="personal">Personal organization</option><option value="enterprise">Enterprise organization</option><option value="sandbox">Isolated sandbox</option></select></label><label>Workspace boundary<select value={workspace} onChange={e=>{setWorkspace(e.target.value);record('workspace-switch',`Selected ${e.target.value}`)}}><option value="private">Private workspace</option><option value="team">Team workspace</option><option value="restricted">Restricted workspace</option><option value="sandbox">Sandbox workspace</option></select></label></div>
      <div className="decision-line"><span>CURRENT VIEW SCOPE</span><strong>{organization} / {workspace}</strong></div>
      <p>Changing this selector changes the review context only. Actual tenant isolation and access decisions remain enforced by server-side team/workspace APIs, not by this client-side selector.</p>
    </div>
    <div className={panel}><SectionTitle title="RBAC role-assignment intake" tag="REVIEW DRAFT"/>
      <form onSubmit={assign}><label>Member identifier or email<input value={member} onChange={e=>setMember(e.target.value)} required maxLength={254} placeholder="member@example.com"/></label><label>Requested role<select value={role} onChange={e=>setRole(e.target.value)}><option>Admin</option><option>Operator</option><option>Auditor</option></select></label><button className="primary-button">Record role assignment request</button></form>
      <p className="muted-copy">This intake records a review draft only; it does not grant privileges. Use the existing Team Governance screen for server-authorized membership and role changes.</p>
      {assignments.map((a,i)=><div className="decision-line" key={a.at+i}><span>{a.member}<br/>{a.org}/{a.workspace}</span><strong>{a.role} · REQUESTED</strong></div>)}
    </div>
    <div className={panel}><SectionTitle title="Audit log filter & export" tag="SESSION VIEW"/>
      <div className="field-grid"><label>Action type<select value={action} onChange={e=>setAction(e.target.value)}><option value="all">All actions</option><option value="role-draft">Role drafts</option><option value="organization-switch">Organization switch</option><option value="workspace-switch">Workspace switch</option></select></label><label>Search audit detail<input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter by text"/></label></div>
      {visible.map((row,i)=><div className="decision-line" key={row.at+i}><span>{row.action}<br/>{new Date(row.at).toLocaleString()}</span><strong>{row.detail}</strong></div>)}
      {!visible.length&&<p>No matching audit activity in this view.</p>}
      <button className="secondary-button" type="button" onClick={()=>downloadJson('nexus-enterprise-audit-view.json',{organization,workspace,assignments,audit,exportedAt:new Date().toISOString(),source:'client review-session ledger; not the authoritative server audit log'})}>Export audit view</button>
    </div>
  </section>
}

export function DeveloperEcosystemWorkbench() {
  const [endpoint,setEndpoint] = useState('')
  const [events,setEvents] = useState(['mission.completed','artifact.verified'])
  const [subscriptions,setSubscriptions] = useState<Array<{id:string;endpoint:string;events:string[];createdAt:string}>>([])
  const [scope,setScope] = useState(['missions:read'])
  const [token,setToken] = useState('')
  const [agents,setAgents] = useState<Array<{name:string;version:string;owner:string;scopes:string[];at:string}>>([])
  const [name,setName] = useState('')
  const [version,setVersion] = useState('1.0.0')
  const [owner,setOwner] = useState('')
  const allEvents=['mission.created','mission.completed','artifact.created','artifact.verified','release.approved','incident.opened']
  const allScopes=['missions:read','artifacts:read','events:subscribe','agents:register']
  function toggle<T extends string>(value:T, values:T[], set:(v:T[])=>void) {set(values.includes(value)?values.filter(x=>x!==value):[...values,value])}
  function createToken() { const bytes=new Uint8Array(32); crypto.getRandomValues(bytes); setToken('nf_scope_draft_'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')) }
  return <section className="workspace frontier-feature" id="b21-developer-ecosystem">
    <div className={panel}><SectionTitle title="B21 · WEBHOOK SUBSCRIPTION INTAKE" tag="EVENT CONTRACT"/>
      <label>HTTPS webhook endpoint<input type="url" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://example.com/webhooks/nexus"/></label>
      <div className="field-grid">{allEvents.map(ev=><label key={ev} className="decision-line"><span>{ev}</span><input type="checkbox" checked={events.includes(ev)} onChange={()=>toggle(ev,events,setEvents)}/></label>)}</div>
      <button className="primary-button" type="button" disabled={!endpoint.startsWith('https://')||events.length===0} onClick={()=>{setSubscriptions(rows=>[{id:crypto.randomUUID(),endpoint,events,createdAt:new Date().toISOString()},...rows]);setEndpoint('')}}>Record webhook subscription request</button>
      <p className="muted-copy">This intake does not dispatch events or verify endpoint ownership. A production webhook requires a server-managed secret, signature verification, retries, replay protection and delivery receipts.</p>
      {subscriptions.map(s=><div className="decision-line" key={s.id}><span>{s.endpoint}<br/>{s.events.join(', ')}</span><strong>REQUESTED</strong></div>)}
    </div>
    <div className={panel}><SectionTitle title="Scoped API token generator" tag="LIMITED SCOPE"/>
      <p>Generate a high-entropy token-shaped draft for scope planning. This browser-generated value is not registered with or accepted by the NEXUS FORGE API; never use it as a production credential.</p>
      {allScopes.map(s=><label className="decision-line" key={s}><span>{s}</span><input type="checkbox" checked={scope.includes(s)} onChange={()=>toggle(s,scope,setScope)}/></label>)}
      <button className="secondary-button" type="button" disabled={scope.length===0} onClick={createToken}>Generate scoped token draft</button>
      {token&&<><label>One-time displayed token draft<textarea readOnly rows={3} value={token}/></label><p>Requested scopes: {scope.join(', ')}. Copy only for design review; it has no server-side authority.</p><button className="ghost-button" type="button" onClick={()=>setToken('')}>Clear token from view</button></>}
    </div>
    <div className={panel}><SectionTitle title="Event listener inspector" tag="EVENT CATALOG"/>
      <table><thead><tr><th>Event</th><th>Payload</th><th>Delivery status</th></tr></thead><tbody>{allEvents.map(ev=><tr key={ev}><td>{ev}</td><td>Versioned event envelope · id · createdAt · data</td><td>Catalog only — no listener registered</td></tr>)}</tbody></table>
    </div>
    <div className={panel}><SectionTitle title="Third-party agent registration" tag="DECLARATION"/>
      <form onSubmit={e=>{e.preventDefault();setAgents(rows=>[{name:name.trim(),version,owner:owner.trim(),scopes:scope,at:new Date().toISOString()},...rows]);setName('');setOwner('')}}><label>Agent name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={120}/></label><label>Version<input value={version} onChange={e=>setVersion(e.target.value)} required pattern="\\d+\\.\\d+\\.\\d+"/></label><label>Maintainer<input value={owner} onChange={e=>setOwner(e.target.value)} required maxLength={254}/></label><button className="primary-button" disabled={scope.length===0}>Register agent declaration</button></form>
      {agents.map((a,i)=><div className="decision-line" key={a.at+i}><span>{a.name}@{a.version}<br/>{a.owner}</span><strong>{a.scopes.join(', ')}</strong></div>)}
      <button className="secondary-button" type="button" onClick={()=>downloadJson('nexus-developer-ecosystem.json',{subscriptions,agents,eventCatalog:allEvents,exportedAt:new Date().toISOString()})}>Export ecosystem registry</button>
    </div>
  </section>
}

export function NoveltyBenchmarkWorkbench() {
  const [feature,setFeature] = useState('')
  const [candidate,setCandidate] = useState('')
  const [priorArt,setPriorArt] = useState('')
  const [source,setSource] = useState('')
  const [claims,setClaims] = useState('0')
  const [differentiation,setDifferentiation] = useState(3)
  const [switchingCost,setSwitchingCost] = useState(3)
  const [distribution,setDistribution] = useState(3)
  const [evidence,setEvidence] = useState(1)
  const [rows,setRows] = useState<Array<{feature:string;candidate:string;priorArt:string;source:string;claims:number;at:string}>>([])
  const moat = Math.round((differentiation*0.3+switchingCost*0.25+distribution*0.2+evidence*0.25)*10)
  return <section className="workspace frontier-feature" id="b22-competitive-novelty">
    <div className={panel}><SectionTitle title="B22 · FEATURE NOVELTY BENCHMARK" tag="COMPARATIVE MATRIX"/>
      <label>Feature / capability being compared<input value={feature} onChange={e=>setFeature(e.target.value)} required maxLength={180}/></label><label>Candidate implementation or differentiator<textarea value={candidate} onChange={e=>setCandidate(e.target.value)} rows={3} maxLength={3000}/></label><label>Comparable prior art / competitor<input value={priorArt} onChange={e=>setPriorArt(e.target.value)} required maxLength={180}/></label><label>Public citation URL<input type="url" value={source} onChange={e=>setSource(e.target.value)} placeholder="https://..."/></label><label>Claims supported by this citation<input type="number" min="0" max="100" value={claims} onChange={e=>setClaims(e.target.value)}/></label>
      <button className="primary-button" type="button" disabled={!feature.trim()||!priorArt.trim()} onClick={()=>{setRows(r=>[{feature,candidate,priorArt,source,claims:Number(claims),at:new Date().toISOString()},...r]);setFeature('');setCandidate('');setPriorArt('');setSource('');setClaims('0')}}>Add comparison & citation ledger entry</button>
    </div>
    <div className={panel}><SectionTitle title="Competitive comparison & prior-art ledger" tag="EVIDENCE LINKED"/>
      <table><thead><tr><th>Feature</th><th>Candidate</th><th>Prior art / competitor</th><th>Citation</th><th>Claims</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.at+i}><td>{r.feature}</td><td>{r.candidate||'Not described'}</td><td>{r.priorArt}</td><td>{r.source?<a href={r.source} target="_blank" rel="noreferrer">Open source</a>:'No citation supplied'}</td><td>{r.claims}</td></tr>)}</tbody></table>
      {!rows.length&&<p>No comparative evidence entered. Novelty is unassessed, not presumed.</p>}
    </div>
    <div className={panel}><SectionTitle title="Competitive moat scorecard" tag={moat>=75?'STRONG DRAFT':moat>=50?'MODERATE DRAFT':'WEAK / UNPROVEN'}/>
      {([['Differentiation',differentiation,setDifferentiation],['Switching cost / retention',switchingCost,setSwitchingCost],['Distribution advantage',distribution,setDistribution],['Evidence quality',evidence,setEvidence]] as const).map(([label,value,setter])=><label key={label}>{label}: {value}/5<input type="range" min="0" max="5" value={value} onChange={e=>setter(Number(e.target.value))}/></label>)}
      <div className="decision-line"><span>WEIGHTED OPERATOR SCORE</span><strong>{moat}/100</strong></div><p>Heuristic self-assessment only. A high score is not proof of legal novelty, patentability, freedom to operate, defensibility or market success.</p>
      <button className="secondary-button" type="button" onClick={()=>downloadJson('nexus-competitive-validation.json',{comparisons:rows,moatScore:moat,weights:{differentiation:.3,switchingCost:.25,distribution:.2,evidence:.25},exportedAt:new Date().toISOString()})}>Export competitive validation dossier</button>
    </div>
  </section>
}

export function ScientificSignificancePanel() {
  const [label, setLabel] = useState('Candidate minus baseline')
  const [raw, setRaw] = useState('1, 2, -1, 3, 2')
  const values = raw.split(',').map(x=>x.trim()).filter(Boolean).map(Number)
  const valid = values.length >= 2 && values.every(Number.isFinite)
  const mean = valid ? values.reduce((a,b)=>a+b,0)/values.length : 0
  const variance = valid ? values.reduce((s,x)=>s+(x-mean)**2,0)/(values.length-1) : 0
  const standardError = valid ? Math.sqrt(variance/values.length) : 0
  const statistic = standardError > 0 ? mean/standardError : null
  const approximate = statistic === null ? 'INCONCLUSIVE' : Math.abs(statistic) >= 1.96 ? 'SCREENING THRESHOLD MET' : 'THRESHOLD NOT MET'
  return <section className="workspace frontier-feature" id="b23-significance-screen">
    <div className={panel}><SectionTitle title="B23 · EMPIRICAL DATA & SIGNIFICANCE INDICATOR" tag={approximate}/>
      <label>Measurement series label<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={160}/></label>
      <label>Comma-separated paired differences<textarea rows={3} value={raw} onChange={e=>setRaw(e.target.value)} placeholder="candidate minus baseline values"/></label>
      <div className="stats-strip compact"><div><strong>{valid?values.length:'—'}</strong><span>Observations</span></div><div><strong>{valid?mean.toFixed(4):'—'}</strong><span>Mean difference</span></div><div><strong>{valid?standardError.toFixed(4):'—'}</strong><span>Standard error</span></div><div><strong>{statistic===null?'—':statistic.toFixed(3)}</strong><span>t statistic</span></div></div>
      {valid?<><table><thead><tr><th>Observation</th><th>{label}</th></tr></thead><tbody>{values.map((value,index)=><tr key={index}><td>{index+1}</td><td>{value}</td></tr>)}</tbody></table><p>Approximate two-sided screening uses |t| ≥ 1.96. It is not an exact Student-t p-value, does not correct for multiple comparisons, and does not establish causality or independent replication.</p></>:<p role="alert">Enter at least two finite numeric observations to calculate the screening indicator.</p>}
      <button className="secondary-button" type="button" disabled={!valid} onClick={()=>downloadJson('nexus-scientific-significance-screen.json',{label,observations:values,n:values.length,mean,variance,standardError,tStatistic:statistic,screening:approximate,method:'approximate absolute t-statistic threshold 1.96; not a formal p-value',exportedAt:new Date().toISOString()})}>Export data and calculation record</button>
    </div>
  </section>
}

export function GeneralityContainmentWorkbench() {
  const [domains,setDomains] = useState([{domain:'Coding',baseline:'',candidate:''},{domain:'Planning',baseline:'',candidate:''},{domain:'Scientific reasoning',baseline:'',candidate:''},{domain:'Unfamiliar task',baseline:'',candidate:''}])
  const [oodTask,setOodTask] = useState('Solve a novel task with incomplete instructions; state assumptions and uncertainty.')
  const [oodResult,setOodResult] = useState('')
  const [bounds,setBounds] = useState({maxIterations:3,allowNetwork:false,allowWrites:false,requireApproval:true,rollback:true})
  const [alignment,setAlignment] = useState({humanApproval:true,refusalBoundary:true,uncertainty:true,noExternalSideEffects:true})
  const [trial,setTrial] = useState<Array<{domain:string;baseline:number;candidate:number}>>([])
  const summary = useMemo(()=>({n:trial.length,mean:trial.length?trial.reduce((s,x)=>s+x.candidate-x.baseline,0)/trial.length:0,aligned:Object.values(alignment).every(Boolean),contained:bounds.maxIterations<=3&&!bounds.allowNetwork&&!bounds.allowWrites&&bounds.requireApproval&&bounds.rollback}),[trial,alignment,bounds])
  return <section className="workspace frontier-feature" id="b24-generality-containment">
    <div className={panel}><SectionTitle title="B24 · MULTI-DOMAIN TRANSFER MATRIX" tag="OPERATOR-SUPPLIED SCORES"/>
      <p>Enter comparable baseline and candidate scores for each task domain. The matrix calculates observed deltas; it does not run or validate a model independently.</p>
      <table><thead><tr><th>Domain</th><th>Baseline score</th><th>Candidate score</th><th>Delta</th></tr></thead><tbody>{domains.map((d,i)=><tr key={d.domain}><td>{d.domain}</td><td><input aria-label={d.domain+' baseline'} type="number" step="any" value={d.baseline} onChange={e=>setDomains(rows=>rows.map((r,j)=>j===i?{...r,baseline:e.target.value}:r))}/></td><td><input aria-label={d.domain+' candidate'} type="number" step="any" value={d.candidate} onChange={e=>setDomains(rows=>rows.map((r,j)=>j===i?{...r,candidate:e.target.value}:r))}/></td><td>{d.baseline!==''&&d.candidate!==''?(Number(d.candidate)-Number(d.baseline)).toFixed(3):'—'}</td></tr>)}</tbody></table>
      <button className="secondary-button" type="button" onClick={()=>setTrial(rows=>[...rows,...domains.filter(d=>d.baseline!==''&&d.candidate!=='').map(d=>({domain:d.domain,baseline:Number(d.baseline),candidate:Number(d.candidate)}))])}>Record entered evaluation snapshot</button>
      <p>Recorded rows: {summary.n} · mean candidate-minus-baseline delta: {summary.n?summary.mean.toFixed(3):'unavailable'}. These are supplied values, not independent generality evidence.</p>
    </div>
    <div className={panel}><SectionTitle title="Out-of-distribution task runner" tag="NO MODEL EXECUTION"/>
      <label>Novel task prompt<textarea rows={4} value={oodTask} onChange={e=>setOodTask(e.target.value)} maxLength={5000}/></label><button className="primary-button" type="button" onClick={()=>setOodResult('Task package prepared for external, human-approved evaluation. No model was called and no result has been inferred. Prompt SHA-256 is not calculated in this view.')}>Prepare OOD evaluation package</button>
      {oodResult&&<p role="status">{oodResult}</p>}
    </div>
    <div className={panel}><SectionTitle title="Recursive self-improvement containment" tag={summary.contained?'WITHIN DECLARED BOUNDS':'BOUNDARY REVIEW REQUIRED'}/>
      <label>Maximum self-improvement iterations: {bounds.maxIterations}<input type="range" min="0" max="10" value={bounds.maxIterations} onChange={e=>setBounds(b=>({...b,maxIterations:Number(e.target.value)}))}/></label>
      {([['allowNetwork','Network egress permitted'],['allowWrites','External writes permitted'],['requireApproval','Human approval required per iteration'],['rollback','Rollback path required']] as const).map(([k,label])=><label className="decision-line" key={k}><span>{label}</span><input type="checkbox" checked={bounds[k]} onChange={e=>setBounds(b=>({...b,[k]:e.target.checked}))}/></label>)}
      <p>Containment review is {summary.contained?'within the declared conservative UI bounds':'outside the declared conservative UI bounds'}. This is a planning guardrail only; it does not sandbox a model or prevent external actions by itself.</p>
    </div>
    <div className={panel}><SectionTitle title="Alignment constraint verifier" tag={summary.aligned?'ALL DECLARED CHECKS ON':'CONSTRAINT GAP'}/>
      {([['humanApproval','Human approval before consequential action'],['refusalBoundary','Policy refusal boundary documented'],['uncertainty','Uncertainty and limitations disclosed'],['noExternalSideEffects','No unapproved external side effects']] as const).map(([k,label])=><label className="decision-line" key={k}><span>{label}</span><input type="checkbox" checked={alignment[k]} onChange={e=>setAlignment(a=>({...a,[k]:e.target.checked}))}/></label>)}
      <p>Verifier outcome: {summary.aligned?'All four declared review constraints are checked':'One or more declared review constraints are unchecked'}. This is not a certification of alignment or superintelligence safety.</p>
      <button className="secondary-button" type="button" onClick={()=>downloadJson('nexus-generality-containment-dossier.json',{domains,trial,oodTask,oodResult,bounds,alignment,summary,exportedAt:new Date().toISOString(),limitations:'Operator-supplied scores and local review state; no model run or external containment enforcement.'})}>Export reproducible review dossier</button>
    </div>
  </section>
}
