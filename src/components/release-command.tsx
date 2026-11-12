import {useState} from 'react'
import {useMutation,useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import {operatorError} from '../lib/operator-error'
import type {Id} from '../../convex/_generated/dataModel'

export function DeploymentPlanner(){
 const rows=useQuery(api.releaseCommand.targetList,{})??[]
 const save=useMutation(api.releaseCommand.targetSave),verify=useMutation(api.releaseCommand.targetVerify)
 const [name,setName]=useState(''),[runtime,setRuntime]=useState(''),[region,setRegion]=useState(''),[capabilities,setCapabilities]=useState(''),[adapter,setAdapter]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Deployment compatibility planner</h2><p>Record each target runtime with its region, capability list and adapter. A target counts as verified only after a verification note is recorded against observed evidence.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await save({name,runtime,region,capabilities:capabilities.split('\n').map(s=>s.trim()).filter(Boolean),adapter});setName('');setRuntime('');setRegion('');setCapabilities('');setAdapter('')}catch(err){setError(operatorError(err,'Target could not be saved.'))}finally{setBusy(false)}}}>
 <label>Target name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>Runtime<input required maxLength={160} value={runtime} onChange={e=>setRuntime(e.target.value)}/></label>
 <label>Region<input required maxLength={160} value={region} onChange={e=>setRegion(e.target.value)}/></label>
 <label>Capabilities (one per line)<textarea required rows={3} maxLength={1600} value={capabilities} onChange={e=>setCapabilities(e.target.value)}/></label>
 <label>Host adapter<input required maxLength={160} value={adapter} onChange={e=>setAdapter(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Save target</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No deployment targets recorded yet.</p></div>:rows.map(t=><article className="glass-card research-card" key={t._id}><p>{t.name} · {t.runtime} · {t.region} · {t.verified}</p><p>Capabilities: {t.capabilities.join(', ')}</p><p>Adapter: {t.adapter}</p>
 {t.verificationNote&&<p>Verification: {t.verificationNote}</p>}
 {t.verified==='pending'&&<NoteAction label="Verification note" button="Record verification" onNote={async note=>verify({id:t._id,note})}/>}</article>)}
 {error&&<p role="alert">{error}</p>}</section>}

export function PreviewFactory(){
 const rows=useQuery(api.releaseCommand.previewList,{})??[]
 const create=useMutation(api.releaseCommand.previewCreate),cleanup=useMutation(api.releaseCommand.previewCleanup)
 const [branch,setBranch]=useState(''),[note,setNote]=useState(''),[days,setDays]=useState('7'),[budget,setBudget]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Preview environment factory</h2><p>Create isolated branch previews with an explicit owner note, bounded expiry (1–30 days) and budget ($0–100). Cleanup requires a receipt note; expiry remains visible until cleanup is recorded.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const d=Number(days),b=Number(budget);if(!Number.isFinite(d)||!Number.isFinite(b))throw new Error('Use numeric days and budget');await create({branch,note,days:Math.round(d),budgetUsd:b});setBranch('');setNote('');setDays('7');setBudget('')}catch(err){setError(operatorError(err,'Preview could not be created.'))}finally{setBusy(false)}}}>
 <label>Branch<input required maxLength={200} value={branch} onChange={e=>setBranch(e.target.value)}/></label>
 <label>Owner note<textarea required rows={2} maxLength={700} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <label>Expiry (days, 1–30)<input required inputMode="numeric" value={days} onChange={e=>setDays(e.target.value)}/></label>
 <label>Budget (USD, 0–100)<input required inputMode="decimal" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Create preview</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No previews recorded yet.</p></div>:rows.map(p=><article className="glass-card research-card" key={p._id}><p>{p.branch} · {p.status} · expires {new Date(p.expiresAt).toISOString().slice(0,10)} · ${p.budgetUsd.toFixed(2)}</p><p>{p.note}</p>
 {p.cleanupNote&&<p>Cleanup receipt: {p.cleanupNote}</p>}
 {p.status==='active'&&<NoteAction label="Cleanup receipt note" button="Record cleanup" onNote={async note=>cleanup({id:p._id,note})}/>}</article>)}
 {error&&<p role="alert">{error}</p>}</section>}

