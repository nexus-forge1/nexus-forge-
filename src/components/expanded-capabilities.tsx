import { useMemo, useState } from 'react'

const card = 'glass-card research-card'
function saveJson(name:string,data:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
  const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)
}
function Heading({title,status}:{title:string;status:string}) {
  return <div className="panel-title"><span>{title}</span><span className="live-pill">{status}</span></div>
}

export function ComparativeValidationWorkbench() {
  const [criteria,setCriteria]=useState([{name:'Task correctness',weight:40},{name:'Latency',weight:20},{name:'Cost efficiency',weight:20},{name:'Safety / constraint compliance',weight:20}])
  const [candidates,setCandidates]=useState([{name:'Candidate A',scores:[4,4,3,5]},{name:'Candidate B',scores:[5,3,4,4]},{name:'Candidate C',scores:[3,5,5,3]}])
  const [decision,setDecision]=useState('review')
  const [rationale,setRationale]=useState('')
  const totals=criteria.reduce((s,c)=>s+c.weight,0)
  const ranked=useMemo(()=>candidates.map(c=>({...c,score:totals>0?c.scores.reduce((s,v,i)=>s+v*(criteria[i]?.weight??0),0)/totals:0})).sort((a,b)=>b.score-a.score),[candidates,criteria,totals])
  const pairwise=candidates.map(c=>({name:c.name,wins:candidates.filter(o=>o.name!==c.name&&c.scores.reduce((s,v,i)=>s+(v-o.scores[i])*(criteria[i]?.weight??0),0)>0).length,losses:candidates.filter(o=>o.name!==c.name&&c.scores.reduce((s,v,i)=>s+(v-o.scores[i])*(criteria[i]?.weight??0),0)<0).length}))
  return <section className="workspace frontier-feature" id="c1-comparative-validation">
    <div className={card}><Heading title="C1 · MULTI-CANDIDATE BENCHMARK" status="OPERATOR-SCORED"/>
      <p>Scores are entered by the operator on a 1–5 scale. Adjust criterion weights, then compare the weighted ranking and pairwise win/loss profile.</p>
      <table><thead><tr><th>Candidate</th>{criteria.map(c=><th key={c.name}>{c.name}</th>)}<th>Weighted score</th></tr></thead><tbody>{ranked.map(c=><tr key={c.name}><td>{c.name}</td>{c.scores.map((v,i)=><td key={i}><select aria-label={c.name+' '+criteria[i].name} value={v} onChange={e=>setCandidates(rows=>rows.map(r=>r.name===c.name?{...r,scores:r.scores.map((x,j)=>i===j?Number(e.target.value):x)}:r))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></td>)}<td>{c.score.toFixed(2)}/5</td></tr>)}</tbody></table>
      <h3>Criterion weights</h3>{criteria.map((c,i)=><label key={c.name}>{c.name}: {c.weight}%<input type="range" min="0" max="100" value={c.weight} onChange={e=>setCriteria(rows=>rows.map((r,j)=>i===j?{...r,weight:Number(e.target.value)}:r))}/></label>)}
      <p className={totals===100?'muted-copy':'warning'}>Weight total: {totals}%. {totals===100?'Weights are normalized to 100%.':'Scores are normalized against the current total; set weights to 100% for the intended comparison.'}</p>
    </div>
    <div className={card}><Heading title="Pairwise win / loss visualizer" status="COMPARATIVE"/>
      {pairwise.map(p=><div className="decision-line" key={p.name}><span>{p.name}<br/>{p.wins} wins · {p.losses} losses</span><div style={{minWidth:140,flex:1}}><div style={{display:'flex',height:12,borderRadius:6,overflow:'hidden'}}><div style={{width:(p.wins/Math.max(1,candidates.length-1)*100)+'%',background:'var(--chart-2, #55b99a)'}}/><div style={{width:(p.losses/Math.max(1,candidates.length-1)*100)+'%',background:'var(--destructive, #d96d72)'}}/></div></div></div>)}
      <div className="decision-line"><span>LEADING CANDIDATE</span><strong>{ranked[0]?.name??'No candidate'}</strong></div>
    </div>
    <div className={card}><Heading title="Validation decision & export" status={decision.toUpperCase()}/>
      <label>Decision<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="review">Needs further review</option><option value="accept">Accept for next-stage evaluation</option><option value="reject">Reject candidates as currently scored</option><option value="inconclusive">Inconclusive</option></select></label>
      <label>Decision rationale<textarea rows={3} value={rationale} onChange={e=>setRationale(e.target.value)} maxLength={3000}/></label>
      <button className="primary-button" type="button" onClick={()=>saveJson('nexus-comparative-validation.json',{criteria,weightTotal:totals,candidates:ranked.map(({name,scores,score})=>({name,scores,weightedScore:score})),pairwise,decision,leadingCandidate:ranked[0]?.name??null,rationale,exportedAt:new Date().toISOString(),evidenceNote:'Operator-entered scores; independently verified benchmarks were not inferred.'})}>Export validation decision dossier</button>
    </div>
  </section>
}

export function TeamGovernanceControls() {
  const [policy,setPolicy]=useState({approvalRequired:true,highRiskTwoApprovers:true,auditorReadOnly:true,restrictedWrites:true})
  const [matrix,setMatrix]=useState({admin:{read:true,write:true,approve:true,audit:true},operator:{read:true,write:true,approve:false,audit:false},auditor:{read:true,write:false,approve:false,audit:true}})
  const [task,setTask]=useState('');const [assignee,setAssignee]=useState('');const [operator,setOperator]=useState('')
  const [tasks,setTasks]=useState<Array<{task:string;assignee:string;assignedBy:string;at:string;status:string}>>([])
  const [approvals,setApprovals]=useState<Array<{change:string;approvers:string[];required:number;at:string}>>([])
  const [change,setChange]=useState('');const [approver,setApprover]=useState('');const [required,setRequired]=useState('2')
  const [permissionReview,setPermissionReview]=useState('pending')
  const activeRoles=Object.entries(matrix).filter(([,v])=>Object.values(v).some(Boolean)).length
  return <section className="workspace frontier-feature" id="c2-team-governance">
    <div className={card}><Heading title="C2 · TEAM APPROVAL POLICY GATES" status={policy.approvalRequired?'APPROVAL REQUIRED':'POLICY DRAFT'}/>
      {([['approvalRequired','Require approval before governed changes'],['highRiskTwoApprovers','Require two approvers for high-risk changes'],['auditorReadOnly','Auditor role remains read-only'],['restrictedWrites','Restrict sensitive writes to approved operators']] as const).map(([k,label])=><label className="decision-line" key={k}><span>{label}</span><input type="checkbox" checked={policy[k]} onChange={e=>setPolicy(p=>({...p,[k]:e.target.checked}))}/></label>)}
      <h3>Permission matrix</h3><table><thead><tr><th>Role</th><th>Read</th><th>Write</th><th>Approve</th><th>Audit</th></tr></thead><tbody>{(Object.keys(matrix) as Array<keyof typeof matrix>).map(role=><tr key={role}><td>{role.toUpperCase()}</td>{(['read','write','approve','audit'] as const).map(permission=><td key={permission}><input type="checkbox" aria-label={role+' '+permission} checked={matrix[role][permission]} onChange={e=>setMatrix(m=>({...m,[role]:{...m[role],[permission]:e.target.checked}}))}/></td>)}</tr>)}</tbody></table>
      <label>Permission review state<select value={permissionReview} onChange={e=>setPermissionReview(e.target.value)}><option value="pending">Pending review</option><option value="approved">Approved by authorized reviewer</option><option value="denied">Denied</option><option value="expired">Expired / re-review required</option></select></label>
      <p className="muted-copy">Client review only: editing this matrix does not grant or revoke server permissions. Approval state is a draft until persisted by authorized governance services.</p>
    </div>
    <div className={card}><Heading title="Cross-operator task assignment" status={tasks.length+' ASSIGNMENTS'}/>
      <form onSubmit={e=>{e.preventDefault();if(!task.trim()||!assignee.trim()||!operator.trim())return;setTasks(rows=>[{task:task.trim(),assignee:assignee.trim(),assignedBy:operator.trim(),at:new Date().toISOString(),status:'assigned'},...rows]);setTask('');setAssignee('')}}>
        <label>Task / work item<input required value={task} onChange={e=>setTask(e.target.value)} maxLength={300}/></label><div className="field-grid"><label>Assigned operator<input required value={assignee} onChange={e=>setAssignee(e.target.value)} maxLength={254}/></label><label>Assigning operator<input required value={operator} onChange={e=>setOperator(e.target.value)} maxLength={254}/></label></div><button className="primary-button">Record assignment</button>
      </form>
      {tasks.map(t=><div className="decision-line" key={t.at}><span>{t.assignee}<br/>by {t.assignedBy}</span><strong>{t.task} · {t.status.toUpperCase()}</strong></div>)}
    </div>
    <div className={card}><Heading title="Multi-signature / consensus quorum" status="QUORUM VERIFIER"/>
      <label>Change requiring consensus<input value={change} onChange={e=>setChange(e.target.value)} maxLength={300}/></label><label>Distinct approver identity<input value={approver} onChange={e=>setApprover(e.target.value)} maxLength={254}/></label><label>Required unique approvals<input type="number" min="1" max="10" value={required} onChange={e=>setRequired(e.target.value)}/></label>
      <button className="secondary-button" type="button" disabled={!change.trim()||!approver.trim()} onClick={()=>{setApprovals(rows=>{const old=rows.find(r=>r.change===change.trim());if(old){if(old.approvers.includes(approver.trim()))return rows;return rows.map(r=>r===old?{...r,approvers:[...r.approvers,approver.trim()]}:r)}return [{change:change.trim(),approvers:[approver.trim()],required:Number(required),at:new Date().toISOString()},...rows]})}}>Record distinct approval</button>
      {approvals.map(a=><div className="decision-line" key={a.at}><span>{a.change}<br/>{a.approvers.length}/{a.required} distinct approvals</span><strong>{a.approvers.length>=a.required?'QUORUM MET':'QUORUM NOT MET'}</strong></div>)}
      <button className="secondary-button" type="button" onClick={()=>saveJson('nexus-team-governance-review.json',{policy,matrix,permissionReview,tasks,approvals,exportedAt:new Date().toISOString(),authority:'client-side review only'})}>Export governance review</button>
    </div>
  </section>
}

export function DeveloperCredentialLifecycle() {
  const [credentials,setCredentials]=useState<Array<{id:string;label:string;scopes:string[];status:string;createdAt:string;expiresAt:string}>>([])
  const [label,setLabel]=useState('');const [scopes,setScopes]=useState(['missions:read']);const [lifetime,setLifetime]=useState('30')
  const [event,setEvent]=useState('mission.completed');const [payload,setPayload]=useState('{"missionId":"example","status":"completed"}')
  const [endpoint,setEndpoint]=useState('');const [registered,setRegistered]=useState<Array<{endpoint:string;events:string[];at:string}>>([])
  const [simulation,setSimulation]=useState<{event:string;payload:unknown;at:string;valid:boolean}|null>(null)
  const [selected,setSelected]=useState('')
  const available=['missions:read','artifacts:read','events:subscribe']
  const events=['mission.created','mission.completed','artifact.created','artifact.verified','release.approved','incident.opened']
  function flip(value:string){setScopes(s=>s.includes(value)?s.filter(x=>x!==value):[...s,value])}
  function create(){if(!label.trim()||scopes.length===0)return;const now=Date.now();setCredentials(rows=>[{id:crypto.randomUUID(),label:label.trim(),scopes,status:'active-draft',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+Number(lifetime)*86400000).toISOString()},...rows]);setLabel('')}
  return <section className="workspace frontier-feature" id="c3-developer-integrations">
    <div className={card}><Heading title="C3 · API CREDENTIAL LIFECYCLE" status="DRAFT REGISTRY"/>
      <label>Credential label<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={120}/></label><label>Lifetime (days)<select value={lifetime} onChange={e=>setLifetime(e.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
      {available.map(s=><label className="decision-line" key={s}><span>{s}</span><input type="checkbox" checked={scopes.includes(s)} onChange={()=>flip(s)}/></label>)}
      <button className="primary-button" type="button" disabled={!label.trim()||!scopes.length} onClick={create}>Create credential lifecycle record</button>
      <p>These are lifecycle records only. No credential secret is issued or accepted by the API until a server-side issuance and revocation service is connected.</p>
      {credentials.map(c=><div className="decision-line" key={c.id}><span>{c.label}<br/>{c.scopes.join(', ')}<br/>Expires {new Date(c.expiresAt).toLocaleDateString()}</span><strong>{c.status.toUpperCase()}</strong><button className="secondary-button" type="button" onClick={()=>setCredentials(rows=>rows.map(r=>r.id===c.id?{...r,status:r.status==='revoked'?'active-draft':'revoked'}:r))}>{c.status==='revoked'?'Reopen draft':'Mark revoked'}</button></div>)}
    </div>
    <div className={card}><Heading title="Event trigger simulation & payload inspector" status={simulation?.valid?'VALID JSON':'READY'}/>
      <label>Event type<select value={event} onChange={e=>setEvent(e.target.value)}>{events.map(v=><option key={v}>{v}</option>)}</select></label><label>JSON payload<textarea rows={5} value={payload} onChange={e=>setPayload(e.target.value)}/></label>
      <button className="primary-button" type="button" onClick={()=>{try{setSimulation({event,payload:JSON.parse(payload),at:new Date().toISOString(),valid:true})}catch{setSimulation({event,payload,at:new Date().toISOString(),valid:false})}}}>Validate simulation payload</button>
      {simulation&&<><div className="decision-line"><span>{simulation.event}<br/>{simulation.at}</span><strong>{simulation.valid?'VALID JSON — SIMULATED ONLY':'INVALID JSON — CORRECT PAYLOAD'}</strong></div><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(simulation.payload,null,2)}</pre></>}
      <label>Webhook endpoint (HTTPS)<input type="url" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://example.com/hook"/></label><button className="secondary-button" type="button" disabled={!endpoint.startsWith('https://')} onClick={()=>{setRegistered(rows=>[{endpoint,events:[event],at:new Date().toISOString()},...rows]);setEndpoint('')}}>Register endpoint request</button>
      {registered.map((r,i)=><div className="decision-line" key={r.at+i}><span>{r.endpoint}<br/>{r.events.join(', ')}</span><strong>REQUESTED · NOT DELIVERED</strong></div>)}
      <button className="secondary-button" type="button" onClick={()=>saveJson('nexus-developer-integration-review.json',{credentials,simulation,registered,exportedAt:new Date().toISOString()})}>Export integration review</button>
    </div>
  </section>
}

export function CapabilityReliabilityControls() {
  const [stress,setStress]=useState({concurrency:10,duration:30,profile:'balanced'})
  const [run,setRun]=useState<{id:string;startedAt:string;state:string;concurrency:number;duration:number;profile:string}|null>(null)
  const [fallback,setFallback]=useState('degraded-readonly')
  const [sla,setSla]=useState({latencyMs:1500,errorPercent:2,mttrMinutes:30})
  const [breach,setBreach]=useState(false)
  const [recoveries,setRecoveries]=useState<Array<{incident:string;detectedAt:string;recoveredAt:string;mttr:number}>>([])
  function start(){setRun({id:crypto.randomUUID(),startedAt:new Date().toISOString(),state:'simulated-running',...stress})}
  function finish(){if(!run)return;setRun(r=>r?{...r,state:'simulated-complete'}:r);setBreach(stress.concurrency>50||sla.latencyMs>1000||sla.errorPercent>2)}
  return <section className="workspace frontier-feature" id="c4-capability-reliability">
    <div className={card}><Heading title="C4 · STRESS TEST EXECUTION VISUALIZER" status={run?.state?.toUpperCase()??'IDLE'}/>
      <p>Simulated load only; no production traffic is generated by these controls.</p>
      <div className="field-grid"><label>Concurrency: {stress.concurrency}<input type="range" min="1" max="100" value={stress.concurrency} onChange={e=>setStress(s=>({...s,concurrency:Number(e.target.value)}))}/></label><label>Duration (seconds): {stress.duration}<input type="range" min="5" max="120" value={stress.duration} onChange={e=>setStress(s=>({...s,duration:Number(e.target.value)}))}/></label></div>
      <label>Load profile<select value={stress.profile} onChange={e=>setStress(s=>({...s,profile:e.target.value}))}><option value="balanced">Balanced</option><option value="burst">Burst</option><option value="read-heavy">Read-heavy</option></select></label>
      <button className="primary-button" type="button" disabled={run?.state==='simulated-running'} onClick={start}>Start simulated stress run</button><button className="secondary-button" type="button" disabled={!run||run.state!=='simulated-running'} onClick={finish}>Complete simulation</button>
      {run&&<div className="decision-line"><span>{run.id}<br/>{run.startedAt}</span><strong>{run.state} · {run.concurrency} concurrent · {run.duration}s</strong></div>}
    </div>
    <div className={card}><Heading title="Degraded capability fallback" status="SIMULATOR"/>
      <label>Fallback mode<select value={fallback} onChange={e=>setFallback(e.target.value)}><option value="degraded-readonly">Read-only degraded mode</option><option value="cached-results">Serve cached results</option><option value="secondary-provider">Route to configured secondary provider</option><option value="disable-capability">Disable affected capability</option></select></label>
      <p>Selected fallback: <strong>{fallback}</strong>. This simulates the intended decision only; no provider route or live capability is changed.</p>
    </div>
    <div className={card}><Heading title="SLA breach alert & MTTR telemetry" status={breach?'BREACH INDICATOR':'WITHIN DECLARED THRESHOLDS'}/>
      <div className="field-grid"><label>Observed latency (ms)<input type="number" min="0" value={sla.latencyMs} onChange={e=>setSla(s=>({...s,latencyMs:Number(e.target.value)}))}/></label><label>Error rate (%)<input type="number" min="0" max="100" step=".1" value={sla.errorPercent} onChange={e=>setSla(s=>({...s,errorPercent:Number(e.target.value)}))}/></label><label>MTTR target (minutes)<input type="number" min="1" value={sla.mttrMinutes} onChange={e=>setSla(s=>({...s,mttrMinutes:Number(e.target.value)}))}/></label></div>
      <button className="secondary-button" type="button" onClick={()=>setBreach(sla.latencyMs>1500||sla.errorPercent>2)}>Evaluate SLA thresholds</button>
      <div className="stats-strip compact"><div><strong>{sla.latencyMs} ms</strong><span>Latency</span></div><div><strong>{sla.errorPercent}%</strong><span>Error rate</span></div><div><strong>{sla.mttrMinutes} min</strong><span>MTTR target</span></div></div>
      <label>Recovery incident reference<input id="c4-recovery-ref" placeholder="Incident ID or evidence reference"/></label><button className="secondary-button" type="button" onClick={()=>{const ref=(document.getElementById('c4-recovery-ref') as HTMLInputElement|null)?.value.trim();if(ref){const now=new Date().toISOString();setRecoveries(rows=>[{incident:ref,detectedAt:now,recoveredAt:now,mttr:0},...rows])}}}>Record recovery marker</button>
      {recoveries.map((r,i)=><div className="decision-line" key={r.incident+i}><span>{r.incident}<br/>{r.detectedAt}</span><strong>Operator marker · measured MTTR unavailable</strong></div>)}
      <button className="secondary-button" type="button" onClick={()=>saveJson('nexus-capability-reliability.json',{run,fallback,sla,breach,recoveries,exportedAt:new Date().toISOString(),source:'local simulation and operator inputs; not production telemetry'})}>Export reliability snapshot</button>
    </div>
  </section>
}

export function SecurityPostureControls() {
  const [rotation,setRotation]=useState<Array<{credential:string;reason:string;at:string;status:string}>>([])
  const [credential,setCredential]=useState('');const [reason,setReason]=useState('scheduled-rotation')
  const [lockdown,setLockdown]=useState({failedAuth:true,suspiciousEgress:true,criticalIncident:false,manualOverride:false})
  const [zones,setZones]=useState([{name:'Public ingress',state:'monitored'},{name:'Application runtime',state:'isolated'},{name:'Data access',state:'restricted'},{name:'External egress',state:'blocked'}])
  const score=Math.round((Object.values(lockdown).filter(Boolean).length/4*30)+(zones.filter(z=>z.state==='isolated'||z.state==='restricted'||z.state==='blocked').length/4*40)+(rotation.length>0?15:0)+15)
  return <section className="workspace frontier-feature" id="c5-security-resilience">
    <div className={card}><Heading title="C5 · CREDENTIAL ROTATION AUDIT" status="OPERATOR LEDGER"/>
      <label>Credential label (never enter the secret)<input value={credential} onChange={e=>setCredential(e.target.value)} maxLength={160}/></label><label>Rotation reason<select value={reason} onChange={e=>setReason(e.target.value)}><option value="scheduled-rotation">Scheduled rotation</option><option value="suspected-exposure">Suspected exposure</option><option value="operator-offboarding">Operator offboarding</option><option value="policy-change">Policy change</option></select></label>
      <button className="primary-button" type="button" disabled={!credential.trim()} onClick={()=>{setRotation(rows=>[{credential:credential.trim(),reason,at:new Date().toISOString(),status:'rotation-request-recorded'},...rows]);setCredential('')}}>Record credential rotation review</button>
      {rotation.map((r,i)=><div className="decision-line" key={r.at+i}><span>{r.credential}<br/>{r.reason} · {r.at}</span><strong>{r.status}</strong></div>)}
    </div>
    <div className={card}><Heading title="Automated lockdown triggers" status={Object.values(lockdown).filter(Boolean).length+' ENABLED'}/>
      {([['failedAuth','Repeated authentication failures'],['suspiciousEgress','Suspicious outbound egress'],['criticalIncident','Critical security incident'],['manualOverride','Manual emergency lockdown']] as const).map(([k,label])=><label className="decision-line" key={k}><span>{label}</span><input type="checkbox" checked={lockdown[k]} onChange={e=>setLockdown(s=>({...s,[k]:e.target.checked}))}/></label>)}
      <p>Triggers define a review policy draft only; no runtime or network lock is applied from this view.</p>
    </div>
    <div className={card}><Heading title="Isolation zone status" status="DECLARED VIEW"/>
      {zones.map((z,i)=><div className="decision-line" key={z.name}><span>{z.name}</span><select value={z.state} onChange={e=>setZones(rows=>rows.map((r,j)=>i===j?{...r,state:e.target.value}:r))}><option value="monitored">Monitored</option><option value="isolated">Isolated (declared)</option><option value="restricted">Restricted (declared)</option><option value="blocked">Blocked (declared)</option><option value="unknown">Unknown</option></select></div>)}
      <div className="decision-line"><span>POSTURE REVIEW SCORE</span><strong>{score}/100 · operator-assessed</strong></div>
      <button className="secondary-button" type="button" onClick={()=>saveJson('nexus-security-posture-review.json',{rotation,lockdown,zones,score,exportedAt:new Date().toISOString(),enforcement:'not connected to runtime or network controls'})}>Export posture review</button>
    </div>
  </section>
}

export function GeneralizationResearchVisuals() {
  const [rows,setRows]=useState([{domain:'Coding',zeroShot:0.72,adaptation:12,failures:2},{domain:'Planning',zeroShot:0.65,adaptation:18,failures:3},{domain:'Scientific reasoning',zeroShot:0.58,adaptation:24,failures:4},{domain:'Unfamiliar domain',zeroShot:0.3,adaptation:40,failures:7}])
  const [trace,setTrace]=useState('');const [selected,setSelected]=useState('Coding')
  const [note,setNote]=useState('');const [traceNotes,setTraceNotes]=useState<Array<{domain:string;trace:string;note:string;at:string}>>([])
  const [limit,setLimit]=useState(0.5)
  const chartMax=Math.max(1,...rows.map(r=>r.adaptation))
  return <section className="workspace frontier-feature" id="c6-generality-research">
    <div className={card}><Heading title="C6 · ZERO-SHOT TASK DISTRIBUTION" status="OPERATOR-ENTERED DATA"/>
      <p>Scores are supplied for evaluation planning and visualization. This chart does not imply that a model was run or independently benchmarked.</p>
      {rows.map((r,i)=><div className="decision-line" key={r.domain}><span>{r.domain}<br/>Zero-shot score {r.zeroShot.toFixed(2)}</span><div style={{flex:1,minWidth:100,height:12,borderRadius:6,background:'var(--muted, #d1d5db)',overflow:'hidden'}}><div style={{width:(r.zeroShot*100)+'%',height:'100%',background:'var(--chart-1, #6a88db)'}}/></div><input aria-label={r.domain+' zero-shot score'} type="number" min="0" max="1" step=".01" value={r.zeroShot} onChange={e=>setRows(all=>all.map((x,j)=>i===j?{...x,zeroShot:Math.max(0,Math.min(1,Number(e.target.value)))}:x))}/></div>)}
    </div>
    <div className={card}><Heading title="Cross-domain adaptation speed curve" status="SECONDS TO TARGET"/>
      <div style={{display:'flex',alignItems:'end',gap:12,minHeight:140}}>{rows.map(r=><div key={r.domain} style={{flex:1,textAlign:'center'}}><div style={{height:Math.max(8,r.adaptation/chartMax*100),background:'var(--chart-2, #55b99a)',borderRadius:'5px 5px 0 0'}}/><strong>{r.adaptation}s</strong><small style={{display:'block'}}>{r.domain}</small><input aria-label={r.domain+' adaptation seconds'} type="number" min="0" value={r.adaptation} onChange={e=>setRows(all=>all.map(x=>x.domain===r.domain?{...x,adaptation:Math.max(0,Number(e.target.value))}:x))}/></div>)}</div>
    </div>
    <div className={card}><Heading title="Reasoning trace inspection" status="OPERATOR-ANNOTATED"/>
      <label>Domain<select value={selected} onChange={e=>setSelected(e.target.value)}>{rows.map(r=><option key={r.domain}>{r.domain}</option>)}</select></label><label>Trace / step evidence<textarea rows={5} value={trace} onChange={e=>setTrace(e.target.value)} maxLength={8000}/></label><label>Reviewer annotation<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/></label>
      <button className="primary-button" type="button" disabled={!trace.trim()} onClick={()=>{setTraceNotes(n=>[{domain:selected,trace,note,at:new Date().toISOString()},...n]);setTrace('');setNote('')}}>Save trace annotation</button>
      {traceNotes.map((t,i)=><details key={t.at+i}><summary>{t.domain} · {t.at}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{t.trace}</pre><p>{t.note}</p></details>)}
    </div>
    <div className={card}><Heading title="Generalization boundary failure map" status="FAILURE THRESHOLD"/>
      <label>Minimum acceptable zero-shot score: {limit.toFixed(2)}<input type="range" min="0" max="1" step=".05" value={limit} onChange={e=>setLimit(Number(e.target.value))}/></label>
      {rows.map(r=><div className="decision-line" key={r.domain}><span>{r.domain}<br/>Failures recorded: {r.failures}</span><strong>{r.zeroShot<limit?'BOUNDARY FAILURE / INVESTIGATE':'ABOVE DECLARED THRESHOLD'}</strong></div>)}
      <p>Boundary flags are based on entered scores and failure counts, not independent model evaluation.</p>
      <button className="secondary-button" type="button" onClick={()=>saveJson('nexus-generalization-boundaries.json',{rows,limit,traceNotes,exportedAt:new Date().toISOString(),source:'operator-entered evaluation planning data'})}>Export generalization evidence</button>
    </div>
  </section>
}
