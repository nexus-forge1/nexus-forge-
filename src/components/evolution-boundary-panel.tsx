import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ScopeAPanel } from './scope-a-ui-kit'

export function EvolutionBoundaryPanel(){const [proposalId,setProposalId]=useState(''),[run,setRun]=useState(false),data=useQuery(api.scopeAFunctions.verifyEvolutionBoundary,run&&proposalId?{proposalId:proposalId as Id<'evolutionProposals'>}:'skip')
 return <ScopeAPanel title="Evolution safety boundary" eyebrow="A13 · ROLLBACK & SAFETY"><form onSubmit={e=>{e.preventDefault();setRun(true)}}><label className="scope-a-field">Evolution proposal ID<input value={proposalId} onChange={e=>{setProposalId(e.target.value);setRun(false)}} required/></label><button className="primary-button" type="submit">Verify candidate boundary</button></form>{run&&data===undefined?<p role="status">Checking baseline and candidate digests…</p>:data&&<><div className="decision-line"><span>INDEPENDENT REVIEW</span><strong>{data.eligibleForIndependentReview?'ELIGIBLE':'BLOCKED'}</strong></div><p>Baseline: {data.baselineDigest||'unavailable'}</p><p>Candidate: {data.candidateDigest||'unavailable'}</p><ul>{data.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul><p className="muted-copy">This panel verifies eligibility only; it does not activate a pilot or apply a rollback.</p></>}</ScopeAPanel>}
