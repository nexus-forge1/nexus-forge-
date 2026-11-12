import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { WorkspaceLayout } from '../components/workspace-layout'
import { routeHead } from '../lib/route-metadata'
import { masterFeatureRegister, registerCounts, registerLists, registerStatusNotes, registerStatusOptions, type RegisterList, type RegisterStatus } from '../lib/master-feature-register'

export const Route = createFileRoute('/feature-register')({ head: () => routeHead('/feature-register'), component: MasterFeatureRegisterPage })

function MasterFeatureRegisterPage() {
  const [query, setQuery] = useState('')
  const [listFilter, setListFilter] = useState<'All lists' | RegisterList>('All lists')
  const [statusFilter, setStatusFilter] = useState<'All statuses' | RegisterStatus>('All statuses')
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return masterFeatureRegister.filter((entry) => {
      const matchesList = listFilter === 'All lists' || entry.list === listFilter
      const matchesStatus = statusFilter === 'All statuses' || entry.status === statusFilter
      const matchesQuery = !needle || [entry.id, entry.name, entry.category, entry.description, entry.acceptance, entry.route, entry.source, entry.statusNote].some((value) => value.toLowerCase().includes(needle))
      return matchesList && matchesStatus && matchesQuery
    })
  }, [query, listFilter, statusFilter])

  const statusCounts = registerStatusOptions.map((status) => ({ status, count: masterFeatureRegister.filter((entry) => entry.status === status).length }))

  return <WorkspaceLayout title="Master Feature & Capability Register" eyebrow="NEXUS FORGE / IMPLEMENTATION TRACEABILITY">
    <section className="workspace">
      <div className="glass-card research-card">
        <div className="panel-title"><span>CATALOG SCOPE</span><span className="live-pill">{registerCounts.total} ENTRIES</span></div>
        <h2>One register. Five lists. No inflated completion claims.</h2>
        <p>This register reuses the project's existing workspace, roadmap, expansion and feature catalog sources. Entries intentionally overlap: the total is 82 catalog entries, not 82 unique independent capabilities.</p>
        <div className="stats-strip compact">
          <div><strong>{registerCounts.workspaces}</strong><span>Original workspaces</span></div>
          <div><strong>{registerCounts.milestones}</strong><span>Roadmap milestones</span></div>
          <div><strong>{registerCounts.expanded}</strong><span>Expanded areas</span></div>
          <div><strong>{registerCounts.productivity}</strong><span>Productivity</span></div>
          <div><strong>{registerCounts.portfolio}</strong><span>Portfolio features</span></div>
        </div>
        <p className="muted-copy">Status definitions: <strong>Complete / Partial / Deferred</strong> come from the existing roadmap's labels; <strong>Wired + tested</strong> means the route is wired to mapped Convex modules and covered by linked repository tests; <strong>Bounded starter</strong> adds that the catalog identifies working starter controls; <strong>Source present</strong> means catalog/route presence only. None of these labels by itself means production verified.</p>
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>FILTER THE REGISTER</span><span className="status-chip">{filtered.length} / {registerCounts.total} SHOWN</span></div>
        <div className="console-grid">
          <label>Search name, ID, description or route
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. backup, PF-01, /mission-graphs" aria-label="Search the feature register" />
          </label>
          <label>Catalog list
            <select value={listFilter} onChange={(event) => setListFilter(event.target.value as 'All lists' | RegisterList)} aria-label="Filter by catalog list">
              <option>All lists</option>
              {registerLists.map((list) => <option key={list} value={list}>{list}</option>)}
            </select>
          </label>
          <label>Recorded status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All statuses' | RegisterStatus)} aria-label="Filter by recorded status">
              <option>All statuses</option>
              {registerStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" type="button" onClick={() => { setQuery(''); setListFilter('All lists'); setStatusFilter('All statuses') }}>Reset filters</button>
          <Link className="secondary-button" to="/roadmap">Open milestone roadmap →</Link>
          <Link className="secondary-button" to="/capabilities">Open operational evidence →</Link>
        </div>
      </div>

      <div className="console-grid">
        {statusCounts.map(({ status, count }) => <div className="glass-card research-card" key={status}><div className="panel-title"><span>{status.toUpperCase()}</span><span className="status-chip">{count}</span></div><p>{registerStatusNotes[status]}</p></div>)}
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>FEATURE ENTRIES</span><span className="live-pill">EVIDENCE-FIRST</span></div>
        {filtered.length === 0 ? <p role="status">No entries match these filters. Reset the filters or search another term.</p> : <div className="workflow-step-list">
          {filtered.map((entry) => <article className="workflow-step" key={entry.id}>
            <span className="workflow-step-mark">{entry.id}</span>
            <div className="workflow-step-copy">
              <strong>{entry.name}</strong>
              <small>{entry.list} · {entry.category} · {entry.status}</small>
              <p>{entry.description}</p>
              <div className="hero-actions">
                <Link className="secondary-button small" to={entry.route as never}>Open related route: {entry.route} →</Link>
              </div>
              <details>
                <summary>Traceability, acceptance and remaining work</summary>
                <div className="decision-line"><span>STATUS BASIS</span><strong>{entry.statusNote}</strong></div>
                <div className="decision-line"><span>ACCEPTANCE CRITERIA</span><strong>{entry.acceptance}</strong></div>
                <div className="decision-line"><span>ROUTE / COMPONENT</span><strong>{entry.route}</strong></div>
                <div className="decision-line"><span>SOURCE LOCATION</span><strong>{entry.source}</strong></div>
                <div className="decision-line"><span>BACKEND FUNCTION / TABLE</span><strong>{entry.backend}</strong></div>
                <div className="decision-line"><span>INTEGRATION / DEPENDENCY</span><strong>{entry.integration}</strong></div>
                <div className="decision-line"><span>PERSISTENCE</span><strong>{entry.persistence}</strong></div>
                <div className="decision-line"><span>USER ACTIONS</span><strong>{entry.userActions}</strong></div>
                <div className="decision-line"><span>TEST EVIDENCE</span><strong>{entry.testEvidence}</strong></div>
                <div className="decision-line"><span>LIVE VERIFICATION</span><strong>{entry.liveVerification}</strong></div>
                <div className="decision-line"><span>REMAINING GAPS</span><strong>{entry.remainingGaps}</strong></div>
                <div className="decision-line"><span>OWNER</span><strong>{entry.owner}</strong></div>
                <div className="decision-line"><span>NEXT ACTION</span><strong>{entry.nextAction}</strong></div>
              </details>
            </div>
          </article>)}
        </div>}
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>VERIFICATION CONTRACT</span><span className="status-chip">NO FALSE PASSES</span></div>
        <p>Production readiness must be proven per workflow, not inferred from a route or passing general test suite. Close an entry only after its actual controls, authorized backend path, persisted state, integrations, negative/failure cases, acceptance tests and relevant Live behavior have been checked.</p>
        <p className="muted-copy">Every entry links its exact Convex backend trace, item-specific repository tests and a recorded 2026-10-22 public Live route probe of the published site. Status labels stay honest: <strong>Wired + tested</strong> proves route→backend wiring plus linked tests, and the probe proves only anonymous route availability — never end-to-end or feature acceptance. Per-entry authenticated journeys and scoped Live checks remain the recorded gap.</p>
        <div className="hero-actions"><Link className="primary-button" to="/workflow">Return to Guided Workflow →</Link><Link className="secondary-button" to="/incidents">Inspect incidents & recovery →</Link><Link className="secondary-button" to="/release-evidence">Review release evidence →</Link></div>
      </div>
    </section>
  </WorkspaceLayout>
}
