import {operatorError} from '../lib/operator-error'
import {LearningEffectivenessReview} from '../components/learning-effectiveness-review'
import { routeHead } from '../lib/route-metadata'
import {RuntimeWorkbench} from '../components/runtime-workbench'
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { StrategyReuseOutcomes } from "../components/strategy-reuse-outcomes";
import { WorkspaceLayout } from "../components/workspace-layout";
import { deriveManifestOutcomeSignals } from "../lib/manifest-outcome-signals";
import { deriveStrategyComparisonSignals } from "../lib/strategy-comparison-signals";

export const Route = createFileRoute("/learning")({ head: () => routeHead("/learning"), component: LearningEnginePage });

type MetricDraft = {
  key: string;
  label: string;
  baseline: number;
  candidate: number;
  unit: string;
  direction: "higher" | "lower";
  evidence: string;
};

type SavedExperiment = { _id: string; _creationTime: number; key: string; value: string; confidence: number; source: string };

const initialMetrics: MetricDraft[] = [
  { key: "quality", label: "Quality score", baseline: 70, candidate: 72, unit: "score / 100", direction: "higher", evidence: "" },
  { key: "completion", label: "Task completion rate", baseline: 70, candidate: 75, unit: "%", direction: "higher", evidence: "" },
  { key: "runtime", label: "Runtime", baseline: 30, candidate: 28, unit: "minutes", direction: "lower", evidence: "" },
  { key: "cost", label: "Run cost", baseline: 4, candidate: 3.5, unit: "USD", direction: "lower", evidence: "" },
];

