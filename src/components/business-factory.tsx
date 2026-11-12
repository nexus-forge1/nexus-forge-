import {useState} from 'react'
import {useMutation,useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import {operatorError} from '../lib/operator-error'
import type {Id} from '../../convex/_generated/dataModel'

export function DemandValidation(){
 const rows=useQuery(api.businessFactory.demandList,{})??[]
 const save=useMutation(api.businessFactory.demandSave),decide=useMutation(api.businessFactory.demandDecide)
 const [segment,setSegment]=useState(''),[hypothesis,setHypothesis]=useState(''),[evidence,setEvidence]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('')
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Demand validation workspace</h2><p>Record a customer hypothesis per segment, attach evidence references, and make an explicit go or no-go decision. A go decision requires at least one evidence reference.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await save({segment,hypothesis,evidence:evidence?evidence.split('\n').map(s=>s.trim()).filter(Boolean):[]});setSegment('');setHypothesis('');setEvidence('');setStatus('Hypothesis saved as proposed.')}catch(err){setError(operatorError(err,'Hypothesis could not be saved.'))}finally{setBusy(false)}}}>
 <label>Customer segment<input required maxLength={300} value={segment} onChange={e=>setSegment(e.target.value)}/></label>
 <label>Hypothesis<textarea required rows={3} maxLength={2000} value={hypothesis} onChange={e=>setHypothesis(e.target.value)}/></label>
 <label>Evidence references (one per line, optional at capture)<textarea rows={3} maxLength={8000} value={evidence} onChange={e=>setEvidence(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Save hypothesis</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No demand hypotheses recorded yet.</p></div>:rows.map(r=><article className="glass-card research-card" key={r._id}><p>{r.segment} · {r.status} · decision: {r.decision}</p><p>{r.hypothesis}</p>
 {r.evidence.length>0&&<ul>{r.evidence.map((e,i)=><li key={i}>{e}</li>)}</ul>}
 {r.status==='proposed'?<DecideForm onDone={m=>decide({id:r._id,...m})}/>:<p>{r.decisionNote}</p>}</article>)}
 {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}</section>}
function DecideForm({onDone}:{onDone:(input:{status:'validated'|'rejected';decision:'go'|'no-go';decisionNote:string})=>Promise<unknown>}){
 const [result,setResult]=useState<'validated'|'rejected'>('validated'),[decision,setDecision]=useState<'go'|'no-go'>('go'),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await onDone({status:result,decision,decisionNote:note});setNote('')}catch(err){setError(operatorError(err,'Decision could not be saved.'))}finally{setBusy(false)}}}>
 <label>Result<select value={result} onChange={e=>setResult(e.target.value as typeof result)}><option value="validated">Validated</option><option value="rejected">Rejected</option></select></label>
 <label>Decision<select value={decision} onChange={e=>setDecision(e.target.value as typeof decision)}><option value="go">Go</option><option value="no-go">No-go</option></select></label>
 <label>Decision note<textarea required rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <button className="primary-button small" disabled={busy}>Record decision</button>{error&&<p role="alert">{error}</p>}</form>}

export function MonetizationStudio(){
 const rows=useQuery(api.businessFactory.quoteList,{})??[]
 const save=useMutation(api.businessFactory.quoteSave),advance=useMutation(api.businessFactory.quoteAdvance)
 const [label,setLabel]=useState(''),[scope,setScope]=useState(''),[price,setPrice]=useState(''),[entitlement,setEntitlement]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const next:{[k:string]:'quote'|'accept'|'settle'|null}={draft:'quote',quoted:'accept',accepted:'settle',settled:null,held:null,refunded:null}
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Monetization studio</h2><p>Define explicit billable work with a price and entitlement, then advance it through a governed lifecycle: draft → quoted → accepted → settled (or held/refunded). Holds, settlements and refunds require a note.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const p=Number(price);if(!Number.isFinite(p))throw new Error('Use a numeric price');await save({label,scope,priceUsd:p,entitlement});setLabel('');setScope('');setPrice('');setEntitlement('')}catch(err){setError(operatorError(err,'Quote could not be saved.'))}finally{setBusy(false)}}}>
 <label>Quote label<input required maxLength={160} value={label} onChange={e=>setLabel(e.target.value)}/></label>
 <label>Billable scope<textarea required rows={3} maxLength={2000} value={scope} onChange={e=>setScope(e.target.value)}/></label>
 <label>Price (USD)<input required inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label>
 <label>Entitlement<input required maxLength={500} value={entitlement} onChange={e=>setEntitlement(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Save draft quote</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No quotes recorded yet.</p></div>:rows.map(q=><article className="glass-card research-card" key={q._id}><p>{q.label} · {q.status} · ${q.priceUsd.toFixed(2)}</p><p>{q.scope}</p><p>Entitlement: {q.entitlement}</p>
 {q.holdReason&&<p>Hold: {q.holdReason}</p>}{q.settlementNote&&<p>Settlement: {q.settlement} · {q.settlementNote}</p>}
 <QuoteActions id={q._id} status={q.status} next={next[q.status]??null} advance={advance}/></article>)}
 {error&&<p role="alert">{error}</p>}</section>}