export function EnvironmentManager(){
 const rows=useQuery(api.releaseCommand.manifestList,{})??[]
 const save=useMutation(api.releaseCommand.manifestSave)
 const [name,setName]=useState(''),[entries,setEntries]=useState(''),[rotation,setRotation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const parse=():{key:string;classification:'server'|'browser'|'managed';valueOrReference:string}[]=>entries.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const[key,classification,value]=[...line.split('|').map(s=>s.trim())];return{key,classification:classification==='browser'||classification==='managed'?classification:'server',valueOrReference:value}})
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Environment &amp; secrets manager</h2><p>Version variable manifests with server, browser or managed classification. Managed entries store a managed reference name, never a secret value; all entries are scanned for credential-like values before saving. Saving a change creates a new revision (up to 20 per manifest).</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const parsed=parse();if(parsed.some(p=>!p.key||!p.valueOrReference))throw new Error('Use lines like KEY|server|value-or-reference');await save({name,entries:parsed,rotationNote:rotation||undefined});setEntries('');setRotation('')}catch(err){setError(operatorError(err,'Manifest could not be saved.'))}finally{setBusy(false)}}}>
 <label>Manifest name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>Entries (one per line: KEY|server|value, KEY|browser|value, KEY|managed|reference-name)<textarea required rows={5} maxLength={20000} value={entries} onChange={e=>setEntries(e.target.value)}/></label>
 <label>Rotation note (required when rotating)<textarea rows={2} maxLength={1000} value={rotation} onChange={e=>setRotation(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Save manifest revision</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No environment manifests recorded yet.</p></div>:rows.map(m=><article className="glass-card research-card" key={m._id}><h3>{m.name} · revision {m.revision}</h3>
 {m.entries.map((e,i)=><p key={i}>{e.key} · {e.classification} · {e.classification==='managed'?'reference: '+e.valueOrReference:e.valueOrReference}</p>)}
 {m.rotationNote&&<p>Rotation: {m.rotationNote}</p>}</article>)}
 {error&&<p role="alert">{error}</p>}</section>}

export function ReleasePipeline(){
 const rows=useQuery(api.releaseCommand.releaseList,{})??[]
 const save=useMutation(api.releaseCommand.releaseSave),advance=useMutation(api.releaseCommand.releaseAdvance)
 const [label,setLabel]=useState(''),[commit,setCommit]=useState(''),[environment,setEnvironment]=useState(''),[checks,setChecks]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const exportDossier=(release:typeof rows[number])=>{const dossier={schema:'nexus-forge-production-readiness-dossier-v1',generatedAt:new Date().toISOString(),release:{id:release._id,label:release.label,commitSha:release.commitSha,environment:release.environment,status:release.status,checks:release.checks,approvalNote:release.approvalNote,liveVerificationNote:release.liveVerificationNote,createdAt:release.createdAt},readiness:{checksTotal:release.checks.length,checksPassed:release.checks.filter(check=>check.status==='pass').length,checksFailed:release.checks.filter(check=>check.status!=='pass').length,allChecksPassed:release.checks.length>0&&release.checks.every(check=>check.status==='pass'),approved:release.status==='approved'||release.status==='verified',liveVerificationRecorded:release.status==='verified'},handoff:{paymentActivation:'not part of this release dossier; B17 remains separately gated',operatorMustVerifyCommitAndEnvironment:true}};const url=URL.createObjectURL(new Blob([JSON.stringify(dossier,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='nexus-forge-release-'+release.commitSha.slice(0,7)+'-readiness.json';document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url)}
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Governed release pipeline</h2>
 <div className="stats-strip compact"><div><strong>{rows.length}</strong><span>Retained release records</span></div><div><strong>{rows.filter(row=>row.status==='draft').length}</strong><span>Draft / staging</span></div><div><strong>{rows.filter(row=>row.status==='approved').length}</strong><span>Approved for verification</span></div><div><strong>{rows.filter(row=>row.status==='verified').length}</strong><span>Verified releases</span></div></div>
 <p>Stage each candidate from draft to explicit approval to live verification. The dossier exports only recorded evidence; it does not deploy, publish, or activate billing.</p><p>Bind a release to an exact commit SHA and environment with its recorded checks. Approval requires every check to pass and an explicit note; live verification is recorded only after approval.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const parsed=checks.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const[name,status]=[...line.split('|').map(s=>s.trim())];return{name,status:status==='fail'?'fail' as const:'pass' as const}});if(parsed.some(c=>!c.name))throw new Error('Use lines like build|pass');await save({label,commitSha:commit,environment,checks:parsed});setLabel('');setCommit('');setEnvironment('');setChecks('')}catch(err){setError(operatorError(err,'Release could not be saved.'))}finally{setBusy(false)}}}>
 <label>Release label<input required maxLength={160} value={label} onChange={e=>setLabel(e.target.value)}/></label>
 <label>Exact commit SHA (7–40 hex)<input required value={commit} onChange={e=>setCommit(e.target.value.toLowerCase())}/></label>
 <label>Environment<input required maxLength={160} value={environment} onChange={e=>setEnvironment(e.target.value)}/></label>
 <label>Checks (one per line: name|pass or name|fail)<textarea required rows={4} maxLength={4000} value={checks} onChange={e=>setChecks(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Save release draft</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No releases recorded yet.</p></div>:rows.map(r=><article className="glass-card research-card" key={r._id}><p>{r.label} · {r.status} · {r.commitSha.slice(0,7)} · {r.environment}</p>
 <div className="decision-line"><span>READINESS DOSSIER</span><strong>{r.checks.filter(c=>c.status==='pass').length}/{r.checks.length} checks passed · {r.status==='verified'?'LIVE VERIFICATION RECORDED':r.status==='approved'?'AWAITING LIVE VERIFICATION':r.status==='rejected'?'REJECTED':'STAGING / DRAFT'}</strong></div>
 <button type="button" className="secondary-button" onClick={()=>exportDossier(r)}>Export production-readiness dossier & handoff JSON</button>
 <ul>{r.checks.map((c,i)=><li key={i}>{c.name}: {c.status}</li>)}</ul>
 {r.approvalNote&&<p>Approval: {r.approvalNote}</p>}{r.liveVerificationNote&&<p>Live verification: {r.liveVerificationNote}</p>}
 {r.status==='draft'?<NoteAction label="Decision note" button="Approve (all checks must pass)" alt="Reject" onNote={async(note,action)=>advance({id:r._id,action:action==='reject'?'reject':'approve',note})}/>:r.status==='approved'&&<NoteAction label="Live verification note" button="Record live verification" onNote={async note=>advance({id:r._id,action:'verify',note})}/>}</article>)}
 {error&&<p role="alert">{error}</p>}</section>}

