import { RuntimeWorkbench } from './runtime-workbench'
import { LiveModelComparison } from './live-model-comparison'
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
export type LabKind = 'comparison'|'science'|'generality'
const descriptions = {
 comparison: 'Compare a named baseline with a candidate on the same cases. Preregister the metric, direction and improvement target before adding results. Both wins and regressions are retained.',
 science: 'Preregister a falsifiable hypothesis and measurement protocol. Record paired observations with source digests, then close the experiment only after its sample and domain requirements are met.',
 generality: 'Measure transfer across explicitly named training and held-out domains. Freeze the domain split before collecting observations. Results describe this sample; they do not establish AGI or superintelligence.'
}
export function ExperimentLab({kind}:{kind:LabKind}) {
 const records=useQuery(api.frontierLab.list,{kind}),create=useMutation(api.frontierLab.create),add=useMutation(api.frontierLab.addTrial),close=useMutation(api.frontierLab.close)
 const [selected,setSelected]=useState<Id<'labProtocols'>|null>(null),detail=useQuery(api.frontierLab.detail,selected?{protocolId:selected}:'skip')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 async function work(fn:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Unable to save')}finally{setBusy(false)}}
 return <section className="workspace frontier-feature" data-testid="experiment-lab" data-kind={kind} data-state={records===undefined?'loading':'ready'}><p>{descriptions[kind]}</p>
 {kind==='comparison'&&<LiveModelComparison/>}<RuntimeWorkbench area="evaluation"/><div className="console-grid"><form className="glass-card research-card" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void work(async()=>{const id=await create({kind,title:String(f.get('title')),hypothesis:String(f.get('hypothesis')),metric:String(f.get('metric')),unit:String(f.get('unit')),direction:f.get('direction') as 'higher'|'lower',target:Number(f.get('target')),minimumSamples:Number(f.get('samples')),domains:String(f.get('domains')).split(',').map(x=>x.trim()).filter(Boolean),heldOutDomains:String(f.get('heldout')??'').split(',').map(x=>x.trim()).filter(Boolean)});setSelected(id);setMessage('Protocol preregistered. Its metric, domain split and target are immutable.')})}}>
 <h2>Preregister a protocol</h2>
 <label>Title<input name="title" required maxLength={160}/></label>
 <label>{kind==='comparison'?'Baseline, candidate and comparison question':'Falsifiable hypothesis'}<textarea name="hypothesis" required maxLength={2000}/></label>
 <label>Metric<input name="metric" required maxLength={120} placeholder="Task success rate"/></label>
 <label>Unit<input name="unit" required maxLength={40} placeholder="percent"/></label>
 <label>Better direction<select name="direction"><option value="higher">Higher is better</option><option value="lower">Lower is better</option></select></label>
 <label>Minimum mean improvement<input name="target" type="number" step="any" required defaultValue="0"/></label>
 <label>Minimum paired samples in total<input name="samples" type="number" min="2" max="100" required defaultValue="5"/></label>
 <label>Domains, separated by commas<input name="domains" required placeholder={kind==='generality'?'planning, coding, unfamiliar reasoning':'representative tasks'}/></label>
 {kind==='generality'&&<label>Held-out domains, separated by commas<input name="heldout" required placeholder="unfamiliar reasoning"/></label>}
 <button className="primary-button" disabled={busy}>Preregister protocol</button></form>
 <div className="glass-card research-card"><h2>Saved protocols</h2>{records===undefined?<p>Loading…</p>:records.length===0?<p>No protocols yet. No result is assumed.</p>:records.map(p=><button className="secondary-button" aria-pressed={selected===p._id} key={p._id} onClick={()=>setSelected(p._id)}>{p.title} · {p.status}</button>)}
 <p>Evidence URLs and SHA-256 digests are operator-supplied provenance. The app does not independently verify the external report or infer novelty from a passing target.</p></div></div>
 {selected&&detail&&detail.record._id===selected&&<div className="glass-card research-card" data-testid="protocol-detail" data-protocol-id={selected}><h2>{detail.record.title}</h2><p>{detail.record.hypothesis}</p>
 <dl><dt>Frozen metric</dt><dd>{detail.record.metric} ({detail.record.unit}), {detail.record.direction} is better</dd><dt>Samples</dt><dd>{detail.summary.n}/{detail.record.minimumSamples}</dd><dt>Mean paired improvement</dt><dd>{detail.summary.meanImprovement??'Unavailable'}</dd><dt>Standard error</dt><dd>{detail.summary.standardError??'Requires two samples'}</dd><dt>Result</dt><dd>{!detail.summary.ready?'Insufficient sample or domain coverage':detail.summary.targetMet?'Recorded sample meets target':'Recorded sample misses target'}</dd></dl>
 <p>Paired observations: {detail.summary.improved} improved · {detail.summary.regressed} regressed · {detail.summary.unchanged} unchanged. An aggregate target pass does not erase individual regressions.</p>
 {detail.record.heldOutDomains.length>0&&<p data-testid="held-out-result">Held-out result: {!detail.summary.heldOutReady?'Insufficient sample or domain coverage':detail.summary.heldOutTargetMet?'All recorded held-out domain means meet the frozen target':'At least one recorded held-out domain mean misses the frozen target'}. The sample minimum applies to the total; each domain needs coverage. A published domain split does not establish experimental blindness or independent replication.</p>}
 {detail.summary.domainResults.map(d=><p key={d.domain}>{d.domain}{d.heldOut?' (held out)':''}: {d.n} sample(s), mean improvement {d.meanImprovement??'unavailable'}</p>)}
 {detail.record.status==='open'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void work(async()=>{await add({protocolId:selected,caseKey:String(f.get('case')),domain:String(f.get('domain')),baseline:Number(f.get('baseline')),candidate:Number(f.get('candidate')),evidence:String(f.get('evidence')),digest:String(f.get('digest'))});setMessage('Immutable paired observation saved.')})}}>
 <h3>Add paired observation</h3><label>Unique case key<input name="case" required maxLength={120}/></label><label>Domain<select name="domain">{detail.record.domains.map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Baseline value<input name="baseline" type="number" step="any" required/></label><label>Candidate value<input name="candidate" type="number" step="any" required/></label>
 <label>HTTPS evidence URL<input name="evidence" type="url" required maxLength={1000}/></label><label>Evidence SHA-256<input name="digest" required pattern="[a-fA-F0-9]{64}" maxLength={64}/></label>
 <button className="primary-button" disabled={busy}>Save observation</button></form>}
 <div className="hero-actions"><button className="secondary-button" disabled={busy||!detail.summary.ready||detail.record.status==='closed'} onClick={()=>void work(async()=>{await close({protocolId:selected});setMessage('Protocol closed. Results remain available, including regressions.')})}>Close protocol</button><button className="secondary-button" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(detail,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='nexus-'+kind+'-report.json';a.click();URL.revokeObjectURL(url)}}>Export report</button></div>
 <p>{detail.summary.claim}</p><details><summary>Recorded observations ({detail.trials.length})</summary>{detail.trials.map(t=><p key={t._id}>{t.caseKey} · {t.domain}: {t.baseline} → {t.candidate} · <a href={t.evidence} target="_blank" rel="noreferrer">Evidence</a><br/><code>{t.digest}</code></p>)}</details></div>}
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>
}
