import {OpportunityObservations} from './opportunity-observations'
import {useState} from 'react'
import {useQuery,useMutation} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
type Strategy={_id:string;key:string;value:string}
function read(row:Strategy){try{const item=JSON.parse(row.value);return item&&typeof item==='object'?item:{}}catch{return {}}}
function value(item:any,key:string){return typeof item[key]==='string'&&item[key].trim()?item[key]:'Not recorded'}
export function OpportunityContext({strategies}:{strategies:Strategy[]}){
 const [selected,setSelected]=useState('')
 const strategy=strategies.find(row=>row._id===selected)
 return <div className="glass-card research-card">
  <div className="panel-title"><span>OPPORTUNITY CONTEXT & VALIDATION</span><span className="status-chip">{strategies.length} STRATEGIES</span></div>
  <p>Compare the strategies attached to this selected blueprint. Expected value and timing are proposals; saved outcomes are operator observations.</p>
  {!strategies.length?<p>No strategies are loaded for this blueprint. Create or select a saved blueprint above.</p>:<div style={{overflowX:'auto'}}><table><caption>Opportunity context for this blueprint</caption><thead><tr><th>Strategy</th><th>Dependencies & assumptions</th><th>Value & time to evidence</th><th>Risk & observed outcome</th></tr></thead><tbody>{strategies.map(row=>{const item=read(row);return <tr key={row._id}><th scope="row">{value(item,'name')}</th><td>{value(item,'prerequisites')}<p>Assumptions: {value(item,'unverifiedAssumptions')}</p><p>Saved assumption references: {Array.isArray(item.assumptionEvidence)?item.assumptionEvidence.length:0}</p></td><td>{value(item,'expectedValue')}<p>{value(item,'timeToEvidence')}</p></td><td>{value(item,'failureMode')}<p>Reversibility: {value(item,'reversibility')}</p><p>Outcome: {value(item,'outcomeStatus')}</p><p>{value(item,'actualResult')}</p><p>Outcome evidence: {value(item,'evidence')}</p></td></tr>})}</tbody></table></div>}
  <label htmlFor="opportunity-strategy">Strategy to validate</label><select id="opportunity-strategy" value={strategy?selected:''} onChange={e=>setSelected(e.target.value)}><option value="">Select strategy</option>{strategies.map(row=><option key={row._id} value={row._id}>{value(read(row),'name')}</option>)}</select>
  {strategy&&<ValidationPlan key={strategy._id} strategy={strategy}/>}
 </div>
}
function ValidationPlan({strategy}:{strategy:Strategy}){
 const plans=useQuery(api.opportunityPlans.list,{strategyId:strategy._id as Id<'memories'>})
 const save=useMutation(api.opportunityPlans.create),item=read(strategy)
 const [assumption,setAssumption]=useState(typeof item.unverifiedAssumptions==='string'?item.unverifiedAssumptions:'')
 const [action,setAction]=useState(''),[metric,setMetric]=useState(''),[unit,setUnit]=useState(''),[target,setTarget]=useState(''),[days,setDays]=useState('7'),[stop,setStop]=useState('')
 const [direction,setDirection]=useState<'at_least'|'at_most'>('at_least'),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const submit=async()=>{setBusy(true);setMessage('');try{await save({strategyId:strategy._id as Id<'memories'>,assumption,action,metric,unit,target:Number(target),direction,reviewWithinDays:Number(days),stopCondition:stop});setMessage('Validation plan saved. No experiment was started.')}catch(e){setMessage(e instanceof Error?e.message:'Could not save plan.')}finally{setBusy(false)}}
 const valid=assumption.trim().length>=8&&action.trim().length>=8&&metric.trim().length>=2&&unit.trim()&&target.trim()!==''&&Number.isFinite(Number(target))&&Number.isInteger(Number(days))&&Number(days)>=1&&Number(days)<=365&&stop.trim().length>=8
 return <section>
  <h3>Prepare the next validation</h3><p><a href="/evidence">Gather cited research →</a> · <a href="/learning">Compare measured results →</a></p><p>A saved plan freezes the current strategy and target. Review results in the existing outcome and learning tools after collecting evidence.</p>
  <fieldset disabled={busy}><legend>Validation plan</legend>
  <label htmlFor="validation-assumption">Assumption to test</label><textarea id="validation-assumption" maxLength={1500} value={assumption} onChange={e=>setAssumption(e.target.value)}/>
  <label htmlFor="validation-action">Validation action</label><textarea id="validation-action" maxLength={2000} value={action} onChange={e=>setAction(e.target.value)}/>
  <label htmlFor="validation-metric">Metric</label><input id="validation-metric" maxLength={120} value={metric} onChange={e=>setMetric(e.target.value)}/>
  <label htmlFor="validation-unit">Unit</label><input id="validation-unit" maxLength={60} value={unit} onChange={e=>setUnit(e.target.value)}/>
  <label htmlFor="validation-direction">Target comparison</label><select id="validation-direction" value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}><option value="at_least">At least</option><option value="at_most">At most</option></select>
  <label htmlFor="validation-target">Target value</label><input id="validation-target" type="number" min={-1e12} max={1e12} value={target} onChange={e=>setTarget(e.target.value)}/>
  <label htmlFor="validation-days">Review within days</label><input id="validation-days" type="number" min={1} max={365} step={1} value={days} onChange={e=>setDays(e.target.value)}/>
  <label htmlFor="validation-stop">Stop condition</label><textarea id="validation-stop" maxLength={1500} value={stop} onChange={e=>setStop(e.target.value)}/>
  <button className="primary-button" disabled={!valid||plans===undefined||plans.length>=20} onClick={()=>void submit()}>Save validation plan</button>
  </fieldset>{message&&<p role="status">{message}</p>}
  <p>{plans===undefined?'Loading plans…':plans.length+'/20 immutable validation plans'}</p>
  {plans?.map(plan=><article className="evidence-item" key={plan._id} data-testid="opportunity-plan" data-plan-id={plan._id}><div><strong>{plan.assumption}</strong><p>{plan.action}</p><p>Target: {plan.metric} {plan.direction==='at_least'?'≥':'≤'} {plan.target} {plan.unit} · review within {plan.reviewWithinDays} days of {new Date(plan.createdAt).toLocaleDateString()}</p><p>Stop: {plan.stopCondition}</p>{plan.strategySnapshot!==strategy.value&&<p className="warning">Strategy changed since this plan was saved. Review its frozen context.</p>}<details><summary>Frozen strategy context</summary><pre style={{whiteSpace:'pre-wrap'}}>{plan.strategySnapshot}</pre></details><OpportunityObservations plan={plan}/></div></article>)}
 </section>
}