export function RecoveryPlanner(){
 const rows=useQuery(api.releaseCommand.planList,{})??[]
 const save=useMutation(api.releaseCommand.planSave),check=useMutation(api.releaseCommand.planCheck),drill=useMutation(api.releaseCommand.planDrill)
 const [label,setLabel]=useState(''),[sha,setSha]=useState(''),[steps,setSteps]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Rollback &amp; recovery planner</h2><p>Register a known-good version SHA and an explicit recovery plan. Data compatibility must be checked with a note before a drill outcome can be measured against it.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await save({label,knownGoodSha:sha,steps:steps.split('\n').map(s=>s.trim()).filter(Boolean)});setLabel('');setSha('');setSteps('')}catch(err){setError(operatorError(err,'Plan could not be saved.'))}finally{setBusy(false)}}}>
 <label>Plan label<input required maxLength={160} value={label} onChange={e=>setLabel(e.target.value)}/></label>
 <label>Known-good version SHA (7–40 hex)<input required value={sha} onChange={e=>setSha(e.target.value.toLowerCase())}/></label>
 <label>Recovery steps (one per line)<textarea required rows={4} maxLength={8400} value={steps} onChange={e=>setSteps(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Save recovery plan</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No recovery plans recorded yet.</p></div>:rows.map(p=><article className="glass-card research-card" key={p._id}><p>{p.label} · known-good {p.knownGoodSha.slice(0,7)} · compatibility {p.compatibility}</p>
 <ol>{p.steps.map((s,i)=><li key={i}>{s}</li>)}</ol>
 {p.compatibilityNote&&<p>Compatibility: {p.compatibilityNote}</p>}
 {p.lastDrill&&<p>Drill: {p.lastDrill.outcome} · {p.lastDrill.durationMinutes} min · {new Date(p.lastDrill.performedAt).toISOString().slice(0,10)}</p>}
 {p.compatibility==='unknown'?<NoteAction label="Data compatibility note" button="Record compatibility check" onNote={async note=>check({id:p._id,note})}/>:<DrillForm onDrill={async(outcome,minutes)=>drill({id:p._id,outcome,durationMinutes:minutes})}/>}</article>)}
 {error&&<p role="alert">{error}</p>}</section>}
function DrillForm({onDrill}:{onDrill:(outcome:string,durationMinutes:number)=>Promise<unknown>}){
 const [outcome,setOutcome]=useState(''),[minutes,setMinutes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{const m=Number(minutes);if(!Number.isInteger(m))throw new Error('Use whole minutes');await onDrill(outcome,m);setOutcome('');setMinutes('')}catch(err){setError(operatorError(err,'Drill could not be recorded.'))}finally{setBusy(false)}}}>
 <label>Drill outcome<textarea required rows={2} maxLength={2000} value={outcome} onChange={e=>setOutcome(e.target.value)}/></label>
 <label>Measured duration (minutes, 1–1440)<input required inputMode="numeric" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
 <button className="primary-button small" disabled={busy}>Record recovery drill</button>{error&&<p role="alert">{error}</p>}</form>}

