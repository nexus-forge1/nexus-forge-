import { assessBlueprint } from '../../convex/blueprintCompleteness'
import { BlueprintCompleteness } from '../components/blueprint-completeness'
import { OpportunityContext } from '../components/opportunity-context'
import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { WorkspaceLayout } from '../components/workspace-layout'
import { getCompleteReceiptStrategies, getReceiptStrategyRows } from '../lib/manifest-receipt'

export const Route = createFileRoute('/manifest')({ head: () => routeHead("/manifest"), component: ManifestIntelligencePage })

type SavedBlueprint = {
  _id: string
  key: string
  value: string
  confidence: number
  source: string
}

function readBlueprint(row: SavedBlueprint) {
  try {
    const parsed = JSON.parse(row.value) as { intent?: string; domain?: string; blueprint?: string; horizon?: string; budget?: number; constraints?: string; acceptanceCriteria?: string }
    return { intent: parsed.intent ?? 'Saved blueprint', domain: parsed.domain ?? 'General', blueprint: parsed.blueprint ?? row.value, horizon: parsed.horizon ?? 'Not specified', budget: parsed.budget ?? 0, constraints: parsed.constraints ?? '', acceptanceCriteria: parsed.acceptanceCriteria ?? '' }
  } catch {
    return { intent: 'Saved blueprint', domain: 'General', blueprint: row.value, horizon: 'Not specified', budget: 0, constraints: '', acceptanceCriteria: '' }
  }
}

