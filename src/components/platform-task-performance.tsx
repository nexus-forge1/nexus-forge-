import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export function PlatformTaskPerformance({ missionId }: { missionId: Id<'missions'> | null }) {
  const summary = useQuery(api.platformTasks.summary, missionId ? { missionId } : {})
  const names = { research: 'Cited research', artifact: 'Artifact structural quality', delivery: 'Verified deployment' }
  return <div className="glass-card research-card">
    <h2>NEXUS FORGE task performance</h2>
    <p>{missionId ? 'Selected mission' : 'All owned missions'} · Latest 100 recorded task attempts since instrumentation was enabled. Success rate uses terminal results only; pending work is unresolved and excluded. No history is backfilled.</p>
    <p>Research requires saved citations. Artifact success means generated content passed structural checks; it does not establish browser behavior. Delivery success requires the validated deployment callback. Delivery elapsed time starts at preparation and includes approval and workflow waits. Research and artifact times span the measured operation, including retries.</p>
    {!summary ? <p role="status">Loading platform task measurements…</p> : <>
      {summary.sampled === 0 && <p>No measured platform tasks yet. New research, artifact generation and dispatched deliveries will appear as you use the existing workflow.</p>}
      {summary.truncated && <p>Showing the latest 100 recorded attempts; older records are outside this summary.</p>}
      {summary.rows.map(row => <div className="guard-item" key={row.kind}>
        <div><strong>{names[row.kind]}</strong>
          <p>{row.successes} succeeded · {row.failures} failed · {row.pending} pending / unresolved</p>
          <p>Success rate: {row.successRate === null ? 'Not measured' : row.successRate.toFixed(1) + '%'} · Failure rate: {row.failureRate === null ? 'Not measured' : row.failureRate.toFixed(1) + '%'}</p>
          <p>Completed elapsed time: mean {row.meanSeconds === null ? 'not measured' : row.meanSeconds.toFixed(2) + ' s'} · median {row.medianSeconds === null ? 'not measured' : row.medianSeconds.toFixed(2) + ' s'} · p95 {row.p95Seconds === null ? 'not measured' : row.p95Seconds.toFixed(2) + ' s'} ({row.timedCount} timed results)</p>
          <p>Oldest unresolved attempt: {row.oldestPendingSeconds === null ? 'None pending' : row.oldestPendingSeconds.toFixed(1) + ' seconds'}</p>
        </div>
      </div>)}
    </>}
    <p>Private server-recorded platform observations. Median/p95 describe only completed timed attempts in the bounded sample; oldest pending age is measured at query time and does not prove a task is stuck. These do not establish customer adoption, revenue, causal improvement or independent certification. Provider exceptions are failures; process interruption can leave a pending record.</p>
  </div>
}