export function ProductionDiagnostics(){
 const rows=useQuery(api.releaseCommand.caseList,{})??[]
 const open=useMutation(api.releaseCommand.caseOpen),repair=useMutation(api.releaseCommand.caseRepair),verify=useMutation(api.releaseCommand.caseVerify)
 const [title,setTitle]=useState(''),[correlation,setCorrelation]=useState(''),[reproduction,setReproduction]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Production diagnostics &amp; bounded repair</h2><p>Correlate a real failure with its release or incident reference, reproduce it, propose a bounded repair, and verify the fix in preview before considering the case closed.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await open({title,correlation,reproduction});setTitle('');setCorrelation('');setReproduction('')}catch(err){setError(operatorError(err,'Case could not be opened.'))}finally{setBusy(false)}}}>
 <label>Case title<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
 <label>Correlated release or incident reference<input required maxLength={300} value={correlation} onChange={e=>setCorrelation(e.target.value)}/></label>
 <label>Reproduction steps<textarea required rows={4} maxLength={4000} value={reproduction} onChange={e=>setReproduction(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Open diagnostic case</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No diagnostic cases recorded yet.</p></div>:rows.map(c=><article className="glass-card research-card" key={c._id}><p>{c.title} · {c.status}</p><p>Correlation: {c.correlation}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{c.reproduction}</pre>
 {c.proposedRepair&&<p>Repair: {c.proposedRepair}</p>}{c.previewVerificationNote&&<p>Preview verification: {c.previewVerificationNote}</p>}
 {c.status==='open'?<NoteAction label="Proposed bounded repair" button="Record repair proposal" onNote={async note=>repair({id:c._id,repair:note})}/>:c.status==='repaired'&&<NoteAction label="Preview verification note" button="Verify in preview" onNote={async note=>verify({id:c._id,note})}/>}</article>)}
 {error&&<p role="alert">{error}</p>}</section>}

export function OwnershipExport(){
 const rows=useQuery(api.releaseCommand.exportList,{})??[]
 const save=useMutation(api.releaseCommand.exportSave)
 const [label,setLabel]=useState(''),[resources,setResources]=useState(''),[artifacts,setArtifacts]=useState(''),[attestation,setAttestation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const kinds=['code','schema','config','tests','docs'] as const
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Ownership, export &amp; exit</h2><p>Record what code, schema, configuration, tests and documentation are exportable, where resource ownership lives, and attest that manifests are secret-free. All fields are scanned for credential-like values before saving.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const parsed=artifacts.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const[kind,reference]=[...line.split('|').map(s=>s.trim())];if(!(kinds as readonly string[]).includes(kind))throw new Error('Use lines like code|https://github.com/org/repo');return{kind:kind as typeof kinds[number],reference}});await save({label,resources,artifacts:parsed,attestationNote:attestation});setLabel('');setResources('');setArtifacts('');setAttestation('')}catch(err){setError(operatorError(err,'Export could not be saved.'))}finally{setBusy(false)}}}>
 <label>Export label<input required maxLength={160} value={label} onChange={e=>setLabel(e.target.value)}/></label>
 <label>Resource ownership (domains, accounts, billing, infrastructure)<textarea required rows={3} maxLength={4000} value={resources} onChange={e=>setResources(e.target.value)}/></label>
 <label>Export artifacts (one per line: kind|reference — kind is code, schema, config, tests or docs)<textarea required rows={5} maxLength={6000} value={artifacts} onChange={e=>setArtifacts(e.target.value)}/></label>
 <label>Secret-free attestation note<textarea required rows={2} maxLength={2000} value={attestation} onChange={e=>setAttestation(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Record ownership export</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No ownership exports recorded yet.</p></div>:rows.map(x=><article className="glass-card research-card" key={x._id}><h3>{x.label}</h3>
 <ul>{x.artifacts.map((a,i)=><li key={i}>{a.kind}: {a.reference}</li>)}</ul>
 <p>Resources: {x.resources}</p><p>Attestation: {x.attestationNote}</p></article>)}
 {error&&<p role="alert">{error}</p>}</section>}

function NoteAction({label,button,alt,onNote}:{label:string;button:string;alt?:string;onNote:(note:string,action?:'reject')=>Promise<unknown>}){
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <div><label>{label}<textarea required rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <div className="hero-actions"><button className="primary-button small" disabled={busy||note.trim().length<12} onClick={async()=>{setBusy(true);try{await onNote(note);setNote('')}catch(err){setError(operatorError(err,'The record could not be saved.'))}finally{setBusy(false)}}}>{button}</button>
 {alt&&<button className="secondary-button" disabled={busy||note.trim().length<12} onClick={async()=>{setBusy(true);try{await onNote(note,'reject');setNote('')}catch(err){setError(operatorError(err,'The record could not be saved.'))}finally{setBusy(false)}}}>{alt}</button>}</div>
 {error&&<p role="alert">{error}</p>}</div>}