function ManifestIntelligencePage() {
  const synthesize = useAction(api.manifestIntelligence.synthesize)
  const savedRows = useQuery(api.manifestIntelligence.listBlueprints, {})
  const strategyRows = useQuery(api.manifestIntelligence.listStrategies, {})
  const researchEvidenceRows = useQuery(api.manifestIntelligence.listResearchEvidence, {})
  const providerUsageRows = useQuery(api.manifestIntelligence.listProviderUsage, {})
  const experimentRows = useQuery(api.learningEngine.listExperiments, {})
  const recordOutcome = useMutation(api.manifestIntelligence.recordStrategyOutcome)
  const attachAssumptionEvidence = useMutation(api.manifestIntelligence.attachAssumptionEvidence)
  const [selectedStrategyId, setSelectedStrategyId] = useState('')
  const [assumptionEvidenceType, setAssumptionEvidenceType] = useState<'supports' | 'contradicts' | 'inconclusive'>('supports')
  const [assumptionEvidenceUrl, setAssumptionEvidenceUrl] = useState('')
  const [assumptionEvidenceNote, setAssumptionEvidenceNote] = useState('')
  const [sourcePublishedDate, setSourcePublishedDate] = useState('')
  const [sourceAuthority, setSourceAuthority] = useState<'official_primary' | 'peer_reviewed' | 'reputable_reporting' | 'industry_source' | 'other'>('official_primary')
  const [assumptionEvidenceRelevance, setAssumptionEvidenceRelevance] = useState('')
  const [assumptionClaimMatch, setAssumptionClaimMatch] = useState<'matches_claim' | 'partially_matches' | 'does_not_match' | 'not_reviewed'>('not_reviewed')
  const [assumptionEvidenceBusy, setAssumptionEvidenceBusy] = useState(false)
  const [outcomeStatus, setOutcomeStatus] = useState<'succeeded' | 'partial' | 'failed' | 'inconclusive'>('succeeded')
  const [actualResult, setActualResult] = useState('')
  const [outcomeEvidence, setOutcomeEvidence] = useState('')
  const [actualCost, setActualCost] = useState('')
  const [intent, setIntent] = useState('Create a new AI venture that transforms a user idea into a working, tested digital product with a clear path to measurable value.')
  const [domain, setDomain] = useState('AI product / venture')
  const [budget, setBudget] = useState(25)
  const [horizon, setHorizon] = useState('14 days')
  const [constraints, setConstraints] = useState('Prefer existing NEXUS FORGE tools and free-tier resources where reliable; do not expose secrets or execute consequential external actions without approval.')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('Deliverable is usable, key claims are supported by evidence, tests pass, and success can be measured against the stated goal.')
  const [blueprint, setBlueprint] = useState('')
  const [latestSynthesisKey, setLatestSynthesisKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcomeBusy, setOutcomeBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [strategiesOpened, setStrategiesOpened] = useState(false)

  const generate = async () => {
    setError('')
    setNotice('')
    if (intent.trim().length < 12) {
      setError('Describe the intended outcome in at least 12 characters.')
      return
    }
    setBusy(true)
    try {
      const result = await synthesize({ intent: intent.trim(), domain, budget, horizon, constraints: constraints.trim(), acceptanceCriteria: acceptanceCriteria.trim() })
      setBlueprint(result.blueprint)
      setLatestSynthesisKey(result.blueprintKey)
      setStrategiesOpened(false)
      setNotice(!assessBlueprint(result.blueprint).complete ? 'Incomplete AI draft saved with its usage receipts. Review the missing sections below; no extra inference is started automatically.' : result.saved ? result.strategyCount === 3 ? 'Blueprint saved privately with all three structured strategies. Next: verify this exact receipt below, then review the strategies.' : result.strategyCount > 0 ? `Blueprint saved privately; ${result.strategyCount} structured strateg${result.strategyCount === 1 ? 'y' : 'ies'} saved. Three are required. Next: inspect the receipt and retry if the ledger is incomplete.` : 'Blueprint saved privately, but no valid structured strategy records were returned. Next: inspect the receipt below; the workflow will not skip this missing evidence.' : 'Blueprint generated. Check the receipt before continuing.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Manifest synthesis failed. Check AI provider health and try again later.')
    } finally {
      setBusy(false)
    }
  }

  const history = (savedRows ?? []) as SavedBlueprint[]
  const strategies = (strategyRows ?? []) as Array<{ _id: string; key: string; value: string; confidence: number; source: string }>
  useEffect(() => {
    if (latestSynthesisKey || !savedRows || savedRows.length === 0) return
    const latest = savedRows[0] as SavedBlueprint
    const item = readBlueprint(latest)
    setLatestSynthesisKey(latest.key)
    setIntent(item.intent)
    setDomain(item.domain)
    setBudget(item.budget)
    setHorizon(item.horizon)
    setConstraints(item.constraints)
    setAcceptanceCriteria(item.acceptanceCriteria)
    setBlueprint(item.blueprint)
  }, [latestSynthesisKey, savedRows])
  const latestReceiptBlueprint = latestSynthesisKey ? history.find(row => row.key === latestSynthesisKey) : undefined
  const latestReceiptStrategyRows = latestSynthesisKey ? getReceiptStrategyRows(strategies, latestSynthesisKey) : []
  const latestReceiptStrategies = latestSynthesisKey ? getCompleteReceiptStrategies(strategies, latestSynthesisKey) : []
  const blueprintCheck = assessBlueprint(blueprint)
  const canHandoff = !!latestReceiptBlueprint && latestReceiptStrategies.length === 3 && blueprintCheck.complete && readBlueprint(latestReceiptBlueprint).blueprint === blueprint
  const experiments = (experimentRows ?? []) as Array<{ _id: string; _creationTime: number; key: string; value: string; confidence: number; source: string }>
  const strategyContext = strategies.map(row => {
    let item: Record<string, unknown> = {}
    try { item = JSON.parse(row.value) as Record<string, unknown> } catch { item = {} }
    return {
      id: row._id,
      name: String(item.name ?? 'Candidate strategy'),
      prerequisites: String(item.prerequisites ?? '').trim(),
      assumptions: String(item.unverifiedAssumptions ?? '').trim(),
      failureMode: String(item.failureMode ?? '').trim(),
      evidence: Array.isArray(item.assumptionEvidence) ? item.assumptionEvidence.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')) : [],
      measured: typeof item.actualResult === 'string' && item.actualResult.trim().length > 0 && typeof item.evidence === 'string' && item.evidence.trim().length > 0,
    }
  })
  const unresolvedAssumptionCount = strategyContext.filter(item => item.assumptions && !item.measured).length
  const saveAssumptionEvidence = async () => {
    setError('')
    setNotice('')
    if (!selectedStrategyId) {
      setError('Select a strategy before attaching assumption evidence.')
      return
    }
    if (assumptionEvidenceNote.trim().length < 3) {
      setError('Explain how the source relates to the assumption.')
      return
    }
    if (assumptionEvidenceRelevance.trim().length < 3) {
      setError('Explain why the source is relevant to the specific claim.')
      return
    }
    if (sourcePublishedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(sourcePublishedDate) || Number.isNaN(Date.parse(sourcePublishedDate)) || new Date(sourcePublishedDate).toISOString().slice(0, 10) !== sourcePublishedDate)) {
      setError('Enter a real publication date in YYYY-MM-DD format, or leave it blank if unknown.')
      return
    }
    try {
      const parsedUrl = new URL(assumptionEvidenceUrl.trim())
      if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
        setError('Use a public HTTPS source URL without embedded credentials.')
        return
      }
    } catch {
      setError('Enter a valid HTTPS source URL.')
      return
    }
    setAssumptionEvidenceBusy(true)
    try {
      await attachAssumptionEvidence({
        strategyId: selectedStrategyId as any,
        evidenceType: assumptionEvidenceType,
        url: assumptionEvidenceUrl.trim(),
        note: assumptionEvidenceNote.trim(),
        sourcePublishedDate: sourcePublishedDate.trim() || undefined,
        sourceAuthority,
        relevance: assumptionEvidenceRelevance.trim(),
        claimMatch: assumptionClaimMatch,
      })
      setNotice('Source reference and quality review saved. Authority and claim-match are operator assessments, not independent fact verification.')
      setAssumptionEvidenceUrl('')
      setAssumptionEvidenceNote('')
      setSourcePublishedDate('')
      setAssumptionEvidenceRelevance('')
      setAssumptionClaimMatch('not_reviewed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not attach assumption evidence.')
    } finally {
      setAssumptionEvidenceBusy(false)
    }
  }

  const saveOutcome = async () => {
    setError('')
    setNotice('')
    if (!selectedStrategyId) {
      setError('Select a strategy before recording its outcome.')
      return
    }
    if (actualResult.trim().length < 3 || outcomeEvidence.trim().length < 3) {
      setError('Enter the observed result and a concrete evidence reference before saving.')
      return
    }
    const cost = actualCost.trim() ? Number(actualCost) : undefined
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0 || cost > 1000000)) {
      setError('Actual cost must be a measured number between $0 and $1,000,000, or left blank.')
      return
    }
    setOutcomeBusy(true)
    try {
      await recordOutcome({ strategyId: selectedStrategyId as any, outcomeStatus, actualResult: actualResult.trim(), evidence: outcomeEvidence.trim(), ...(cost === undefined ? {} : { actualCost: cost }) })
      setNotice('Observed outcome saved with its evidence. This updates the record; it does not automatically prove the strategy caused the result.')
      setActualResult('')
      setOutcomeEvidence('')
      setActualCost('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save strategy outcome.') }
    finally { setOutcomeBusy(false) }
  }

  return <WorkspaceLayout title="Manifest Intelligence" eyebrow="RESEARCH FRONTIER / INTENT → POSSIBILITY">
    <section className="workspace">
      <div className="manifest-brief"><span className="section-kicker">OUTCOME SYNTHESIS</span><p>Describe one result you want. NEXUS FORGE will draft a blueprint and save its evidence. Nothing is deployed or executed from this page.</p></div>

      <section className="glass-card research-card manifest-next-step" aria-live="polite" aria-labelledby="manifest-next-step-title">
        <div className="panel-title"><span id="manifest-next-step-title">YOUR NEXT STEP</span><span className="status-chip">STEP {latestSynthesisKey ? canHandoff ? strategiesOpened ? '4 OF 4' : '3 OF 4' : '2 OF 4' : '1 OF 4'}</span></div>
        {!latestSynthesisKey ? <><h3>1. Create the blueprint</h3><p>Start with the goal above. After synthesis, this guide will move to receipt verification automatically.</p><button className="primary-button" onClick={() => document.getElementById('manifest-intent')?.focus()}>Start with the outcome ↑</button></> : !canHandoff ? <><h3>2. Verify the exact receipt</h3><p>{latestReceiptBlueprint ? `Blueprint receipt found. ${latestReceiptStrategies.length} of 3 complete strategy records are confirmed for this exact synthesis.` : 'Waiting for the saved blueprint to appear in your private ledger.'} Do not continue to build until the receipt, required blueprint sections and all three complete strategy records are confirmed.</p><button className="primary-button" onClick={() => document.getElementById('manifest-live-check-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Check receipt evidence ↓</button></> : !strategiesOpened ? <><h3>3. Review the three strategies</h3><p>The exact blueprint and all three complete strategy records are now visible. Open the strategy ledger and compare the approaches before choosing what to build.</p><button className="primary-button" onClick={() => { const panel = document.getElementById('manifest-strategy-ledger'); if (panel instanceof HTMLDetailsElement) panel.open = true; setStrategiesOpened(true); requestAnimationFrame(() => panel?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>Review strategies ↓</button></> : <><h3>4. Continue the work</h3><p>Receipt checks passed and the strategy ledger has been opened. Carry the selected goal and blueprint into a governed mission; execution and external delivery remain governed by the existing workflow.</p><Link className="primary-button" to="/mission" onClick={() => { window.sessionStorage.setItem('nexus-forge-manifest-handoff', JSON.stringify({ intent, domain, budget, horizon, constraints, acceptanceCriteria, blueprint, sourceMemoryId: latestReceiptBlueprint?._id })); }}>Create a governed mission →</Link></>}
      </section>

      <div className="console-grid">
        <div className="glass-card research-card">
          <div className="panel-title"><span>INTENT COMPILER</span><span className="live-pill">BOUNDED AI RUN</span></div>
          <label htmlFor="manifest-intent">1. WHAT DO YOU WANT TO MAKE POSSIBLE?</label>
          <textarea id="manifest-intent" rows={4} maxLength={3000} value={intent} onChange={e => setIntent(e.target.value)} placeholder="Describe the outcome, who it helps, and what success would look like." />
          <details className="manifest-settings"><summary>Optional planning settings <span>Defaults are already filled in</span></summary>
          <label htmlFor="manifest-domain">DOMAIN</label><select id="manifest-domain" value={domain} onChange={e => setDomain(e.target.value)}><option>AI product / venture</option><option>Software and automation</option><option>Creative media and art</option><option>Scientific research</option><option>Education and learning</option><option>Business operations</option><option>Personal project</option><option>Cross-domain exploration</option></select>
          <div className="field-grid"><div><label htmlFor="manifest-budget">BUDGET CAP · USD</label><input id="manifest-budget" type="number" min={0} max={500} value={budget} onChange={e => setBudget(Math.max(0, Math.min(500, Number(e.target.value))))} /></div><div><label htmlFor="manifest-horizon">TIME HORIZON</label><select id="manifest-horizon" value={horizon} onChange={e => setHorizon(e.target.value)}><option>48 hours</option><option>7 days</option><option>14 days</option><option>30 days</option><option>90 days</option><option>Exploratory / no fixed deadline</option></select></div></div>
          <label htmlFor="manifest-constraints">CONSTRAINTS & ASSUMPTIONS</label><textarea id="manifest-constraints" rows={3} maxLength={2000} value={constraints} onChange={e => setConstraints(e.target.value)} placeholder="Budget limits, existing stack, access restrictions, privacy or safety requirements…" />
          <label htmlFor="manifest-criteria">MEASURABLE ACCEPTANCE CRITERIA</label><textarea id="manifest-criteria" rows={3} maxLength={2000} value={acceptanceCriteria} onChange={e => setAcceptanceCriteria(e.target.value)} placeholder="What must be true for this mission to count as successful?" />
          </details>
          <button className="primary-button" disabled={busy} onClick={() => void generate()}>{busy ? 'Synthesizing blueprint…' : 'Synthesize a new blueprint ↗'}</button>
          <p className="muted-copy">Uses the configured NEXUS FORGE AI provider router. Output is saved to your authenticated workspace memory. No deployment, external write, or purchase is triggered.</p>
          {error && <p className="warning" role="alert">{error}</p>}
          {notice && <p className="receipt" role="status">{notice}</p>}
        </div>
        <div className="glass-card research-card">
          <div className="panel-title"><span>BLUEPRINT OUTPUT</span><span className="live-pill">{blueprint ? blueprintCheck.complete ? 'DRAFT SECTIONS PRESENT' : 'INCOMPLETE DRAFT' : 'AWAITING INTENT'}</span></div>
          {blueprint ? <><BlueprintCompleteness blueprint={blueprint}/><div className="decision-line"><span>STATUS</span><strong>AI-GENERATED PROPOSAL</strong></div><div className="manifest-blueprint" aria-label="Generated blueprint">{blueprint}</div><div className="hero-actions"><button className="secondary-button" onClick={() => { void navigator.clipboard?.writeText(blueprint).then(() => setNotice('Blueprint copied to clipboard.')).catch(() => setError('Clipboard access was unavailable. Select and copy the blueprint text manually.')) }}>Copy blueprint</button>{canHandoff ? <Link className="secondary-button" to="/mission" onClick={() => { window.sessionStorage.setItem('nexus-forge-manifest-handoff', JSON.stringify({ intent, domain, budget, horizon, constraints, acceptanceCriteria, blueprint, sourceMemoryId: latestReceiptBlueprint?._id })); }}>Create a governed mission →</Link> : <p>Complete the required blueprint sections and exact receipt checks before guided mission handoff.</p>}</div></> : <div className="empty-state"><h3>Your next possibility starts here.</h3><p>Generate a blueprint to receive a concrete design, first experiment, architecture, guardrails, success metrics, and a practical next action.</p></div>}
        </div>
      </div>

      <details className="manifest-secondary"><summary>Advanced · AI provider usage receipts</summary>
      <div className="glass-card research-card" aria-labelledby="manifest-provider-usage-title">
        <div className="panel-title"><span id="manifest-provider-usage-title">AI PROVIDER USAGE LEDGER</span><span className="live-pill">{providerUsageRows?.length ?? 0} RECORDS</span></div>
        <p className="muted-copy">Private usage metadata from successful Manifest provider responses. Token counts and costs appear only when the provider returns them; missing cost data is not treated as $0 and no estimated spend is presented as actual billing.</p>
        {providerUsageRows === undefined ? <p>Loading provider usage…</p> : providerUsageRows.length === 0 ? <p className="empty-state">No provider usage receipts recorded yet. After a successful Manifest synthesis, any usage metadata returned by the selected provider will appear here.</p> : providerUsageRows.map(row => <article className="workflow-step" key={row._id}>
          <span className="workflow-step-mark">AI</span>
          <span className="workflow-step-copy"><strong>{row.provider} · {row.model}</strong><small>{new Date(row.capturedAt).toLocaleString()} · Total tokens: {row.totalTokens == null ? 'Not reported' : row.totalTokens.toLocaleString()}</small><small>Input: {row.promptTokens == null ? 'Not reported' : row.promptTokens.toLocaleString()} · Output: {row.completionTokens == null ? 'Not reported' : row.completionTokens.toLocaleString()}</small></span>
          <span className="workflow-step-state">{row.reportedCostUsd == null ? 'COST NOT REPORTED' : 'PROVIDER-REPORTED COST'}{row.reportedCostUsd == null ? null : <small>${row.reportedCostUsd.toFixed(6)} USD</small>}</span>
        </article>)}
      </div>
      </details>

      <div className="glass-card research-card" id="manifest-receipt-evidence" aria-labelledby="manifest-live-check-title">
        <div className="panel-title"><span id="manifest-live-check-title">LIVE PROVIDER VERIFICATION</span><span className="status-chip">{latestSynthesisKey ? latestReceiptBlueprint ? latestReceiptStrategies.length === 3 ? "FULL RECEIPT" : latestReceiptStrategyRows.length > 0 ? "PARTIAL LEDGER" : "BLUEPRINT ONLY" : "VERIFYING LEDGER" : "OPERATOR ACTION REQUIRED"}</span></div>
        <p className="muted-copy">Automated tests cover successful persistence, privacy isolation, malformed strategy output, and provider outages. They do not substitute for a real configured-provider call in your signed-in production workspace.</p>
        <div className="workflow-step-list">
          <article className="workflow-step"><span className="workflow-step-mark">1</span><span className="workflow-step-copy"><strong>Run a real synthesis</strong><small>Use the intent compiler above while signed in. The action uses the currently configured healthy-provider route and does not deploy or purchase anything.</small></span></article>
          <article className="workflow-step"><span className="workflow-step-mark">2</span><span className="workflow-step-copy"><strong>Check the live receipt</strong><small>A successful response should say the blueprint was saved privately and report the structured strategy count. A provider error is a failed run, not a success.</small></span></article>
          <article className="workflow-step"><span className="workflow-step-mark">3</span><span className="workflow-step-copy"><strong>Confirm the private ledger</strong><small>Verify the new blueprint and strategy entries appear in this operator's history. Do not mark the live-provider milestone complete until both the receipt and persisted records are visible.</small></span></article>
        </div>
        {latestSynthesisKey ? <div className="workflow-step-list"><article className={`workflow-step ${latestReceiptBlueprint ? "is-done" : "is-current"}`}><span className="workflow-step-mark">{latestReceiptBlueprint ? "✓" : "1"}</span><span className="workflow-step-copy"><strong>{latestReceiptBlueprint ? "Exact blueprint receipt found in this operator ledger" : "Waiting for the exact blueprint record"}</strong><small>Receipt key: {latestSynthesisKey}</small></span><span className="workflow-step-state">{latestReceiptBlueprint ? "CONFIRMED" : "PENDING"}</span></article><article className={`workflow-step ${latestReceiptStrategies.length > 0 ? "is-done" : "is-current"}`}><span className="workflow-step-mark">{latestReceiptStrategies.length > 0 ? "✓" : "2"}</span><span className="workflow-step-copy"><strong>{latestReceiptStrategies.length === 3 ? "All three complete strategy records found for this exact synthesis" : latestReceiptStrategies.length > 0 ? `${latestReceiptStrategies.length} complete strategy record(s) found; three are required` : latestReceiptStrategyRows.length > 0 ? "Matching strategy rows exist, but none passed completeness checks" : "No strategy records found for this synthesis"}</strong><small>Receipt verification requires the exact strategy slots 1–3 and every required non-empty strategy field—not merely a matching key prefix.</small></span><span className="workflow-step-state">{latestReceiptStrategies.length === 3 ? "CONFIRMED" : "NOT CONFIRMED"}</span></article></div> : null}
        <p className="muted-copy">Current evidence status: automated persistence tests pass; production provider-to-ledger execution is not yet independently confirmed until a signed-in operator runs synthesis. {latestSynthesisKey ? latestReceiptBlueprint && latestReceiptStrategies.length === 3 ? "This session now has direct UI evidence that the exact blueprint and all three complete strategy records appeared in the operator-scoped ledger." : "This session has a synthesis receipt, but the exact blueprint plus all three complete strategy records are required before persistence is verified." : "No live synthesis has been run from this page session yet."}</p>
      </div>

      <details className="manifest-secondary"><summary>Advanced · System architecture and roadmap</summary>
      <div className="glass-card research-card">
        <div className="panel-title"><span>MANIFEST INTELLIGENCE · SYSTEM ARCHITECTURE</span><span className="live-pill">IMPLEMENTATION MAP</span></div>
        <p className="muted-copy">The long-term design is a governed operating system for goals: turn intent into artifacts, independently verify what happened, and use measured outcomes to improve the next attempt. These are implementation states, not claims of AGI or superintelligence.</p>
        <div className="workflow-step-list">
          {[
            { n: '01', title: 'Intent compiler', status: 'BASE EXISTS', detail: 'Translate a goal into constraints, budget, acceptance criteria, and a proposed strategy.', state: 'present' },
            { n: '02', title: 'World model & evidence context', status: 'PARTIAL', detail: 'Track facts, assumptions, dependencies, uncertainty, and changes using sourced project records.', state: 'partial' },
            { n: '03', title: 'Strategy & experiment planner', status: 'PARTIAL', detail: 'Compare candidate approaches, cost, risk, and the smallest useful next experiment.', state: 'partial' },
            { n: '04', title: 'Execution workspace', status: 'PARTIAL', detail: 'Coordinate research, coding, design, artifact creation, tests, and governed delivery.', state: 'partial' },
            { n: '05', title: 'Independent verification', status: 'PARTIAL', detail: 'Check artifacts and deployment evidence independently; report failures and unknowns without treating generated text as proof.', state: 'partial' },
            { n: '06', title: 'Persistent memory & verified learning', status: 'PARTIAL', detail: 'Preserve decisions, artifacts, failures, and reusable methods with evidence provenance.', state: 'partial' },
            { n: '07', title: 'Governance & permissions', status: 'BASE EXISTS', detail: 'Retain authentication, approval gates, auditability, and bounded external actions.', state: 'present' },
            { n: '08', title: 'Economy & resource intelligence', status: 'PARTIAL', detail: 'Make estimated and measured model/tool costs visible, enforce budget limits, and compare value against outcomes.', state: 'partial' },
          ].map(layer => <article className={`workflow-step ${layer.state === 'present' ? 'is-done' : 'is-current'}`} key={layer.n}>
            <span className="workflow-step-mark">{layer.n}</span>
            <span className="workflow-step-copy"><strong>{layer.title}</strong><small>{layer.detail}</small></span>
            <span className="workflow-step-state">{layer.status}</span>
          </article>)}
        </div>
        <div className="panel-title"><span>THE CLOSED OUTCOME LOOP</span><span className="status-chip">TARGET BEHAVIOR</span></div>
        <p className="manifest-blueprint">Intent → specification → competing plans → approved execution → independent tests → deployment evidence → real-world outcome measurement → evidence-backed improvement.</p>
        <p className="muted-copy">A successful build is not proof of market success. A deployed page is not proof of user value. Claims remain separated into verified, failed, and not-yet-measured.</p>
        <div className="panel-title"><span>EXPANSION PATH</span><span className="status-chip">SEQUENCED</span></div>
        <div className="workflow-step-list">
          {[
            ['1 · Artifact engine', 'Produce a usable artifact with repeatable tests.'],
            ['2 · Outcome engine', 'Connect artifacts to analytics and user feedback.'],
            ['3 · Cross-domain engine', 'Coordinate product, code, content, distribution, and monetization under one goal record.'],
            ['4 · Adaptive engine', 'Compare approved experiments and reuse only validated methods.'],
            ['5 · Ecosystem', 'Add third-party tools and agents after stable contracts and permissions exist.'],
            ['6 · Research frontier', 'Evaluate transfer to unfamiliar tasks using reproducible benchmarks; general intelligence remains a research goal, not a product claim.'],
          ].map(([title, detail]) => <article className="workflow-step" key={title}><span className="workflow-step-mark">→</span><span className="workflow-step-copy"><strong>{title}</strong><small>{detail}</small></span></article>)}
        </div>
      </div>
      </details>

      <OpportunityContext key={latestSynthesisKey} strategies={latestReceiptStrategyRows} />
      <details className="manifest-secondary"><summary>Advanced · Saved research evidence</summary>
      <div className="glass-card research-card" aria-labelledby="manifest-source-evidence-title">
        <div className="panel-title"><span id="manifest-source-evidence-title">SOURCE-BACKED RESEARCH CONTEXT</span><span className="live-pill">{researchEvidenceRows?.length ?? 0} RECORDS</span></div>
        <p className="muted-copy">Research Oracle results saved to missions you own, with retrieved citation URLs and mission provenance. AI summaries are interpretations of the listed sources, not primary sources themselves. Only HTTPS citation URLs are shown; check source content and dates before relying on them.</p>
        {researchEvidenceRows === undefined ? <p>Loading your saved research evidence…</p> : researchEvidenceRows.length === 0 ? <p className="empty-state">No saved Research Oracle records are available for your missions yet. Use Research & Memory to collect source-backed research; results will appear here when saved to an owned mission.</p> : researchEvidenceRows.map(row => <article className="workflow-step" key={row._id}>
          <span className="workflow-step-mark">R</span>
          <span className="workflow-step-copy"><strong>{row.query}</strong><small>Mission: {row.missionTitle} · Saved {new Date(row.createdAt).toLocaleString()}</small><small>{row.result}</small><small>Retrieved source references: {row.citations.length ? row.citations.join(' · ') : 'No valid HTTPS citations were saved with this record.'}</small></span>
          <span className="workflow-step-state">{row.citations.length} SOURCE URL{row.citations.length === 1 ? '' : 'S'}</span>
        </article>)}
      </div>
      </details>

      <details className="manifest-secondary"><summary>Advanced · Assumptions and dependencies</summary>
      <div className="glass-card research-card" aria-labelledby="manifest-context-register-title">
        <div className="panel-title"><span id="manifest-context-register-title">WORLD CONTEXT · ASSUMPTION & DEPENDENCY REGISTER</span><span className="status-chip">{unresolvedAssumptionCount} UNRESOLVED</span></div>
        <p className="muted-copy">This register organizes prerequisites, unverified assumptions, and failure modes already present in saved candidate strategies. Generated statements remain hypotheses until an operator attaches a concrete evidence reference and records an observed result; this is not independent web research or automatic fact verification.</p>
        {strategies.length === 0 ? <p className="empty-state">No structured strategies are available to build the context register. Synthesize a blueprint with valid strategy records first.</p> : strategyContext.map(item => <article className="workflow-step" key={item.id}>
          <span className="workflow-step-mark">{item.measured ? 'E' : '?'}</span>
          <span className="workflow-step-copy"><strong>{item.name}</strong><small>Prerequisites: {item.prerequisites || 'Not specified by the strategy proposal.'}</small><small>Unverified assumptions: {item.assumptions || 'None supplied; review the plan for missing assumptions.'}</small><small>Primary failure mode: {item.failureMode || 'Not specified by the strategy proposal.'}</small>
            {item.evidence.length ? item.evidence.map((entry, index) => <small key={index}>Assumption evidence · {String(entry.evidenceType ?? 'inconclusive').toUpperCase()}: <a href={String(entry.url ?? '')} target="_blank" rel="noreferrer noopener">{String(entry.url ?? 'Source')}</a> — {String(entry.note ?? '')} · Authority: {String(entry.sourceAuthority ?? 'not reviewed').replaceAll('_', ' ')} · Published: {String(entry.sourcePublishedDate ?? 'unknown')} · Claim match: {String(entry.claimMatch ?? 'not reviewed').replaceAll('_', ' ')} · Relevance: {String(entry.relevance ?? 'not reviewed')} · Reviewed: {typeof entry.reviewedAt === 'number' ? new Date(entry.reviewedAt).toLocaleDateString() : 'legacy record / not reviewed'} · Added: {typeof entry.addedAt === 'number' ? new Date(entry.addedAt).toLocaleDateString() : 'date not recorded'}</small>) : <small>No source references attached to this strategy yet.</small>}
          </span>
          <span className="workflow-step-state">{item.evidence.length ? `${item.evidence.length} SOURCE REFERENCE${item.evidence.length === 1 ? '' : 'S'}` : item.measured ? 'OUTCOME EVIDENCE ENTERED' : 'HYPOTHESIS · VERIFY'}</span>
        </article>)}
        <div className="field-grid">
          <div><label htmlFor="assumption-evidence-target">ASSUMPTION / STRATEGY</label><select id="assumption-evidence-target" value={selectedStrategyId} onChange={e => setSelectedStrategyId(e.target.value)}><option value="">Select a candidate strategy</option>{strategies.map(row => { let item: Record<string, unknown> = {}; try { item = JSON.parse(row.value) as Record<string, unknown> } catch { item = {} } return <option key={row._id} value={row._id}>{String(item.name ?? row.key)}</option> })}</select></div>
          <div><label htmlFor="assumption-evidence-type">EVIDENCE CLASSIFICATION</label><select id="assumption-evidence-type" value={assumptionEvidenceType} onChange={e => setAssumptionEvidenceType(e.target.value as typeof assumptionEvidenceType)}><option value="supports">Supports assumption</option><option value="contradicts">Contradicts assumption</option><option value="inconclusive">Inconclusive / mixed</option></select></div>
          <div><label htmlFor="assumption-evidence-url">SOURCE URL · HTTPS</label><input id="assumption-evidence-url" type="url" value={assumptionEvidenceUrl} onChange={e => setAssumptionEvidenceUrl(e.target.value)} placeholder="https://example.org/report" maxLength={2000} /></div>
          <div><label htmlFor="assumption-evidence-note">WHAT DOES THE SOURCE SAY?</label><textarea id="assumption-evidence-note" rows={2} value={assumptionEvidenceNote} onChange={e => setAssumptionEvidenceNote(e.target.value)} placeholder="Summarize the specific finding or passage relevant to the assumption." maxLength={1000} /></div>
          <div><label htmlFor="assumption-source-date">SOURCE PUBLICATION DATE (OPTIONAL)</label><input id="assumption-source-date" type="date" value={sourcePublishedDate} onChange={e => setSourcePublishedDate(e.target.value)} /></div>
          <div><label htmlFor="assumption-source-authority">SOURCE AUTHORITY (OPERATOR ASSESSMENT)</label><select id="assumption-source-authority" value={sourceAuthority} onChange={e => setSourceAuthority(e.target.value as typeof sourceAuthority)}><option value="official_primary">Official / primary source</option><option value="peer_reviewed">Peer-reviewed research</option><option value="reputable_reporting">Reputable reporting</option><option value="industry_source">Industry / practitioner source</option><option value="other">Other / unclear</option></select></div>
          <div><label htmlFor="assumption-source-relevance">RELEVANCE TO THE SPECIFIC CLAIM</label><textarea id="assumption-source-relevance" rows={2} value={assumptionEvidenceRelevance} onChange={e => setAssumptionEvidenceRelevance(e.target.value)} placeholder="Explain the scope, population, context, or limitation that makes this source relevant." maxLength={1000} /></div>
          <div><label htmlFor="assumption-claim-match">DOES THE SOURCE ACTUALLY MATCH THE CLAIM?</label><select id="assumption-claim-match" value={assumptionClaimMatch} onChange={e => setAssumptionClaimMatch(e.target.value as typeof assumptionClaimMatch)}><option value="not_reviewed">Not reviewed yet</option><option value="matches_claim">Directly matches the claim</option><option value="partially_matches">Partially matches / limited</option><option value="does_not_match">Does not support this claim</option></select></div>
        </div>
        <button className="primary-button" disabled={assumptionEvidenceBusy || !selectedStrategyId || assumptionEvidenceNote.trim().length < 3 || assumptionEvidenceRelevance.trim().length < 3 || !assumptionEvidenceUrl.trim()} onClick={() => void saveAssumptionEvidence()}>{assumptionEvidenceBusy ? 'Attaching evidence…' : 'Attach evidence and quality review'}</button>
        <p className="muted-copy">Quality-review rule: authority, publication date, relevance, and claim match are operator-entered assessments—not automated source verification. Check methodology, source text, and recency yourself. A URL alone is not proof. Evidence is stored on the selected private strategy record; latest 30 references are retained.</p>
      </div>

      </details>

      <details className="manifest-secondary" id="manifest-strategy-ledger"><summary>Step 3 · Review strategies and record outcomes</summary>
      <div className="glass-card research-card">
        <div className="panel-title"><span>STRATEGY & OUTCOME LEDGER</span><span className="live-pill">{strategies.length} RECORDS</span></div>
        <p className="muted-copy">Structured strategies are saved separately from blueprint prose. Record observed outcomes only after an experiment has run, and attach a measurement source or evidence reference. Estimated value is not actual value.</p>
        {strategies.length === 0 ? <p className="empty-state">No structured strategy records yet. A blueprint save does not guarantee strategy persistence: each synthesis receipt now reports whether valid machine-readable strategies were returned and saved.</p> : strategies.map(row => {
          let item: Record<string, unknown> = {}
          try { item = JSON.parse(row.value) as Record<string, unknown> } catch { item = {} }
          return <article className="workflow-step" key={row._id}>
            <span className="workflow-step-mark">↗</span>
            <span className="workflow-step-copy"><strong>{String(item.name ?? 'Candidate strategy')}</strong><small>{String(item.mechanism ?? '')}</small><small>Evidence horizon: {String(item.timeToEvidence ?? 'Not specified')} · Latest outcome: {String(item.outcomeStatus ?? 'not_measured')}</small>
              {item.actualResult ? <small>Latest observed: {String(item.actualResult)} · Evidence: {String(item.evidence ?? 'Not supplied')} · Actual cost: {item.actualCost == null ? 'Not recorded' : '$' + String(item.actualCost)}</small> : null}
              {Array.isArray(item.outcomeHistory) && item.outcomeHistory.length > 1 ? <small>Outcome history ({(item.outcomeHistory as unknown[]).length} saved, latest 20): {([...(item.outcomeHistory as unknown[])].reverse()).map((entry, index) => { const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}; return `#${(item.outcomeHistory as unknown[]).length - index} ${String(record.outcomeStatus ?? 'unknown')} — ${String(record.actualResult ?? 'No result')} [${String(record.evidence ?? 'No evidence')}]` }).join(' · ')}</small> : null}
            </span>
            <span className="workflow-step-state">{row.source === 'manifest-intelligence-operator-measured-outcome' ? 'OUTCOME RECORDED' : 'PROPOSED'}</span>
          </article>
        })}
        {strategies.length > 0 ? <div className="field-grid">
          <div><label htmlFor="strategy-outcome-target">STRATEGY TO UPDATE</label><select id="strategy-outcome-target" value={selectedStrategyId} onChange={e => setSelectedStrategyId(e.target.value)}><option value="">Select a candidate strategy</option>{strategies.map(row => { let item: Record<string, unknown> = {}; try { item = JSON.parse(row.value) as Record<string, unknown> } catch { item = {} } return <option key={row._id} value={row._id}>{String(item.name ?? row.key)}</option> })}</select></div>
          <div><label htmlFor="strategy-outcome-status">OBSERVED OUTCOME</label><select id="strategy-outcome-status" value={outcomeStatus} onChange={e => setOutcomeStatus(e.target.value as typeof outcomeStatus)}><option value="succeeded">Succeeded</option><option value="partial">Partially succeeded</option><option value="failed">Failed</option><option value="inconclusive">Inconclusive</option></select></div>
          <div><label htmlFor="strategy-actual-result">ACTUAL RESULT / METRIC</label><textarea id="strategy-actual-result" rows={2} value={actualResult} onChange={e => setActualResult(e.target.value)} maxLength={2000} placeholder="Observed result, baseline → actual, sample size…" /></div>
          <div><label htmlFor="strategy-outcome-evidence">EVIDENCE SOURCE</label><textarea id="strategy-outcome-evidence" rows={2} value={outcomeEvidence} onChange={e => setOutcomeEvidence(e.target.value)} maxLength={3000} placeholder="Test run, analytics report, URL, measurement ID, or reproducible notes…" /></div>
          <div><label htmlFor="strategy-actual-cost">ACTUAL COST · USD (OPTIONAL)</label><input id="strategy-actual-cost" type="number" min={0} max={1000000} value={actualCost} onChange={e => setActualCost(e.target.value)} placeholder="Only enter measured spend" /></div>
        </div> : null}
        {strategies.length > 0 ? <button className="primary-button" disabled={outcomeBusy || !selectedStrategyId || actualResult.trim().length < 3 || outcomeEvidence.trim().length < 3 || (actualCost.trim() !== '' && (!Number.isFinite(Number(actualCost)) || Number(actualCost) < 0 || Number(actualCost) > 1000000))} onClick={() => void saveOutcome()}>{outcomeBusy ? 'Saving measured outcome…' : 'Save measured outcome'}</button> : null}
      </div>
      </details>

      <details className="manifest-secondary"><summary>Advanced · Linked experiment evidence</summary>
      <div className="glass-card research-card">
        <div className="panel-title"><span>LINKED EXPERIMENT EVIDENCE</span><span className="live-pill">{experiments.filter(row => { try { return Boolean((JSON.parse(row.value) as { linkedManifestStrategy?: { id?: string } }).linkedManifestStrategy?.id) } catch { return false } }).length} LINKED</span></div>
        <p className="muted-copy">Comparison records are linked by private strategy ID. Their measured metrics and evidence stay visible here; recording a comparison does not automatically change the strategy outcome or promote a candidate.</p>
        {experimentRows === undefined ? <p>Loading linked experiments…</p> : experiments.filter(row => { try { return Boolean((JSON.parse(row.value) as { linkedManifestStrategy?: { id?: string } }).linkedManifestStrategy?.id) } catch { return false } }).length === 0 ? <p className="empty-state">No linked experiments yet. In Verified Learning Engine, select a Manifest strategy when recording a baseline/candidate comparison.</p> : experiments.filter(row => { try { return Boolean((JSON.parse(row.value) as { linkedManifestStrategy?: { id?: string } }).linkedManifestStrategy?.id) } catch { return false } }).map(row => {
          let item: Record<string, unknown> = {}
          try { item = JSON.parse(row.value) as Record<string, unknown> } catch { item = {} }
          const linked = item.linkedManifestStrategy && typeof item.linkedManifestStrategy === 'object' ? item.linkedManifestStrategy as Record<string, unknown> : {}
          const metrics = Array.isArray(item.metrics) ? item.metrics as Array<Record<string, unknown>> : []
          const counts = item.counts && typeof item.counts === 'object' ? item.counts as Record<string, unknown> : {}
          const linkedStrategy = strategies.find(strategy => strategy._id === linked.id)
          let linkedOutcome: Record<string, unknown> = {}
          if (linkedStrategy) {
            try { linkedOutcome = JSON.parse(linkedStrategy.value) as Record<string, unknown> } catch { linkedOutcome = {} }
          }
          const outcomeStatus = typeof linkedOutcome.outcomeStatus === 'string' ? linkedOutcome.outcomeStatus : 'not_measured'
          const hasObservedOutcome = typeof linkedOutcome.actualResult === 'string' && linkedOutcome.actualResult.trim().length > 0
          const experimentDecision = typeof item.decision === 'string' ? item.decision : 'inconclusive'
          const reviewCue = !linkedStrategy
            ? 'Linked strategy record is unavailable in this private ledger; check the reference before drawing conclusions.'
            : !hasObservedOutcome
              ? 'Comparison is recorded, but no separate strategy outcome has been recorded yet.'
              : (experimentDecision === 'do-not-promote' && outcomeStatus === 'succeeded') || (experimentDecision === 'human-review-recommended' && outcomeStatus === 'failed')
                ? 'Cross-ledger review needed: the comparison recommendation and recorded strategy outcome point in different directions. Inspect the underlying evidence; neither record overrides the other.'
                : 'Both records are present. Review the metric evidence and observed outcome together; linkage alone does not establish causation or independent verification.'
          return <article className="workflow-step" key={row._id}>
            <span className="workflow-step-mark">↔</span>
            <span className="workflow-step-copy"><strong>{String(item.name ?? row.key)}</strong><small>Strategy: {String(linked.name ?? 'Linked Manifest strategy')} · Comparison decision: {experimentDecision}</small><small>Metrics: {metrics.map(metric => `${String(metric.label ?? metric.key ?? 'metric')}: ${String(metric.status ?? 'unrated')} (${String(metric.baseline ?? '?')} → ${String(metric.candidate ?? '?')} ${String(metric.unit ?? '')})`).join(' · ') || 'No metric details stored'}</small><small>Improved: {String(counts.improved ?? 0)} · Regressed: {String(counts.regressed ?? 0)} · Unchanged: {String(counts.unchanged ?? 0)}</small><small>Strategy outcome: {outcomeStatus.replaceAll('_', ' ')}{hasObservedOutcome ? ` · Observed: ${String(linkedOutcome.actualResult)} · Outcome evidence: ${String(linkedOutcome.evidence ?? 'Not supplied')}` : ''}</small><small>Cross-ledger review: {reviewCue}</small><small>Experiment evidence: {metrics.map(metric => String(metric.evidence ?? '')).filter(Boolean).join(' · ') || 'No evidence references stored'} · {new Date(row._creationTime).toLocaleString()}</small></span>
            <span className="workflow-step-state">{reviewCue.startsWith('Cross-ledger review needed') ? 'REVIEW NEEDED' : hasObservedOutcome ? 'OUTCOME LINKED' : 'OUTCOME PENDING'}</span>
          </article>
        })}
        <div className="hero-actions"><Link className="secondary-button" to="/learning">Open Verified Learning Engine →</Link></div>
      </div>
      </details>

      <details className="manifest-secondary"><summary>Advanced · Saved blueprint history</summary>
      <div className="glass-card research-card">
        <div className="panel-title"><span>PRIVATE BLUEPRINT MEMORY</span><span className="live-pill">{history.length} SAVED</span></div>
        <p className="muted-copy">Saved plans help preserve continuity. A saved plan is not proof that its proposed work has been executed or that its goals have been achieved.</p>
        {savedRows === undefined ? <p>Loading saved blueprints…</p> : history.length === 0 ? <p>No blueprints saved yet. Your first synthesis will appear here.</p> : history.map(row => {
          const item = readBlueprint(row)
          return <button key={row._id} className="portfolio-row" onClick={() => { setIntent(item.intent); setDomain(item.domain); setBudget(item.budget); setHorizon(item.horizon); setConstraints(item.constraints); setAcceptanceCriteria(item.acceptanceCriteria); setBlueprint(item.blueprint); setLatestSynthesisKey(row.key); setStrategiesOpened(false); setNotice('Loaded a saved blueprint. Review it before using it for a new mission.'); setError('') }}>
            <div className="portfolio-main"><strong>{item.intent}</strong><p>{item.domain} · {item.horizon} · budget cap ${item.budget}</p></div>
            <div className="portfolio-cell"><small>TYPE</small><b>BLUEPRINT</b></div>
            <div className="portfolio-cell"><small>CONFIDENCE</small><b>{Math.round(row.confidence * 100)}% RECORD</b></div>
          </button>
        })}
      </div>
      </details>
    </section>
  </WorkspaceLayout>
}