function LearningEnginePage() {
  const recordExperiment = useMutation(api.learningEngine.recordExperiment);
  const captureReviewedLesson = useMutation(api.memory.remember);
  const savedRows = useQuery(api.learningEngine.listExperiments, {});
  const manifestRows = useQuery(api.manifestIntelligence.listStrategies, {});
  const [name, setName] = useState("Strategy comparison");
  const [hypothesis, setHypothesis] = useState("The candidate strategy improves output quality and completion without increasing runtime or cost.");
  const [baselineLabel, setBaselineLabel] = useState("Current baseline");
  const [candidateLabel, setCandidateLabel] = useState("Candidate strategy");
  const [manifestStrategyId, setManifestStrategyId] = useState("");
  const [metrics, setMetrics] = useState<MetricDraft[]>(initialMetrics);
  const [baselineSafetyPass, setBaselineSafetyPass] = useState(false);
  const [candidateSafetyPass, setCandidateSafetyPass] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ decision: string; rationale: string; improved: number; regressed: number; unchanged: number } | null>(null);
  const [lessonStrategyId, setLessonStrategyId] = useState("");
  const [lessonText, setLessonText] = useState("");
  const [lessonApplicability, setLessonApplicability] = useState("");
  const [lessonEvidence, setLessonEvidence] = useState("");
  const [lessonBusy, setLessonBusy] = useState(false);
  const [lessonMessage, setLessonMessage] = useState("");
  const [savedLesson, setSavedLesson] = useState<{ id: string; text: string; applicability: string; references: string[] } | null>(null);

  const handoffSavedLesson = () => {
    if (!savedLesson) return;
    window.sessionStorage.setItem("nexus-forge-intelligence-handoff", JSON.stringify({
      sourceLabel: "Reviewed lesson", sourceMemoryId: savedLesson.id,
      intent: "Test and apply this reviewed lesson: " + savedLesson.text,
      domain: "Evidence-led improvement", budget: 25, horizon: "14 days",
      constraints: savedLesson.applicability,
      acceptanceCriteria: "Confirm applicability and compare a new measured outcome against a baseline.",
      blueprint: [savedLesson.text, "Applicability: " + savedLesson.applicability, "Evidence references:", ...savedLesson.references].join("\n"),
    }));
  };

  const saveReviewedLesson = async () => {
    setLessonMessage("");
    const references = lessonEvidence.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (!lessonStrategyId) { setLessonMessage("Choose the Manifest strategy this lesson belongs to."); return; }
    if (references.length < 2) { setLessonMessage("Add at least two evidence references on separate lines."); return; }
    setLessonBusy(true);
    try {
      const id = await captureReviewedLesson({
        category: "learning-lesson",
        key: "reviewed-lesson-pending",
        value: lessonText,
        confidence: 0.6,
        source: "operator-reviewed-manifest-learning",
        manifestStrategyId: lessonStrategyId as any,
        applicability: lessonApplicability,
        evidenceReferences: references,
      });
      setSavedLesson({ id, text: lessonText, applicability: lessonApplicability, references });
      setLessonMessage("Saved reviewed lesson. Future mission planning can retrieve it as advisory context.");
      setLessonText("");
      setLessonApplicability("");
      setLessonEvidence("");
    } catch (e) {
      setLessonMessage(operatorError(e,"Lesson save did not confirm. Review saved lessons before trying again."));
    } finally {
      setLessonBusy(false);
    }
  };

  const updateMetric = (index: number, field: keyof MetricDraft, value: string | number) => {
    setMetrics(current => current.map((metric, i) => i === index ? { ...metric, [field]: value } : metric));
  };

  const submit = async () => {
    setError("");
    setReceipt(null);
    if (metrics.some(metric => metric.evidence.trim().length < 8)) {
      setError("Add a measurement source, run ID, artifact reference, or a short explanation for every metric.");
      return;
    }
    setBusy(true);
    try {
      const result = await recordExperiment({
        name, hypothesis, baselineLabel, candidateLabel, metrics,
        baselineSafetyPass, candidateSafetyPass, notes,
        ...(manifestStrategyId ? { manifestStrategyId: manifestStrategyId as any } : {}),
      });
      setReceipt(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record this experiment.");
    } finally {
      setBusy(false);
    }
  };

  const history = (savedRows ?? []) as SavedExperiment[];
  return <WorkspaceLayout title="Verified Learning Engine" eyebrow="STAGE 04 / MEASURE → COMPARE → REVIEW">
    <section className="workspace">
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span /> EVIDENCE-LED IMPROVEMENT</div>
          <h2>Improve from <em>measured outcomes.</em></h2>
          <p className="hero-text">Compare a baseline with a candidate using the same metrics. The engine computes the result deterministically, stores the evidence references, and recommends review only when the stated conditions are met.</p>
          <div className="hero-actions"><Link className="secondary-button" to="/orchestrator">Intelligence Orchestrator →</Link><Link className="secondary-button" to="/evidence">Research & Memory →</Link></div>
        </div>
        <div className="glass-card research-card">
          <div className="panel-title"><span>LEARNING GUARDRAILS</span><span className="live-pill">HUMAN CONTROL</span></div>
          {["Compare the same metrics", "Require evidence references", "Flag safety regressions", "Persist each experiment", "Never auto-promote a candidate"].map((item, i) => <div className="decision-line" key={item}><span>0{i + 1}</span><strong>{item}</strong></div>)}
          <p className="muted-copy">Evidence links and notes are operator-provided until independently checked. A recorded result is not proof by itself.</p>
        </div>
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>BASELINE VS CANDIDATE</span><span className="live-pill">CONTROLLED COMPARISON</span></div>
        <label htmlFor="learning-name">EXPERIMENT NAME</label>
        <input id="learning-name" value={name} maxLength={120} onChange={e => setName(e.target.value)} />
        <label htmlFor="learning-hypothesis">TESTABLE HYPOTHESIS</label>
        <textarea id="learning-hypothesis" rows={3} value={hypothesis} maxLength={1200} onChange={e => setHypothesis(e.target.value)} />
        <label htmlFor="learning-manifest-strategy">LINK TO MANIFEST STRATEGY · OPTIONAL</label>
        <select id="learning-manifest-strategy" value={manifestStrategyId} onChange={e => setManifestStrategyId(e.target.value)}>
          <option value="">Standalone comparison (no Manifest strategy)</option>
          {(manifestRows ?? []).map(row => {
            let strategy: { name?: string } = {};
            try { strategy = JSON.parse(row.value) as { name?: string }; } catch { /* Use the ledger key below. */ }
            return <option key={row._id} value={row._id}>{strategy.name ?? row.key}</option>;
          })}
        </select>
        <p className="muted-copy">Linking a strategy adds traceability; it does not mean the strategy was executed or independently verified.</p>
        <div className="field-grid">
          <div><label htmlFor="learning-baseline">BASELINE LABEL</label><input id="learning-baseline" value={baselineLabel} maxLength={100} onChange={e => setBaselineLabel(e.target.value)} /></div>
          <div><label htmlFor="learning-candidate">CANDIDATE LABEL</label><input id="learning-candidate" value={candidateLabel} maxLength={100} onChange={e => setCandidateLabel(e.target.value)} /></div>
        </div>
        <div className="panel-title"><span>COMPARABLE METRICS</span><span className="status-chip">EDIT WITH REAL MEASUREMENTS</span></div>
        <p className="muted-copy">Example values are placeholders. Replace them with observations from comparable runs before saving.</p>
        {metrics.map((metric, index) => <div className="glass-card research-card" key={metric.key}>
          <div className="panel-title"><strong>{metric.label}</strong><span className="status-chip">{metric.direction === "higher" ? "HIGHER IS BETTER" : "LOWER IS BETTER"}</span></div>
          <div className="field-grid">
            <div><label htmlFor={`learning-base-${metric.key}`}>{baselineLabel || "Baseline"} · {metric.unit}</label><input id={`learning-base-${metric.key}`} type="number" step="any" value={metric.baseline} onChange={e => updateMetric(index, "baseline", Number(e.target.value))} /></div>
            <div><label htmlFor={`learning-cand-${metric.key}`}>{candidateLabel || "Candidate"} · {metric.unit}</label><input id={`learning-cand-${metric.key}`} type="number" step="any" value={metric.candidate} onChange={e => updateMetric(index, "candidate", Number(e.target.value))} /></div>
          </div>
          <label htmlFor={`learning-evidence-${metric.key}`}>EVIDENCE REFERENCE / MEASUREMENT METHOD</label>
          <input id={`learning-evidence-${metric.key}`} value={metric.evidence} maxLength={1000} placeholder="Run ID, artifact link, report URL, or how this was measured" onChange={e => updateMetric(index, "evidence", e.target.value)} />
        </div>)}
        <div className="panel-title"><span>SAFETY GATE</span><span className="status-chip">BOTH REQUIRED</span></div>
        <label className="decision-line"><input type="checkbox" checked={baselineSafetyPass} onChange={e => setBaselineSafetyPass(e.target.checked)} /> Baseline safety checks passed</label>
        <label className="decision-line"><input type="checkbox" checked={candidateSafetyPass} onChange={e => setCandidateSafetyPass(e.target.checked)} /> Candidate safety checks passed</label>
        <label htmlFor="learning-notes">NOTES / LIMITATIONS</label>
        <textarea id="learning-notes" rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Sample size, test conditions, known limitations, or unresolved questions" />
        <button className="primary-button" disabled={busy} onClick={() => void submit()}>{busy ? "Recording experiment…" : "Record comparison ↗"}</button>
        {error && <p className="warning" role="alert">{error}</p>}
        {receipt && <div className="glass-card research-card" role="status"><div className="panel-title"><span>COMPARISON RECEIPT</span><span className="live-pill">{receipt.decision.toUpperCase()}</span></div><p>{receipt.rationale}</p><p>Improved: {receipt.improved} · Regressed: {receipt.regressed} · Unchanged: {receipt.unchanged}</p><strong>Saved to private learning memory. No strategy was promoted.</strong></div>}
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>MANIFEST OUTCOME SIGNALS</span><span className="live-pill">{deriveManifestOutcomeSignals(manifestRows ?? []).length} EVIDENCE-BACKED STRATEGIES</span></div>
        <p className="muted-copy">This panel reads your private Manifest strategy ledger. Only recorded observations are counted; generated expectations are not treated as results.</p>
        {manifestRows === undefined ? <p>Loading Manifest outcome signals…</p> : (() => {
          const measured = deriveManifestOutcomeSignals(manifestRows);
          const succeeded = measured.filter(item => item.status === "succeeded").length;
          const partial = measured.filter(item => item.status === "partial").length;
          const failed = measured.filter(item => item.status === "failed").length;
          const inconclusive = measured.filter(item => item.status === "inconclusive").length;
          return measured.length === 0
            ? <div className="empty-state"><h3>No measured Manifest outcomes yet</h3><p>Record an observed result and evidence in Manifest Intelligence. Those records will appear here automatically.</p><Link className="secondary-button" to="/manifest">Open Manifest Intelligence →</Link></div>
            : <>
              <div className="field-grid">
                <div className="decision-line"><span>✓</span><strong>{succeeded} succeeded</strong></div>
                <div className="decision-line"><span>↗</span><strong>{partial} partial</strong></div>
                <div className="decision-line"><span>!</span><strong>{failed} failed</strong></div>
                <div className="decision-line"><span>…</span><strong>{inconclusive} inconclusive</strong></div>
              </div>
              {failed > 0 ? <p className="warning">Learning signal: review failed strategies and their recorded failure evidence before repeating them. This is a review cue, not an automatic strategy change.</p> : succeeded > 0 && failed === 0 && inconclusive === 0 ? <p className="muted-copy">Learning signal: recorded successes are available for comparison. Confirm the evidence and compare against a baseline before reuse.</p> : <p className="muted-copy">Learning signal: collect additional comparable measurements before drawing a strong conclusion.</p>}
              {measured.slice(0, 8).map(item => <article className="portfolio-row" key={item.id}><div className="portfolio-main"><strong>{item.name}</strong><p>{item.result}</p><small>Status: {item.status} · {item.outcomeCount} evidence-backed outcome{item.outcomeCount === 1 ? "" : "s"} · Evidence: {item.evidence}{item.cost == null ? "" : ` · Actual cost: $${item.cost}`}</small><p className="muted-copy">{item.recommendation}</p>{item.blueprintKey && <small>Exact blueprint receipt: {item.blueprintKey}</small>}<small>Strategy record: {item.strategyKey}</small></div><div className="portfolio-cell"><small>RECORDED</small><b>{typeof item.recordedAt === "number" ? new Date(item.recordedAt).toLocaleDateString() : "DATE N/A"}</b></div></article>)}
              <p className="muted-copy">Signals are deterministic prompts for the next experiment based on operator-recorded outcomes and evidence references. They are not independently verified findings, causal proof, or automatic strategy changes.</p>
              <Link className="secondary-button" to="/manifest">Review strategy ledger →</Link>
            </>;
        })()}
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>REPEATABLE STRATEGY BASELINES</span><span className="live-pill">{deriveStrategyComparisonSignals(history).length} LINKED STRATEGIES</span></div>
        <p className="muted-copy">This view compares saved baseline/candidate measurements only when experiments are linked to the same Manifest strategy, evidence references are present, both safety checks passed, and metric keys, units, and directions are compatible. It never promotes a strategy.</p>
        {savedRows === undefined ? <p>Loading comparison history…</p> : (() => {
          const comparisons = deriveStrategyComparisonSignals(history);
          return comparisons.length === 0
            ? <div className="empty-state"><h3>No linked comparisons available</h3><p>Record evidence-backed experiments and link them to the same Manifest strategy to build a comparable history. Standalone experiments remain in the experiment log but are not attributed to a Manifest strategy.</p></div>
            : comparisons.map(item => <article className="portfolio-row" key={item.strategyId}><div className="portfolio-main"><strong>{item.strategyName}</strong><p>{item.experimentCount} saved experiment(s) · {item.comparableMetricCount} compatible metric(s) · {item.improvedRuns} improved run(s) · {item.regressedRuns} regressed run(s) · {item.inconclusiveRuns} excluded/incomparable run(s)</p>{item.metricSummary.map(summary => <small key={summary}>{summary}</small>)}<p className="muted-copy">{item.recommendation}</p></div><div className="portfolio-cell"><small>COMPARABLE</small><b>{item.experimentCount - item.inconclusiveRuns}/{item.experimentCount}</b></div></article>);
        })()}
        <p className="muted-copy">These are deterministic summaries of operator-entered observations, not independent verification, statistical significance, or causal proof. Human review remains required before reuse.</p>
      </div>

      <LearningEffectivenessReview/>
      <RuntimeWorkbench area="learning"/><StrategyReuseOutcomes />
      <div className="glass-card research-card" id="reviewed-learning-memory">
        <div className="panel-title"><span>REUSABLE LEARNING MEMORY</span><span className="live-pill">OPERATOR REVIEW REQUIRED</span></div>
        <p className="muted-copy">Promote a finding into reusable memory only after reviewing its evidence. Saved lessons are owner-scoped and become advisory context for future Council planning; they do not execute actions or automatically change a strategy.</p>
        <label htmlFor="reviewed-lesson-strategy">MANIFEST STRATEGY</label>
        <select id="reviewed-lesson-strategy" value={lessonStrategyId} onChange={e => setLessonStrategyId(e.target.value)}>
          <option value="">Choose a strategy…</option>
          {(manifestRows ?? []).map(row => {
            let strategy: { name?: string } = {};
            try { strategy = JSON.parse(row.value) as { name?: string }; } catch { /* Use the ledger key below. */ }
            return <option key={row._id} value={row._id}>{strategy.name ?? row.key}</option>;
          })}
        </select>
        <label htmlFor="reviewed-lesson-text">REUSABLE LESSON</label>
        <textarea id="reviewed-lesson-text" rows={3} maxLength={1600} value={lessonText} onChange={e => setLessonText(e.target.value)} placeholder="What did the evidence teach us that another mission should consider?" />
        <label htmlFor="reviewed-lesson-applicability">WHEN DOES THIS APPLY?</label>
        <textarea id="reviewed-lesson-applicability" rows={2} maxLength={1000} value={lessonApplicability} onChange={e => setLessonApplicability(e.target.value)} placeholder="Scope, prerequisites, and situations where this lesson may not apply" />
        <label htmlFor="reviewed-lesson-evidence">EVIDENCE REFERENCES · ONE PER LINE · AT LEAST TWO</label>
        <textarea id="reviewed-lesson-evidence" rows={3} value={lessonEvidence} onChange={e => setLessonEvidence(e.target.value)} placeholder="Run ID, report, artifact, or source reference&#10;Second independent/comparable reference" />
        <div className="hero-actions"><button className="primary-button" type="button" disabled={lessonBusy} onClick={saveReviewedLesson}>{lessonBusy ? "Saving lesson…" : "Save reviewed lesson"}</button></div>
        {lessonMessage && <p className="muted-copy" role="status">{lessonMessage}</p>}
        {savedLesson && <div className="hero-actions"><Link className="primary-button" to="/mission" onClick={handoffSavedLesson}>Create mission from saved lesson →</Link></div>}
        {manifestRows?.length === 0 && <p>No strategy is available for this lesson yet. <Link to="/manifest">Open Manifest Intelligence to create or review a strategy →</Link></p>}
        <p className="muted-copy">Evidence references and applicability are operator-provided. The engine preserves the review label and limitations; it does not independently validate sources or infer causality.</p>
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>RECENT EXPERIMENTS</span><span className="live-pill">{history.length} SAVED</span></div>
        {savedRows === undefined ? <p>Loading experiment history…</p> : history.length === 0 ? <div className="empty-state"><h3>No experiments recorded yet</h3><p>Use real baseline and candidate observations to establish the first comparable record.</p></div> : history.map(row => {
          let record: any = null;
          try { record = JSON.parse(row.value); } catch { /* ignore malformed historical record */ }
          return <article className="portfolio-row" key={row._id}><div className="portfolio-main"><strong>{record?.name ?? row.key}</strong><p>{record?.hypothesis ?? "Stored experiment record"} · {record?.baselineLabel ?? "Baseline"} → {record?.candidateLabel ?? "Candidate"}</p>{record?.linkedManifestStrategy && <p>Linked Manifest strategy: <strong>{String(record.linkedManifestStrategy.name ?? "Unnamed strategy")}</strong></p>}<p>{record?.rationale ?? "No recommendation summary saved."}</p><small>Evidence status: {record?.evidenceStatus ?? "not specified"} · {new Date(row._creationTime).toLocaleString()}</small></div><div className="portfolio-cell"><small>DECISION</small><b>{String(record?.decision ?? "stored").toUpperCase()}</b></div></article>;
        })}
      </div>
    </section>
  </WorkspaceLayout>;
}
