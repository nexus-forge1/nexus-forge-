import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useMissionGuide } from '../lib/use-mission-guide'
import { ScopeAPanel } from './scope-a-ui-kit'

export function GuidedWorkflowGate(){const {missionId}=useMissionGuide();const gate=useQuery(api.scopeAFunctions.guidedWorkflowGate,missionId?{missionId}:'skip')
 return <ScopeAPanel title="Guided workflow gate" eyebrow="A5 · ELIGIBILITY"><p role="status">{!missionId?'Select a mission to inspect gate eligibility.':gate===undefined?'Loading gate evaluation…':gate===null?'No gate result returned.':gate.executionAllowed?'Eligible to continue':'Blocked until required evidence is recorded.'}</p>{gate&&<><div className="decision-line"><span>ELIGIBILITY</span><strong>{gate.executionAllowed?'ELIGIBLE':'BLOCKED'}</strong></div><p>Next gate: {gate.nextGate}</p><p>Mission approval: {gate.approved?'approved':'required'} · Latest guide: {gate.latestGuideStatus??'not recorded'} · Roadmap: {gate.roadmapAccepted} accepted, {gate.roadmapOpen} open</p></>}</ScopeAPanel>}
