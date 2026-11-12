import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useMissionGuide } from '../lib/use-mission-guide'
import { ScopeAPanel } from './scope-a-ui-kit'

export function PortfolioCriteriaEvaluator(){const {missionId}=useMissionGuide(),data=useQuery(api.scopeAFunctions.evaluatePortfolioCriteria,missionId?{missionId}:'skip')
 return <ScopeAPanel title="Portfolio criteria evaluator" eyebrow="A12 · STRATEGY TRADEOFFS">{!missionId?<p>Select a mission to evaluate portfolio criteria.</p>:data===undefined?<p role="status">Evaluating saved portfolio criteria…</p>:<><div className="decision-line"><span>RECOMMENDATION</span><strong>{data.recommendation}</strong></div><p>Verifications: {data.passingVerifications} passed, {data.failedVerifications} failed · Open incidents: {data.openIncidents}</p><ul>{data.rationale.map((item,i)=><li key={i}>{item}</li>)}</ul></>}</ScopeAPanel>}
