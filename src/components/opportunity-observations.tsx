import {useState} from 'react'
import {useQuery,useMutation} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
type Plan={_id:Id<'opportunityPlans'>;metric:string;unit:string;target:number;direction:'at_least'|'at_most';createdAt:number}
export function OpportunityObservations({plan}:{plan:Plan}){
 const [open,setOpen]=useState(false)
 return <details data-testid="opportunity-observation-panel" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Record or review measured observations</summary>{open&&<ObservationForm plan={plan}/>}</details>
}
export function ObservationForm({plan}:{plan:Plan}){
 const rows=useQuery(api.opportunityObservations.list,{planId:plan._id}),record=useMutation(api.opportunityObservations.record)
 const [actual,setActual]=useState(''),[sample,setSample]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[method,setMethod]=useState(''),[evidence,setEvidence]=useState('')
 const [complete,setComplete]=useState(false),[stop,setStop]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const suffix=plan._id
 const submit=async()=>{setBusy(true);setMessage('');try{
  await record({planId:plan._id,...(actual.trim()?{actual:Number(actual)}:{}),sampleSize:Number(sample),periodStart:new Date(start).getTime(),periodEnd:new Date(end).getTime(),complete,stopTriggered:stop,method,evidence})
  setMessage('Observation saved against the original target.');setActual('');setSample('');setStart('');setEnd('');setMethod('');setEvidence('');setComplete(false);setStop(false)
 }catch(e){setMessage(e instanceof Error?e.message:'Could not save observation.')}finally{setBusy(false)}}
 const valid=sample.trim()!==''&&Number.isSafeInteger(Number(sample))&&Number(sample)>=0&&start&&end&&Number.isFinite(new Date(start).getTime())&&new Date(end).getTime()>new Date(start).getTime()&&(!actual.trim()||Number.isFinite(Number(actual)))&&(!complete||(actual.trim()!==''&&Number(sample)>0))&&method.trim().length>=8&&evidence.trim().length>=8
 return <section data-testid="plan-observations" data-state={rows===undefined?"loading":"ready"}>
  <h4>Measured observations</h4><p>Frozen target: {plan.metric} {plan.direction==='at_least'?'≥':'≤'} {plan.target} {plan.unit}. Record completed periods after {new Date(plan.createdAt).toLocaleString()}.</p>
  <p>These are operator-reported measurements. Meeting a numeric target does not establish independent verification, causality or market demand. Partial or late observations remain inconclusive; an operator-reported stop condition fails the assessment. Receipts may overlap; sample sizes are not aggregated.</p>
  <fieldset disabled={busy}><legend>Record observation</legend>
   <label htmlFor={'observed-value-'+suffix}>Observed value (optional for partial data)</label><input id={'observed-value-'+suffix} type="number" min={-1e12} max={1e12} value={actual} onChange={e=>setActual(e.target.value)}/>
   <label htmlFor={'observed-sample-'+suffix}>Sample size</label><input id={'observed-sample-'+suffix} type="number" min={0} max={1e9} step={1} value={sample} onChange={e=>setSample(e.target.value)}/>
   <label htmlFor={'observed-start-'+suffix}>Measurement period start</label><input id={'observed-start-'+suffix} type="datetime-local" step="0.001" value={start} onChange={e=>setStart(e.target.value)}/>
   <label htmlFor={'observed-end-'+suffix}>Measurement period end</label><input id={'observed-end-'+suffix} type="datetime-local" step="0.001" value={end} onChange={e=>setEnd(e.target.value)}/>
   <label htmlFor={'observed-complete-'+suffix}><input id={'observed-complete-'+suffix} type="checkbox" checked={complete} onChange={e=>setComplete(e.target.checked)}/>Complete comparable measurement</label>
   <label htmlFor={'observed-stop-'+suffix}><input id={'observed-stop-'+suffix} type="checkbox" checked={stop} onChange={e=>setStop(e.target.checked)}/>Stop condition triggered</label>
   <label htmlFor={'observed-method-'+suffix}>Measurement method</label><textarea id={'observed-method-'+suffix} maxLength={2000} value={method} onChange={e=>setMethod(e.target.value)}/>
   <label htmlFor={'observed-evidence-'+suffix}>Evidence reference or reproducible notes</label><textarea id={'observed-evidence-'+suffix} maxLength={3000} value={evidence} onChange={e=>setEvidence(e.target.value)}/>
   <button className="primary-button" disabled={!valid||rows===undefined||rows.length>=50} onClick={()=>void submit()}>Save measured observation</button>
  </fieldset>{message&&<p role="status">{message}</p>}
  <p>{rows===undefined?'Loading observations…':rows.length+'/50 immutable observations'}</p>
  {rows?.map(row=><article className="evidence-item" key={row._id}><div><strong>{row.status==='passed'?'Target met':row.status==='failed'?'Target not accepted':'Inconclusive'}</strong><p>Observed: {row.actual??'Not measured'} {row.unit} · Target: {row.direction==='at_least'?'≥':'≤'} {row.target} · Sample: {row.sampleSize}</p><p>{new Date(row.periodStart).toLocaleString()} — {new Date(row.periodEnd).toLocaleString()}{row.late?' · Outside review window':''}{row.stopTriggered?' · Stop condition triggered':''}</p><p>{row.method}</p><p>{row.evidence}</p><p><strong>Next decision:</strong> {row.nextAction}</p></div></article>)}
 </section>
}