function QuoteActions({id,status,next,advance}:{id:Id<'monetizationQuotes'>;status:string;next:'quote'|'accept'|'settle'|null;advance:(input:{id:Id<'monetizationQuotes'>;action:'quote'|'accept'|'hold'|'settle'|'refund';note:string})=>Promise<unknown>}){
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const run=async(action:'quote'|'accept'|'hold'|'settle'|'refund')=>{setBusy(true);try{await advance({id,action,note});setNote('')}catch(err){setError(operatorError(err,'Quote could not be advanced.'))}finally{setBusy(false)}}
 return <div>{(next||['accepted','settled'].includes(status))&&<label>Note (required for hold, settlement and refund)<textarea rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>}
 <div className="hero-actions">{next&&<button className="primary-button small" disabled={busy} onClick={()=>run(next)}>{next==='quote'?'Send quote':next==='accept'?'Accept quote':'Settle'}</button>}
 {['draft','quoted','accepted'].includes(status)&&<button className="secondary-button" disabled={busy} onClick={()=>run('hold')}>Hold</button>}
 {['accepted','settled'].includes(status)&&<button className="secondary-button" disabled={busy} onClick={()=>run('refund')}>Refund</button>}</div>
 {error&&<p role="alert">{error}</p>}</div>}

export function CustomerOperations(){
 const rows=useQuery(api.businessFactory.customerList,{})??[]
 const save=useMutation(api.businessFactory.customerSave),changeStage=useMutation(api.businessFactory.customerStage),addIssue=useMutation(api.businessFactory.customerIssue),resolveIssue=useMutation(api.businessFactory.customerResolve)
 const [name,setName]=useState(''),[stage,setStage]=useState<'onboarding'|'active'|'support'|'cancelled'>('onboarding'),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Customer operations builder</h2><p>Track customer lifecycle stages and a product-linked issue log. Stage changes and issue resolution are recorded on private owner-scoped records.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await save({name,stage});setName('')}catch(err){setError(operatorError(err,'Customer could not be saved.'))}finally{setBusy(false)}}}>
 <label>Customer name<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>Initial stage<select value={stage} onChange={e=>setStage(e.target.value as typeof stage)}><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="support">Support</option><option value="cancelled">Cancelled</option></select></label>
 <button className="primary-button" disabled={busy}>Save customer</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No customers recorded yet.</p></div>:rows.map(c=><article className="glass-card research-card" key={c._id}><p>{c.name} · {c.stage}</p>
 <div className="hero-actions">{(['onboarding','active','support','cancelled'] as const).filter(s=>s!==c.stage).map(s=><button key={s} className="secondary-button" onClick={async()=>{try{await changeStage({id:c._id,stage:s})}catch(err){setError(operatorError(err,'Stage could not be changed.'))}}}>Move to {s}</button>)}</div>
 <IssueLog id={c._id} issues={c.issues} addIssue={addIssue} resolveIssue={resolveIssue}/></article>)}
 {error&&<p role="alert">{error}</p>}</section>}
function IssueLog({id,issues,addIssue,resolveIssue}:{id:Id<'customerRecords'>;issues:{note:string;createdAt:number;resolved:boolean}[];addIssue:(input:{id:Id<'customerRecords'>;note:string})=>Promise<unknown>;resolveIssue:(input:{id:Id<'customerRecords'>;issueIndex:number})=>Promise<unknown>}){
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <div><h3>Issue log</h3>
 {issues.map((issue,i)=><p key={i}>{issue.resolved?'✓':'•'} {issue.note} {issue.resolved||<button className="text-button" onClick={async()=>{try{await resolveIssue({id,issueIndex:i})}catch(err){setError(operatorError(err,'Issue could not be resolved.'))}}}>Resolve</button>}</p>)}
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await addIssue({id,note});setNote('')}catch(err){setError(operatorError(err,'Issue could not be added.'))}finally{setBusy(false)}}}><label>Product-linked issue<textarea required rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="primary-button small" disabled={busy}>Add issue</button></form>
 {error&&<p role="alert">{error}</p>}</div>}

