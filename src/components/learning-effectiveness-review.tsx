import {useState} from 'react'
import {useQuery,useMutation} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
import type {buildLearningReview} from '../../convex/learningReviewModel'
type Summary=ReturnType<typeof buildLearningReview>
function label(value:string){try{const record=JSON.parse(value);return record.search??((record.baseline?.metric??'Reuse comparison')+' · '+(record.lessonId??''))}catch{return 'Malformed receipt; review before selecting'}}
function EvidenceSnapshot({id}:{id:Id<'learningReviews'>}){
 const row=useQuery(api.learningReviews.get,{id})
 return row===undefined?<p>Loading frozen evidence…</p>:<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(row,null,2)}</pre>
}
function SavedReview({row}:{row:{_id:Id<'learningReviews'>;summary:string;notes:string;createdAt:number;sourceIds:Id<'memories'>[]}}){
 const [open,setOpen]=useState(false)
 let summary:Summary
 try{summary=JSON.parse(row.summary)}catch{return <p>Review could not be displayed.</p>}
 return <article className="evidence-item" data-testid="learning-effectiveness-result" data-review-id={row._id}><div><strong>{summary.status}</strong><p>{summary.units} selected evidence units · {new Date(row.createdAt).toLocaleString()}</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Metric</th><th>Baseline mean</th><th>Candidate mean</th><th>Mean benefit</th><th>Improved / regressed / unchanged</th></tr></thead><tbody>{summary.metrics.map(metric=><tr key={metric.metric}><th scope="row">{metric.metric} ({metric.unit})</th><td>{metric.baselineMean.toFixed(3)}</td><td>{metric.candidateMean.toFixed(3)}</td><td>{metric.benefitMean.toFixed(3)}</td><td>{metric.improved} / {metric.regressed} / {metric.unchanged}</td></tr>)}</tbody></table></div><p>{summary.recommendation}</p><p>{row.notes}</p><p>{summary.limitation}</p><p>Source receipts: {row.sourceIds.join(', ')}</p><details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Inspect frozen source receipts</summary>{open&&<EvidenceSnapshot id={row._id}/>}</details></div></article>
}
export function LearningEffectivenessReview(){
 const sources=useQuery(api.learningReviews.sources,{}),history=useQuery(api.learningReviews.list,{}),create=useMutation(api.learningReviews.create)
 const [kind,setKind]=useState<'retrieval'|'reuse'>('retrieval'),[selected,setSelected]=useState<string[]>([]),[notes,setNotes]=useState(''),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const category=kind==='retrieval'?'retrieval-evaluation':'strategy-reuse-comparison',eligible=(sources??[]).filter(row=>row.category===category)
 const save=async()=>{setBusy(true);setMessage('');try{await create({kind,sourceIds:selected as Id<'memories'>[],notes,comparabilityReviewed:reviewed});setMessage('Effectiveness review saved. No policy or strategy was promoted.')}catch(e){setMessage(e instanceof Error?e.message:'Could not save review.')}finally{setBusy(false)}}
 return <div className="glass-card research-card" data-testid="learning-effectiveness-review" data-state={sources===undefined||history===undefined?'loading':'ready'}>
 <div className="panel-title"><span>MEMORY & LEARNING EFFECTIVENESS</span><span className="status-chip">SAVED COMPARABLE EVIDENCE</span></div>
 <p>Review 2–20 existing receipts. Retrieval scores are recomputed from observed rankings and your labels. Reuse reviews require matching lesson, strategy, metric, target and conditions, distinct measurements and different candidate missions.</p>
 <fieldset disabled={busy}><legend>Review repeated evidence</legend>
 <label htmlFor="effectiveness-kind">Evidence type</label><select id="effectiveness-kind" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setSelected([]);setReviewed(false);setMessage('')}}><option value="retrieval">Memory retrieval comparisons</option><option value="reuse">Lesson reuse outcome comparisons</option></select>
 {sources===undefined?<p>Loading saved evidence…</p>:!eligible.length?<p>No matching evidence yet. Record retrieval evaluations in Research &amp; Memory or reuse comparisons below.</p>:eligible.map(row=><label key={row.id} style={{display:'block'}}><input type="checkbox" checked={selected.includes(row.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,row.id]:ids.filter(id=>id!==row.id))}/>{label(row.value)} · {row.id}</label>)}
 <label htmlFor="effectiveness-notes">Comparable conditions and evidence limitations</label><textarea id="effectiveness-notes" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/>
 <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed comparability and the relevance or application labels.</label>
 <button className="primary-button" disabled={!reviewed||selected.length<2||selected.length>20||notes.trim().length<12||sources===undefined||history===undefined} onClick={()=>void save()}>Save effectiveness review</button>
 </fieldset>{message&&<p role="status">{message}</p>}
 <p>Regressions stay visible even when the mean improves. Selected evidence is not an independent benchmark or causal proof. History shows up to twenty retained reviews.</p>
 {history?.map(row=><SavedReview key={row._id} row={row}/>)}
 </div>
}
