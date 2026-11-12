import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useMissionGuide } from '../lib/use-mission-guide'
import { ScopeAPanel } from './scope-a-ui-kit'

export function CouncilConsensusView(){const {missionId}=useMissionGuide();const data=useQuery(api.scopeAFunctions.evaluateCouncilConsensus,missionId?{missionId}:'skip')
 return <ScopeAPanel title="Council consensus" eyebrow="A6 · CONSENSUS EVIDENCE">{!missionId?<p>Select a mission to inspect consensus.</p>:data===undefined?<p role="status">Loading council consensus…</p>:<><div className="decision-line"><span>CONSENSUS</span><strong>{data.consensus}</strong></div><p>Quorum: {data.quorumReached?'met':'not met'} · {data.completedAgents} / {data.totalAgents} agents complete · Evidence score: {data.averageEvidenceScore}</p><progress max={Math.max(1,data.totalAgents)} value={data.completedAgents} aria-label="Completed council agents"/><h3>Dissent and blockers</h3><ul>{data.dissent.map((item,i)=><li key={i}>{item}</li>)}</ul></>}</ScopeAPanel>}