export function GrowthStudio(){
 const rows=useQuery(api.businessFactory.campaignList,{})??[]
 const save=useMutation(api.businessFactory.campaignSave),advance=useMutation(api.businessFactory.campaignAdvance)
 const [audience,setAudience]=useState(''),[offer,setOffer]=useState(''),[channels,setChannels]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Governed launch &amp; growth studio</h2><p>Define audience, offer and channel contracts. Publishing requires an explicit review note; measurement is recorded only after publishing.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await save({audience,offer,channels:channels.split('\n').map(s=>s.trim()).filter(Boolean)});setAudience('');setOffer('');setChannels('')}catch(err){setError(operatorError(err,'Campaign could not be saved.'))}finally{setBusy(false)}}}>
 <label>Audience<input required maxLength={500} value={audience} onChange={e=>setAudience(e.target.value)}/></label>
 <label>Offer<textarea required rows={3} maxLength={1000} value={offer} onChange={e=>setOffer(e.target.value)}/></label>
 <label>Channels (one per line)<textarea required rows={3} maxLength={600} value={channels} onChange={e=>setChannels(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Save campaign draft</button></form></div>
 {rows.length===0?<div className="glass-card research-card"><p>No campaigns recorded yet.</p></div>:rows.map(c=><article className="glass-card research-card" key={c._id}><p>{c.audience} · {c.status}</p><p>{c.offer}</p><p>Channels: {c.channels.join(', ')}</p>
 {c.reviewNote&&<p>Review: {c.reviewNote}</p>}{c.measurement&&<p>Measurement: {c.measurement}</p>}
 <CampaignActions id={c._id} status={c.status} advance={advance}/></article>)}
 {error&&<p role="alert">{error}</p>}</section>}
function CampaignActions({id,status,advance}:{id:Id<'growthCampaigns'>;status:string;advance:(input:{id:Id<'growthCampaigns'>;action:'review'|'publish'|'measure';note:string})=>Promise<unknown>}){
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const run=async(action:'review'|'publish'|'measure')=>{setBusy(true);try{await advance({id,action,note});setNote('')}catch(err){setError(operatorError(err,'Campaign could not be advanced.'))}finally{setBusy(false)}}
 return <div>{status!=='draft'&&<label>{status==='review'?'Review note (required to publish)':'Measurement note'}<textarea rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>}
 <div className="hero-actions">{status==='draft'&&<button className="primary-button small" disabled={busy} onClick={()=>run('review')}>Request review</button>}
 {status==='review'&&<button className="primary-button small" disabled={busy||note.trim().length<12} onClick={()=>run('publish')}>Publish</button>}
 {status==='published'&&<button className="primary-button small" disabled={busy||note.trim().length<12} onClick={()=>run('measure')}>Record measurement</button>}</div>
 {error&&<p role="alert">{error}</p>}</div>}

const sections=['payments','operations','economics','privacy','ownership'] as const
export function BusinessReadiness(){
 const rows=useQuery(api.businessFactory.dossierList,{})??[]
 const link=useMutation(api.businessFactory.dossierLink),reopen=useMutation(api.businessFactory.dossierReopen)
 const [product,setProduct]=useState(''),[section,setSection]=useState<(typeof sections)[number]>('payments'),[evidence,setEvidence]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const products=[...new Set(rows.map(r=>r.product))] as string[]
 const ready=(p:string)=>sections.every(s=>rows.some(r=>r.product===p&&r.section===s&&r.status==='evidence-linked'))
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Business readiness dossier</h2><p>Link evidence to each dossier section (payments, operations, economics, privacy, ownership). A product is ready when all five sections are evidence-linked.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await link({product,section,evidence});setEvidence('')}catch(err){setError(operatorError(err,'Evidence could not be linked.'))}finally{setBusy(false)}}}>
 <label>Product or venture<input required maxLength={160} value={product} onChange={e=>setProduct(e.target.value)}/></label>
 <label>Section<select value={section} onChange={e=>setSection(e.target.value as typeof section)}>{sections.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
 <label>Evidence reference<textarea required rows={2} maxLength={1000} value={evidence} onChange={e=>setEvidence(e.target.value)}/></label>
 <button className="primary-button" disabled={busy}>Link evidence</button></form></div>
 {products.length===0?<div className="glass-card research-card"><p>No dossier sections recorded yet.</p></div>:products.map(p=><article className="glass-card research-card" key={p}><h3>{p} · {ready(p)?'READY':'IN PROGRESS'}</h3>
 {sections.map(s=>{const row=rows.find(r=>r.product===p&&r.section===s);return <p key={s}>{s}: {row?row.status:'missing'} {row&&<button className="text-button" onClick={async()=>{try{await reopen({id:row._id})}catch(err){setError(operatorError(err,'Section could not be reopened.'))}}}>Reopen</button>}</p>})}</article>)}
 {error&&<p role="alert">{error}</p>}</section>}
