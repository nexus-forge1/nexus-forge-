import { useActiveMission } from '../hooks/use-active-mission'

export function useMissionGuide() {
  const state = useActiveMission()
  const { missionId, mission, agents, research, artifacts, deliveries } = state
  const stages = [
    { title: 'Define mission', done: !!missionId, path: '/mission', note: 'Confirm the intended outcome, scope, constraints, and budget.' },
    { title: 'Review mission authorization', done: !!mission?.approved, path: '/mission', note: 'The mission approval record is a prerequisite for governed execution.' },
    { title: 'Complete AI Council planning', done: agents.length > 0 && agents.every(row => row.status === 'complete'), path: '/council', note: 'Inspect agent results and resolve blockers before proceeding.' },
    { title: 'Gather cited research', done: research.some(row => (row.citations?.length ?? 0) > 0), path: '/evidence', note: 'Persist source-backed research against the mission when research is needed.' },
    { title: 'Generate and verify artifact', done: artifacts.some(row => row.status === 'verified' || row.status === 'ready'), path: '/artifacts', note: 'Review quality findings; artifact verification and approval are separate states.' },
    { title: 'Record artifact approval', done: artifacts.some(row => row.status === 'ready'), path: '/artifacts', note: 'Use the artifact page to review the recorded approval state before delivery.' },
    { title: 'Prepare and authorize delivery', done: deliveries.some(row => row.approved), path: '/delivery', note: 'Check the exact target and delivery authorization in the delivery workspace.' },
    { title: 'Verify delivery provenance and readiness', done: deliveries.some(row => row.stage === 'verified' && row.readinessStatus === 'pass' && typeof row.readinessTotalCount === 'number' && row.readinessTotalCount > 0 && row.readinessPassedCount === row.readinessTotalCount && !!row.workflowRunUrl && !!row.workflowCommitSha && !!row.deploymentRunUrl && row.deploymentCommitSha?.toLowerCase() === row.workflowCommitSha?.toLowerCase() && !!row.deploymentUrl), path: '/delivery', note: 'Require matching workflow/deployment provenance and passing canonical readiness evidence.' },
    { title: 'Measure outcome and capture learning', done: (state.measurements ?? []).some(row => row.metric === 'governed delivery readiness' && row.status === 'pass' && !!row.verificationId && row.actual >= row.target && row.target === 1), path: '/workflow', note: 'On this page, use Outcome Verification to record the delivery measurement and reusable lesson. Then continue to Learning Engine for comparisons.' },
  ]
  const pendingStage = stages.find(stage => !stage.done)
  const latestDelivery = deliveries[0]
  const executionOpen = mission?.status !== 'complete' && mission?.status !== 'cancelled' && mission?.status !== 'review'
  const recovery = executionOpen && latestDelivery?.stage === 'blocked' && stages.slice(0, 6).every(stage => stage.done)
    ? { title: 'Resolve blocked delivery', done: false, path: '/delivery', note: latestDelivery.status + '. Review the delivery record and recovery controls before continuing.' }
    : undefined
  const statusStep = mission?.status === 'review'
    ? { title: 'Resolve portfolio review', done: false, path: '/portfolio', note: 'The mission is on hold. Review its portfolio decision before any further execution.' }
    : mission?.status === 'cancelled'
      ? { title: 'Define a new mission contract', done: false, path: '/mission', note: 'This mission is cancelled. Its saved evidence remains available; choose or create a new mission to continue.' }
      : mission?.status === 'complete'
        ? stages[7].done && !stages[8].done
          ? stages[8]
          : { title: 'Review recorded outcome', done: false, path: '/learning', note: 'This mission is complete. Review recorded measurements and lessons; missing checkpoints remain unverified. Select a new mission for further execution.' }
        : undefined
  return { ...state, stages, nextStage: statusStep ?? recovery ?? pendingStage, completed: stages.filter(stage => stage.done).length, recovery }

}
