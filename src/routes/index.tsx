import { routeHead } from '../lib/route-metadata'
import { expansionPages } from '../components/expansion-guide'
import { createFileRoute, Link } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useMissionGuide } from '../lib/use-mission-guide'
import { derivePageState } from '../lib/page-progress'
import { guidedWorkspaces } from '../lib/workspaces'

export const Route = createFileRoute('/')({ head: () => routeHead("/"), component: OverviewPage })

export function OverviewPage() {
  const { missionId, mission, agents, research, artifacts, deliveries, councilComplete, sourceLinks = [], nextStage, recovery, evidenceLoading, stages: missionStages } = useMissionGuide()
  const hasArtifact = artifacts.length > 0
  const hasVerified = artifacts.some(row => row.status === 'verified' || row.status === 'ready')
  const hasArtifactApproval = artifacts.some(row => row.status === 'ready')
  const hasDeliveryPrepared = deliveries.length > 0
  const hasDeliveryApproval = deliveries.some(row => row.approved && ['github', 'test', 'build', 'deploy', 'verified', 'complete'].includes(row.stage))
  const hasBuildEvidence = deliveries.some(row => row.workflowConclusion === 'success' && !!row.workflowRunUrl && !!row.workflowCommitSha && !!row.workflowRecordedAt)
  // Keep Overview's ordered execution aligned with the shared sidebar and guided tour.
  const workspaceEvidence: Record<string, boolean> = {
    '/mission': !!missionId && !!mission,
    '/manifest': sourceLinks.some(link => link.path === '/manifest'),
    '/orchestrator': sourceLinks.some(link => link.path === '/orchestrator'),
    '/learning': sourceLinks.some(link => link.path === '/learning'),
    '/council': councilComplete,
    '/evidence': research.some(row => (row.citations?.length ?? 0) > 0),
    '/artifacts': hasArtifact && hasVerified && hasArtifactApproval,
    '/delivery': hasDeliveryPrepared && hasDeliveryApproval && hasBuildEvidence,
    '/readiness': missionStages[7].done,
    '/workflow': missionStages.every(stage => stage.done),
  }
  const stages = guidedWorkspaces.map((workspace, index) => {
    const state = derivePageState(workspace.path, workspaceEvidence, nextStage?.path, !!recovery, !!evidenceLoading)
    return { title: workspace.title, detail: workspace.purpose, done: state === 'COMPLETE', to: workspace.path, index, state }
  })
  const next = stages.find(stage => stage.to === nextStage?.path)
  const recorded = stages.filter(stage => stage.done).length
  const progress = Math.round(recorded / stages.length * 100)
  const status = nextStage?.note ?? 'All mission checkpoints have recorded evidence. Continue to Learning Engine to compare results; page inventory coverage is tracked separately.'
  return <WorkspaceLayout title="Mission Overview" eyebrow="NEXUS FORGE / CONTROL TOWER">
    <section className="workspace">
      {!evidenceLoading && <section className="glass-card research-card" aria-labelledby="getting-started-title" data-testid="account-mission-handoff">
        <div className="panel-title"><span>{mission ? 'CONTINUE YOUR MISSION' : 'WELCOME TO YOUR WORKSPACE'}</span><span className="live-pill">16 DEDICATED FEATURE PAGES</span></div>
        <h2 id="getting-started-title">{mission ? nextStage?.title ?? 'Review your verified outcome' : 'Start with one clear outcome'}</h2>
        <p>{mission ? nextStage?.note ?? 'Your mission checkpoints have recorded evidence. Review the result and capture what to use next time.' : 'Describe what you want to produce, who it is for, and how you will know it worked. Start in Mission Console; your saved progress will guide the next action on every page.'}</p>
        {!mission && <ol><li><strong>Define your mission.</strong> Give it a title, a concrete deliverable, constraints, a success measure and a spend cap.</li><li><strong>Review the contract.</strong> Confirm the saved scope and authority before planning.</li><li><strong>Follow your next action.</strong> The guide uses saved evidence to lead through planning, research, building, delivery and learning.</li></ol>}
        <div className="hero-actions"><Link className="primary-button" to={mission ? nextStage?.path ?? '/learning' : '/mission'}>{mission ? 'Continue next action →' : 'Define my first mission →'}</Link><Link className="secondary-button" to="/workflow">See the full guide →</Link>{!mission && <Link className="ghost-button" to="/mission">Select an existing mission →</Link>}</div>
        <p className="muted-copy">The 16-page product guide and mission checkpoints work together. Opening a page does not mark a task complete; saved evidence records progress.</p>
      </section>}
      <div className="hero-grid"><div className="hero-copy"><div className="eyebrow"><span /> GOVERNED INTELLIGENCE OS</div><h2>From intent to <em>verified outcome.</em></h2><p className="hero-text">Every capability has its own page. Mission state is shared across workspaces, and downstream actions remain gated until prerequisites are recorded.</p><div className="hero-actions"><Link className="primary-button" to={mission ? nextStage?.path ?? '/learning' : '/mission'}>{mission ? 'Continue next mission action' : 'Create first mission'} ↗</Link><Link className="secondary-button" to="/portfolio">Portfolio intelligence →</Link></div></div><div className="glass-card research-card"><div className="panel-title"><span>ACTIVE MISSION</span><span className="live-pill">LIVE STATE</span></div>{evidenceLoading ? <p role="status">Loading selected mission…</p> : mission ? <><h3>{mission.title}</h3><p>{mission.mission}</p><div className="decision-line"><span>MISSION STATUS</span><strong>{mission.status.toUpperCase()}</strong></div><div className="decision-line"><span>HUMAN APPROVAL</span><strong>{mission.approved ? 'APPROVED' : 'PENDING'}</strong></div><div className="decision-line"><span>SPEND CAP</span><strong>${mission.budget}</strong></div></> : <><h3>No active mission</h3><p>Create a mission contract to start the ordered workflow.</p><Link className="primary-button" to="/mission">Open Mission Console →</Link></>}</div></div>
      <div className="stats-strip"><div><strong>{evidenceLoading ? '…' : progress + '%'}</strong><span>Workspace stages recorded</span></div><div><strong>{agents.length}</strong><span>Agent runs</span></div><div><strong>{research.length}</strong><span>Research records</span></div><div><strong>{artifacts.length}</strong><span>Artifacts</span></div><div><strong>{deliveries.length}</strong><span>Delivery records</span></div></div>
      <div className="glass-card research-card"><div className="workflow-guide-head"><div><div className="section-kicker">ORDERED EXECUTION</div><h2>Next step</h2><p>{evidenceLoading ? 'Loading mission evidence…' : status}</p><p className="muted-copy">All 16 dedicated pages are listed below. Complete counts use saved mission evidence. Linked intelligence sources show draft provenance, not execution or verified outcomes. Reference and optional pages are available without being required checkpoints. Follow the mission recommendation above for required execution.</p></div><div className="workflow-progress"><strong>{evidenceLoading ? '…' : recorded}/{stages.length}</strong><span>stages recorded</span></div></div>
        {evidenceLoading ? <div className="workflow-next" role="status">Loading saved mission progress…</div> : next ? <div className="workflow-next"><div className="workflow-next-number">{stages.indexOf(next) + 1}</div><div className="workflow-next-copy"><span className="workflow-eyebrow">NEXT MISSION ACTION</span><h3>{nextStage?.title}</h3><p>{nextStage?.note}</p></div><Link className="primary-button" to={next.to}>Open stage →</Link></div> : <div className="workflow-next workflow-finished"><div className="workflow-next-number">✓</div><div className="workflow-next-copy"><span className="workflow-eyebrow">EVIDENCE RECORDED</span><h3>Mission checkpoints recorded</h3><p>The mission checklist is complete. Optional and informational pages are separate from outcome evidence.</p></div><Link className="secondary-button" to="/learning">Continue to Learning Engine →</Link></div>}
        <div className="workflow-step-list">{stages.map((stage, index) => { const nextStage = stages[index + 1]; return <div className={'workflow-step ' + (stage.done ? 'is-done' : next === stage ? 'is-current' : '')} key={stage.to}><span className="workflow-step-mark">{stage.done ? '✓' : String(index + 1).padStart(2, '0')}</span><span className="workflow-step-copy"><strong>{stage.title}</strong><small>{stage.detail}</small></span><span className="workflow-step-state">{stage.state}</span><span className="workflow-tour-links"><Link className="primary-button small" to={stage.to}>Open step →</Link>{nextStage ? <Link className="ghost-button" to={nextStage.to}>Next: {nextStage.title} →</Link> : <Link className="ghost-button" to="/workflow">Tour complete · Review guide →</Link>}</span></div> })}</div>
      </div>
      <div className="glass-card research-card"><h2>Six expanded capabilities</h2><p>Dedicated pages for collaboration, developer contracts and controlled research. These extend the product without adding required mission checkpoints.</p><div className="hero-actions">{expansionPages.map(p=><Link className="secondary-button" to={p.path} key={p.path}>{p.title} →</Link>)}</div></div>
      <div className="console-grid"><Link className="glass-card research-card" to="/council"><div className="panel-title"><span>AI COUNCIL</span><span className="live-pill">{agents.length} RUNS</span></div><h3>Planning & execution</h3><p>Inspect agent runs, orchestration status, and blockers.</p></Link><Link className="glass-card research-card" to="/evidence"><div className="panel-title"><span>RESEARCH & MEMORY</span><span className="live-pill">{research.length} RECORDS</span></div><h3>Evidence first</h3><p>Run cited research and inspect stored mission evidence.</p></Link><Link className="glass-card research-card" to="/artifacts"><div className="panel-title"><span>ARTIFACT FORGE</span><span className="live-pill">{artifacts.length} ARTIFACTS</span></div><h3>Create and verify</h3><p>Generate drafts, run quality checks, and record human approval.</p></Link><Link className="glass-card research-card" to="/delivery"><div className="panel-title"><span>DELIVERY PIPELINE</span><span className="live-pill">{deliveries.length} RECORDS</span></div><h3>Build and delivery evidence</h3><p>Explicitly approve external delivery and inspect persisted workflow evidence.</p></Link></div>
    </section>
  </WorkspaceLayout>
}
