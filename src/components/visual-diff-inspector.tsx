import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ScopeAPanel } from './scope-a-ui-kit'

export function VisualDiffInspector(){const [baseline,setBaseline]=useState(''),[candidate,setCandidate]=useState(''),[run,setRun]=useState(false)
 const data=useQuery(api.scopeAFunctions.diffVisualRevisions,run&&baseline&&candidate?{baselineId:baseline as Id<'visualRevisions'>,candidateId:candidate as Id<'visualRevisions'>}:'skip')
 return <ScopeAPanel title="Visual revision diff inspector" eyebrow="A9 · AST / CANVAS DIFF"><form onSubmit={e=>{e.preventDefault();setRun(true)}}><label className="scope-a-field">Baseline revision ID<input value={baseline} onChange={e=>{setBaseline(e.target.value);setRun(false)}} required/></label><label className="scope-a-field">Candidate revision ID<input value={candidate} onChange={e=>{setCandidate(e.target.value);setRun(false)}} required/></label><button className="primary-button" type="submit">Compare revisions</button></form>{run&&data===undefined?<p role="status">Loading revision diff…</p>:data&&<><div className="decision-line"><span>CHANGE COUNT</span><strong>{data.changedFields.length}</strong></div><ul>{data.changedFields.map(field=><li key={field}>{field}</li>)}</ul><h3>Baseline diff</h3><pre>{data.baselineDiff}</pre><h3>Candidate diff</h3><pre>{data.candidateDiff}</pre></>}</ScopeAPanel>}
