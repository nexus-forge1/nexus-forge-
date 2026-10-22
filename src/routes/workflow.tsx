import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from '@tanstack/react-router'
import { MissionControl } from '../components/mission-control'
import { WorkspaceLoading } from '../components/workspace-loading'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useMissionGuide } from '../lib/use-mission-guide'
import { guidedWorkspaces } from '../lib/workspaces'

export const Route = createFileRoute('/workflow')({ head: () => routeHead("/workflow"), component: WorkflowPage })

export function WorkflowPage() {
  const { missionId, mission, stages, nextStage, completed, evidenceLoading } = useMissionGuide()
  if (evidenceLoading) return <WorkspaceLoading title="Guided Workflow & Feature Guide" />
  return <WorkspaceLayout title="Guided Workflow & Feature Guide" eyebrow="OPERATOR HANDBOOK / START HERE">
    <section className="workspace">
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span /> ONE CLEAR ROUTE THROUGH THE PLATFORM</div>
          <h2>Know where to go, <em>why it matters, and what comes next.</em></h2>
          <p className="hero-text">Choose the mission checklist when you need the governed execution lifecycle, or follow the core feature tour in order, with specialist tools listed separately below. Every tour stop links directly to its page and points to the next stop. Optional workspaces can be skipped when they do not apply to a mission.</p>
          <div className="hero-actions"><Link className="primary-button" to={missionId ? (nextStage?.path ?? '/learning') : '/mission'}>{missionId ? 'Continue mission sequence →' : 'Start with Mission Console →'}</Link><a className="secondary-button" href="#full-platform-tour">Start full platform tour →</a><Link className="secondary-button" to="/roadmap">View build roadmap →</Link></div>
        </div>
        <div className="glass-card research-card">
          <div className="panel-title"><span>MISSION GUIDE</span><span className="live-pill">{completed}/{stages.length} RECORDED</span></div>
          <h3>{mission?.title ?? 'No active mission selected'}</h3>
          <p>{mission ? mission.mission : 'Choose or create a mission to see the state of its execution steps.'}</p>
          <div className="decision-line"><span>MISSION STATE</span><strong>{mission?.status?.toUpperCase() ?? 'NOT SELECTED'}</strong></div>
          <div className="decision-line"><span>NEXT STEP</span><strong>{nextStage?.title ?? 'Compare measured outcomes in Learning Engine'}</strong></div>
          <p className="muted-copy">This checklist reads saved state. It does not silently approve, resume, or dispatch work. Outcome measurement is a separate post-delivery activity.</p>
        </div>
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>MISSION EXECUTION · IN ORDER</span><span className="status-chip">9 GUIDED CHECKPOINTS</span></div>
        <p className="muted-copy">These are the mission lifecycle checkpoints, not the full list of product features. Some workspaces support multiple checkpoints, and not every mission needs every optional intelligence tool.</p>
        <div className="workflow-step-list">{stages.map((stage, index) => <article className={`workflow-step ${stage.done ? 'is-done' : nextStage === stage ? 'is-current' : ''}`} key={stage.title}>
          <span className="workflow-step-mark">{stage.done ? '✓' : index + 1}</span>
          <span className="workflow-step-copy"><strong>{stage.title}</strong><small>{stage.note}</small></span>
          <span className="workflow-step-state">{stage.done ? 'RECORDED' : nextStage === stage ? 'NEXT' : 'PENDING'}</span>
          <Link className="ghost-button" to={stage.path}>Open page →</Link>
        </article>)}</div>
      </div>

      <div className="glass-card research-card" id="full-platform-tour">
        <div className="panel-title"><span>FULL FEATURE GUIDE · IN ORDER</span><span className="live-pill">{guidedWorkspaces.length} PAGES</span></div>
        <p className="muted-copy">This guide includes all 16 product and support pages. Each feature keeps its own page and controls; specialist diagnostics are available in the support-tools section below. The guide uses the shared workspace registry. Page exploration does not mark mission evidence complete.</p>
        {[{ title: 'ALL FEATURE PAGES', intro: 'All 16 dedicated pages, in a recommended exploration order.', pages: guidedWorkspaces }].map((group) => <section key={group.title} className="workspace-tour-group">
          <div className="panel-title"><span>{group.title}</span><span className="live-pill">{group.pages.length} WORKSPACES</span></div>
          <p className="muted-copy">{group.intro}</p>
          <div className="workflow-step-list">{group.pages.map((page) => {
            const index = guidedWorkspaces.findIndex(item => item.path === page.path)
            const nextPage = guidedWorkspaces[index + 1]
            return <article className="workflow-step" key={page.path}>
              <span className="workflow-step-mark">{String(index + 1).padStart(2, '0')}</span>
              <span className="workflow-step-copy"><strong>{page.title}</strong><small>{page.purpose}</small><small><b>When to use:</b> {page.use}</small><small><b>Expected output:</b> {page.output}</small></span>
              <span className="workflow-tour-links"><Link className="primary-button small" to={page.path}>{page.path === '/workflow' ? 'Open this guide →' : 'Open workspace →'}</Link>{nextPage ? <Link className="ghost-button" to={nextPage.path}>Next: {nextPage.title} →</Link> : <Link className="ghost-button" to={guidedWorkspaces[0].path}>Tour complete · Start again ↻</Link>}</span>
            </article>
          })}</div>
        </section>)}
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>SPECIALIST SUPPORT TOOLS</span><span className="live-pill">ON DEMAND</span></div>
        <p className="muted-copy">These are supporting diagnostics, not extra steps in every mission. Open them only when the task calls for them.</p>
        <div className="hero-actions"><Link className="secondary-button" to="/capabilities">Capability & Reliability →</Link><Link className="secondary-button" to="/readiness">Launch Readiness →</Link><Link className="secondary-button" to="/incidents">Incident Center →</Link><Link className="secondary-button" to="/providers">AI Providers →</Link></div>
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>HOW TO AVOID GETTING LOST</span><span className="live-pill">OPERATING RULES</span></div>
        <div className="decision-line"><strong>One mission at a time</strong><span>Keep the selected mission context in view. If a page reports no mission, return to Mission Console and select/create one.</span></div>
        <div className="decision-line"><strong>Use the right kind of page</strong><span>Workflow explains the order; Roadmap tracks product development; Overview summarizes current mission state; each feature page owns its detailed controls.</span></div>
        <div className="decision-line"><strong>Follow evidence, not labels</strong><span>“Generated,” “saved,” “verified,” “approved,” “deployed,” and “measured” mean different things. Do not skip from a draft to a success claim.</span></div>
        <div className="decision-line"><strong>Failures go to recovery</strong><span>Open Incident Center for diagnosis. Governance-blocked runs stay in review until the proper operator decision is recorded.</span></div>
        <div className="decision-line"><strong>Learn only from measured outcomes</strong><span>Use Portfolio Intelligence and Verified Learning Engine after a real outcome exists. Suggestions and untested strategies remain advisory.</span></div>
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>RUNNER & OUTCOME CONTROL</span><span className="live-pill">PERSISTED EVIDENCE</span></div>
        <p>The controls below reflect persisted mission records. A timed-out or blocked run remains in review; this screen does not silently approve, resume, or dispatch external work.</p>
        {missionId ? <MissionControl missionId={missionId} /> : <p>Select a mission to load execution, incident, and outcome details.</p>}
      </div>
    </section>
  </WorkspaceLayout>
}
