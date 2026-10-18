import {RequirementHistory} from './requirement-history';
import {PortfolioHistoryNotice} from "./portfolio-history-notice";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ExecutionReview } from './execution-review';

export function MissionControl({
  missionId,
}: {
  missionId: Id<"missions"> | null;
}) {
  const mission = useQuery(
    api.missions.getById,
    missionId ? { id: missionId } : "skip",
  );
  const workflowRun = useQuery(
    api.missionRunner.get,
    missionId ? { missionId } : "skip",
  );
  const artifacts = useQuery(
    api.artifacts.list,
    missionId ? { missionId } : "skip",
  );
  const executionClaims = useQuery(api.executionClaims.unresolved, missionId ? { missionId } : "skip");
  const regenerateArtifact = useAction(api.artifacts.generate);
  const verifyArtifact = useMutation(api.artifacts.verify);
  const latestArtifact = artifacts?.[0];
  const incidents = useQuery(
    api.incidents.list,
    missionId ? { missionId } : "skip",
  );
  const verifications = useQuery(
    api.verification.list,
    missionId ? { missionId } : "skip",
  );
  const measurements = useQuery(
    api.verification.measurements,
    missionId ? { missionId } : "skip",
  );
  const deliveries = useQuery(
    api.delivery.list,
    missionId ? { missionId } : "skip",
  );
  const decision = useQuery(api.portfolio.decisionSnapshot);
  const learning = useQuery(api.portfolio.learningSnapshot);
  const preflightStatus = useQuery(
    api.memory.adaptivePreflightStatus,
    missionId ? { missionId } : "skip",
  );
  const preflight = preflightStatus?.ok ? preflightStatus.value : undefined;
  const orchestration = useQuery(
    api.orchestration.preflight,
    missionId ? { missionId } : "skip",
  );
  const decisions = useQuery(
    api.portfolio.listDecisions,
    missionId ? { missionId } : "skip",
  );
  const recordDecision = useMutation(api.portfolio.recordDecision);
  const checkProviderHealth = useAction(api.providerHealth.check);
  const [providerHealth, setProviderHealth] = useState<Awaited<ReturnType<typeof checkProviderHealth>> | null>(null);
  const [reviewRecovery, setReviewRecovery] = useState("");
  const [reviewLesson, setReviewLesson] = useState("");
  const recordMeasuredOutcome = useMutation(api.verification.recordMeasuredOutcome);
  const reviewEscalated = useMutation(api.incidents.reviewEscalated);
  const approveMission = useMutation(api.missions.approve);
  const executeApprovedMission = useMutation(
    api.portfolio.executeApprovedMission,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const openIncidents =
    incidents?.filter((i) => i.status === "open").length ?? 0;
  const escalated =
    incidents?.filter((i) => i.status === "escalated").length ?? 0;
  const escalatedIncident = incidents?.find((i) => i.status === "escalated");
  const resolved =
    incidents?.filter((i) => i.status === "resolved").length ?? 0;
  const latest = verifications?.[0];
  const preflightReason = preflight?.rationale[0] ?? "No prior learning rationale is available for this mission.";
  const approved = decisions?.find(
    (d) => d.decision === "approve" && d.action === "Execute approved mission",
  );
  const verifiedDelivery = deliveries?.find((d) => d.stage === "verified");

  async function refreshProviderHealth() {
    setBusy("providerHealth");
    setReceipt(null);
    setActionError(null);
    try {
      const result = await checkProviderHealth({});
      setProviderHealth(result);
      const degraded = result.filter((p) => p.status !== "healthy").length;
      setReceipt(degraded ? `${degraded} provider(s) need attention.` : "All configured AI providers are reachable.");
    } catch (error) {
      setProviderHealth(null);
      setActionError(error instanceof Error ? error.message : "Provider health check failed. Inspect sanitized backend diagnostics.");
    } finally {
      setBusy(null);
    }
  }

  async function approveSelectedMission() {
    if (!mission) return;
    setBusy("approveMission"); setReceipt(null); setActionError(null);
    try { await approveMission({ id: mission._id, approved: true }); setReceipt("Mission approved. Review execution authorization before starting."); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Mission approval failed. Review the selected mission and retry."); }
    finally { setBusy(null); }
  }

  async function verifyOutcome() {
    if (!missionId || !verifiedDelivery) return;
    setBusy("verifyOutcome");
    setReceipt(null);
    setActionError(null);
    try {
      const result = await recordMeasuredOutcome({ deliveryId: verifiedDelivery._id });
      setReceipt(
        result.passed
          ? `Measured outcome: ${Math.round(result.score * 100)}% — all four evidence domains passed; mission completed.`
          : `Measured outcome: ${Math.round(result.score * 100)}% — review the failed evidence domains before treating the mission as complete.`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Outcome recording failed. Review delivery evidence and retry.");
    } finally {
      setBusy(null);
    }
  }
  async function recordEscalationReview() {
    if (!escalatedIncident) return;
    if (reviewRecovery.trim().length < 12 || reviewLesson.trim().length < 12) {
      setReceipt("Enter a specific recovery action and a reusable lesson (at least 12 characters each). ");
      return;
    }
    setBusy("reviewEscalation");
    setReceipt(null);
    setActionError(null);
    try {
      await reviewEscalated({ incidentId: escalatedIncident._id, recovery: reviewRecovery, lesson: reviewLesson });
      setReviewRecovery("");
      setReviewLesson("");
      setReceipt("Human review recorded. The escalation is resolved, but the workflow will not resume automatically. Start a new bounded run explicitly if you decide to continue.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Human incident review failed.");
    } finally {
      setBusy(null);
    }
  }

  async function authorizeExecution() {
    if (!missionId || !orchestration?.ready || escalatedIncident) return;
    setBusy("1:Execute approved mission");
    setReceipt(null);
    setActionError(null);
    try {
      await recordDecision({
        missionId,
        priorityRank: 1,
        action: "Execute approved mission",
        decision: "approve",
        note: orchestration?.ready
          ? "Orchestration preflight passed."
          : "Awaiting orchestration preflight.",
      });
      setReceipt("Execution authorization recorded.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Execution authorization failed. Review mission preflight and retry.");
    } finally {
      setBusy(null);
    }
  }
  async function regenerateArtifactDraft() {
    if (!missionId || !mission) return;
    const confirmed = window.confirm(
      "Regenerate an unapproved artifact draft? This will create a new revision and run the stricter verification checks. It will not approve, deliver, or deploy anything.",
    );
    if (!confirmed) return;
    setBusy("regenerateArtifact");
    setReceipt(null);
    setActionError(null);
    try {
      const generated = await regenerateArtifact({
        missionId,
        mission: mission.mission,
        artifactType: "execution-artifact",
        artifactName: `${mission.title} execution artifact revision`,
      });
      const result = await verifyArtifact({ id: generated.artifactId });
      setReceipt(
        result.passed
          ? `New draft ${generated.artifactId} passed verification at ${Math.round(result.score * 100)}%. Human artifact approval is still required.`
          : `New draft ${generated.artifactId} failed verification at ${Math.round(result.score * 100)}%. Do not approve it; review the failed checks.`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Artifact regeneration failed.");
    } finally {
      setBusy(null);
    }
  }

  async function execute() {
    if (!missionId || !approved || !orchestration?.ready || escalatedIncident) return;
    setBusy("execute");
    setReceipt(null);
    setActionError(null);
    try {
      const confirmed = window.confirm(
        `Execute approved mission?\n\n${approved.action}\n\nDependency and resource preflight has passed. This starts the bounded 20-minute mission runner.`,
      );
      if (!confirmed) return;
      const result = await executeApprovedMission({
        missionId,
        priorityRank: approved.priorityRank,
        action: approved.action,
      });
      setReceipt(
        result.alreadyRunning
          ? `Execution already active · Run ${result.runId}`
          : `Execution started · Run ${result.runId}`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Workflow start failed. Review runner status and incidents before retrying.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="mission-control" className="workspace dark-section">
      <div className="workspace-head">
        <div>
          <div className="section-kicker">OPERATIONS / 006</div>
          <h2>Mission Control</h2>
        </div>
        <div className="inline-actions">
          <button className="ghost-button" onClick={refreshProviderHealth} disabled={busy === "providerHealth"}>
            {busy === "providerHealth" ? "Checking providers…" : "Check AI providers"}
          </button>
          <span className="status-chip">● GOVERNED</span>
        </div>
      </div>
      {actionError && <div className="glass-card research-card"><p role="alert">{actionError}</p><div className="hero-actions"><Link className="secondary-button" to="/incidents">Review incidents →</Link><Link className="secondary-button" to="/delivery">Review delivery evidence →</Link><Link className="secondary-button" to="/mission">Review mission →</Link></div></div>}
      {receipt && <p className="receipt" role="status">{receipt}</p>}
      {!!executionClaims?.length && <div className="glass-card research-card">
        <div className="panel-title"><span>EXECUTION RECOVERY</span><span className="status-chip">WORK RESERVED</span></div>
        {executionClaims.map(claim => <p key={claim.id} role="status">{claim.scope === "council" ? "AI Council" : "Mission runner"} · {claim.status === "uncertain" ? "Interrupted or unconfirmed work requires review." : "Work is active or awaiting completion confirmation."} Reference: {claim.id}</p>)}
        {executionClaims.map(claim => <ExecutionReview key={claim.id} claimId={claim.id} />)}
        <p>Duplicate execution is paused. Check provider records and saved outcomes before retrying. Reservations do not expire automatically; a running reservation alone does not prove a failure.</p>
        <Link className="secondary-button" to="/incidents">Review recovery evidence →</Link>
      </div>}
      {providerHealth && (
        <div className="glass-card research-card">
          <div className="panel-title"><span>AI PROVIDER HEALTH</span><span className="live-pill">● LIVE</span></div>
          <div className="stats-strip compact">
            {providerHealth.map((provider) => (
              <div key={provider.name} data-testid={`provider-health-${provider.name}`}>
                <strong>{provider.status.toUpperCase()}</strong>
                <span>{provider.label} · {provider.latencyMs}ms</span>
                <small>{provider.detail}</small>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="glass-card research-card">
        <div className="panel-title">
          <span>ADAPTIVE PREFLIGHT</span>
          <span className="live-pill">● LEARNING / ADVISORY</span>
        </div>
        {preflightStatus?.ok === false ? <><p role="alert">{preflightStatus.message}</p><Link className="secondary-button" to="/evidence">Review retained memory →</Link></> : preflight ? (
          <>
            <div className="decision-line">
              <span>WHY THE PLAN MAY CHANGE</span>
              <strong title={preflightReason}>{preflightReason.length > 240 ? `${preflightReason.slice(0, 240)}…` : preflightReason}</strong>
            </div>
            <div className="stats-strip compact">
              <div>
                <strong>{preflight.riskSignals.length}</strong>
                <span>Risk signals</span>
              </div>
              <div>
                <strong>{preflight.reusePatterns.length}</strong>
                <span>Reuse patterns</span>
              </div>
              <div>
                <strong>{preflight.requiredEvidence.length}</strong>
                <span>Evidence requirements</span>
              </div>
              <div>
                <strong>{preflight.recoveryGuidance.length}</strong>
                <span>Recovery signals</span>
              </div>
            </div>
            <div className="console-grid">
              <div>
                {preflight.riskSignals.slice(0, 3).map((s, i) => (
                  <div className="guard-item" key={`risk-${i}`}>
                    <span>!</span>
                    <div>
                      <strong>Prior risk</strong>
                      <small title={s.value}>{s.value.length > 240 ? `${s.value.slice(0, 240)}…` : s.value}</small>
                    </div>
                  </div>
                ))}
                {preflight.reusePatterns.slice(0, 3).map((s, i) => (
                  <div className="guard-item" key={`reuse-${i}`}>
                    <span>↻</span>
                    <div>
                      <strong>Reuse pattern</strong>
                      <small title={s.value}>{s.value.length > 240 ? `${s.value.slice(0, 240)}…` : s.value}</small>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                {preflight.requiredEvidence.map((x, i) => (
                  <div className="guard-item" key={`evidence-${i}`}>
                    <span>✓</span>
                    <div>
                      <strong>Required evidence</strong>
                      <small>{x}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p>
              These signals influence planning only. They never approve,
              execute, deploy, or verify a mission.
            </p>
          </>
        ) : (
          <p>
            Adaptive preflight appears after authentication and mission
            selection.
          </p>
        )}
      </div>
      <div className="glass-card research-card">
        <div className="panel-title">
          <span>DEPENDENCY & RESOURCE ORCHESTRATION</span>
          <span className="live-pill">● EXECUTION GATE</span>
        </div>
        {orchestration ? (
          <>
            <div className="decision-line">
              <span>PREFLIGHT</span>
              <strong>
                {orchestration.ready
                  ? "READY TO EXECUTE"
                  : "BLOCKED — RESOLVE CONFLICTS"}
              </strong>
            </div>
            <div className="stats-strip compact">
              <div>
                <strong>{orchestration.blockers.length}</strong>
                <span>Blockers</span>
              </div>
              <div>
                <strong>{orchestration.advisories.length}</strong>
                <span>Advisories</span>
              </div>
              <div>
                <strong>{orchestration.resources.length}</strong>
                <span>Resources</span>
              </div>
              <div>
                <strong>
                  {orchestration.resources.filter((r) => r.available).length}
                </strong>
                <span>Available</span>
              </div>
            </div>
            {orchestration.blockers.map((b, i) => (
              <div className="guard-item" key={`block-${i}`}>
                <span>!</span>
                <div>
                  <strong>Execution blocker</strong>
                  <small>{b}</small>
                </div>
                <span className="status-chip">BLOCKED</span>
              </div>
            ))}
            {orchestration.advisories.map((a, i) => (
              <div className="guard-item" key={`advisory-${i}`}>
                <span>i</span>
                <div>
                  <strong>Dependency advisory</strong>
                  <small title={a}>{a.length > 240 ? `${a.slice(0, 240)}…` : a}</small>
                </div>
                <span className="status-chip">ADVISORY</span>
              </div>
            ))}
            {orchestration.resources.map((r) => (
              <div className="guard-item" key={r.key}>
                <span>◈</span>
                <div>
                  <strong>{r.key}</strong>
                  <small>
                    {r.mode.toUpperCase()} resource ·{" "}
                    {r.available ? "available" : r.heldByMission ? `held by ${r.heldByMission}` : "held by another mission"}
                  </small>
                </div>
                <span className="status-chip">
                  {r.available ? "AVAILABLE" : "HELD"}
                </span>
              </div>
            ))}
            <p>
              Blocking dependencies and exclusive/shared resource conflicts are
              checked again at execution time on the backend. The UI cannot
              bypass this gate.
            </p>
          </>
        ) : (
          <p>{missionId ? "Loading dependency and resource preflight…" : "Select a mission to inspect dependency and resource preflight."}</p>
        )}
      </div>
      {missionId&&<RequirementHistory key={missionId} missionId={missionId}/>}
      <div className="glass-card research-card">
        <div className="panel-title">
          <span>PORTFOLIO DECISION QUEUE</span>
          <span className="live-pill">● HUMAN GATE</span>
        </div>
        {decision ? (
          <>
            <PortfolioHistoryNotice scope={decision.historyScope}/>
            <div className="stats-strip compact">
              <div>
                <strong>{decision.totalMissions}</strong>
                <span>Missions</span>
              </div>
              <div>
                <strong>{Math.round(decision.completionRate * 100)}%</strong>
                <span>Completion</span>
              </div>
              <div>
                <strong>{decision.blocked}</strong>
                <span>Needs review</span>
              </div>
            </div>
            <div className="decision-line">
              <span>RECOMMENDATION</span>
              <strong>{decision.recommendation.toUpperCase()}</strong>
            </div>
            {decision.priorities.map((p) => (
              <div className="guard-item" key={`${p.rank}-${p.action}`}>
                <span>{p.rank}</span>
                <div>
                  <strong>{p.action}</strong>
                  <small title={p.reason}>{p.reason.length > 240 ? `${p.reason.slice(0, 240)}…` : p.reason}</small>
                </div>
                <span className="status-chip">ADVISORY</span>
              </div>
            ))}
            {missionId && mission && (
              <div className="glass-card research-card execution-receipt">
                <div className="panel-title">
                  <span>SELECTED MISSION GATE</span>
                  <span className="live-pill">● HUMAN GATE</span>
                </div>
                <p>
                  <strong>{mission.title}</strong> ·{" "}
                  {mission.status.toUpperCase()} ·{" "}
                  {mission.approved
                    ? "MISSION APPROVED"
                    : "MISSION NOT APPROVED"}
                </p>
                <div className="decision-line" data-testid="autonomous-workflow-status">
                  <span>AUTONOMOUS WORKFLOW</span>
                  <strong>{workflowRun ? `${workflowRun.status.toUpperCase()} · ${workflowRun.currentStage.replaceAll("_", " ").toUpperCase()}` : missionId && workflowRun === undefined ? "Loading runner status…" : "NOT STARTED"}</strong>
                </div>
                {workflowRun?.lastError && <p className="receipt">{workflowRun.lastError}</p>}
                {escalatedIncident && <div className="glass-card research-card" data-testid="escalation-review-form"><div className="panel-title"><span>HUMAN REVIEW REQUIRED</span><span className="status-chip">ESCALATED</span></div><p>{escalatedIncident.stage.replaceAll("_", " ")}: {escalatedIncident.message}</p><p>{escalatedIncident.diagnosis || "Record the actual recovery after reviewing the run evidence. Do not guess or mark an unverified recovery as complete."}</p><label htmlFor="escalation-recovery">RECOVERY ACTION / INVESTIGATION</label><textarea id="escalation-recovery" rows={3} value={reviewRecovery} onChange={event => setReviewRecovery(event.target.value)} placeholder="Describe the recovery or investigation actually performed…" /><label htmlFor="escalation-lesson">REUSABLE LESSON</label><textarea id="escalation-lesson" rows={3} value={reviewLesson} onChange={event => setReviewLesson(event.target.value)} placeholder="Record what should change to prevent this failure…" /><button className="secondary-button" data-testid="resolve-escalation" onClick={() => void recordEscalationReview()} disabled={busy !== null || reviewRecovery.trim().length < 12 || reviewLesson.trim().length < 12}>{busy === "reviewEscalation" ? "Saving review…" : "Record human review (does not resume workflow)"}</button></div>}
                <p>Runs Council orchestration, persists agent handoffs, generates and structurally verifies an artifact, then pauses for artifact and delivery approvals. External delivery and deployment are never automatic.</p>
                {!mission.approved ? (
                  <button
                    className="secondary-button"
                    onClick={approveSelectedMission}
                    disabled={busy !== null}
                  >
                    Approve mission for execution
                  </button>
                ) : !approved ? (
                  <button
                    className="secondary-button"
                    onClick={authorizeExecution}
                    disabled={busy !== null || !orchestration?.ready || Boolean(escalatedIncident)}
                  >
                    {busy === "1:Execute approved mission"
                      ? "Saving…"
                      : escalatedIncident
                        ? "Human review required"
                        : orchestration?.ready
                        ? "Authorize execution"
                        : "Awaiting orchestration preflight"}
                  </button>
                ) : (
                  <>
                    <p>
                      <strong>Execution authorization recorded.</strong>{" "}
                      Execution is still a separate explicit action.
                    </p>
                    <button
                      className="primary-button"
                      onClick={execute}
                      data-testid="autonomous-workflow-start"
                      disabled={busy !== null || !orchestration?.ready || Boolean(escalatedIncident)}
                    >
                      {escalatedIncident
                        ? "Human review required"
                        : busy === "execute"
                          ? "Starting workflow…"
                          : workflowRun && (workflowRun.status === "running" || workflowRun.status === "paused")
                            ? "Resume Autonomous Workflow"
                            : orchestration?.ready
                              ? "Start Autonomous Workflow"
                              : "Blocked by orchestration"}
                    </button>
                  </>
                )}
                {latestArtifact && (
                  <div className="decision-line" data-testid="artifact-draft-status">
                    <span>LATEST ARTIFACT</span>
                    <strong>{latestArtifact.status.toUpperCase()} · {latestArtifact.requiresApproval ? "APPROVAL REQUIRED" : "CLOSED"}</strong>
                  </div>
                )}
                {mission.approved && latestArtifact?.requiresApproval && latestArtifact.status !== "ready" && latestArtifact.status !== "rejected" && (
                  <button
                    className="secondary-button"
                    onClick={regenerateArtifactDraft}
                    data-testid="regenerate-artifact-draft"
                    disabled={busy !== null}
                  >
                    {busy === "regenerateArtifact" ? "Regenerating draft…" : "Regenerate unapproved artifact draft"}
                  </button>
                )}
              </div>
            )}
            <p>
              Recommendations are advisory. Human approval plus a successful
              dependency/resource preflight are required before execution.
            </p>
          </>
        ) : (
          <p>Loading portfolio decision snapshot…</p>
        )}
      </div>
      <div className="glass-card research-card">
        <div className="panel-title">
          <span>CROSS-MISSION LEARNING</span>
          <span className="live-pill">● VERIFIED SIGNALS</span>
        </div>
        {learning ? (
          <>
            <PortfolioHistoryNotice scope={learning.historyScope}/>
            <div className="stats-strip compact">
              <div>
                <strong>{learning.missionsObserved}</strong>
                <span>Missions observed</span>
              </div>
              <div>
                <strong>{learning.verifiedOutcomes}</strong>
                <span>Verified outcomes</span>
              </div>
              <div>
                <strong>{Math.round(learning.successRate * 100)}%</strong>
                <span>Success rate</span>
              </div>
              <div>
                <strong>{learning.lessonsCaptured}</strong>
                <span>Lessons</span>
              </div>
            </div>
            {learning.patterns.map((p) => (
              <div className="guard-item" key={p.label}>
                <span>{p.count}</span>
                <div>
                  <strong>{p.label}</strong>
                  <small>{p.implication}</small>
                </div>
              </div>
            ))}
            {learning.lessons.length > 0 && (
              <>
                <div className="panel-title">
                  <span>REUSABLE LESSONS</span>
                </div>
                {learning.lessons.map((lesson, idx) => (
                  <div
                    className="evidence-item"
                    key={`${lesson.source}-${idx}`}
                  >
                    <span className="time">
                      {Math.round(lesson.confidence * 100)}%
                    </span>
                    <div>
                      <b title={lesson.value}>{lesson.value.length > 420 ? `${lesson.value.slice(0, 420)}…` : lesson.value}</b>
                      <p>Source: {lesson.source}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
            <p>
              Learning signals inform future prioritization and adaptive
              preflight; they do not approve or execute missions.
            </p>
          </>
        ) : (
          <p>Loading verified learning signals…</p>
        )}
      </div>
      {!missionId ? (
        <div className="glass-card research-card">
          <h3>No mission selected</h3>
          <p>
            Forge a mission above to populate the operational control plane with
            live incidents and outcome evidence.
          </p>
        </div>
      ) : (
        <div className="console-grid">
          <div className="glass-card research-card">
            <div className="panel-title">
              <span>EXECUTION HEALTH</span>
              <span className="live-pill">● LIVE</span>
            </div>
            <div className="stats-strip compact">
              <div>
                <strong>{openIncidents}</strong>
                <span>Open incidents</span>
              </div>
              <div>
                <strong>{resolved}</strong>
                <span>Resolved</span>
              </div>
              <div>
                <strong>{escalated}</strong>
                <span>Escalated</span>
              </div>
            </div>
            {incidents?.slice(0, 5).map((i) => (
              <div className="evidence-item" key={i._id}>
                <span className="time">{i.status.toUpperCase()}</span>
                <div>
                  <b>{i.stage}</b>
                  <p>{i.diagnosis || i.message}</p>
                  {i.proposedRecovery && (
                    <small>Recovery: {i.proposedRecovery}</small>
                  )}
                </div>
                <span className={i.status === "resolved" ? "score" : "warning"}>
                  {i.status}
                </span>
              </div>
            ))}
          </div>
          <div className="glass-card research-card">
            <div className="panel-title">
              <span>OUTCOME VERIFICATION</span>
              <span className="live-pill">● EVIDENCE</span>
            </div>
            {latest ? (
              <>
                <div className="decision-line">
                  <span>RESULT</span>
                  <strong>
                    {latest.passed ? "PASSED" : "FAILED"} ·{" "}
                    {Math.round(latest.score * 100)}%
                  </strong>
                </div>
                <p>{latest.summary}</p>
                {measurements?.[0] && (
                  <div className="decision-line">
                    <span>MEASURED OUTCOME</span>
                    <strong>{measurements[0].metric} · {Math.round(measurements[0].actual * 100)}% / {Math.round(measurements[0].target * 100)}%</strong>
                  </div>
                )}
                {latest.criteria.map((c, idx) => (
                  <div className="guard-item" key={`${c}-${idx}`}>
                    <span>✓</span>
                    <div>
                      <strong>{c}</strong>
                      <small>
                        {latest.evidence[idx] || "Evidence recorded"}
                      </small>
                    </div>
                  </div>
                ))}
              </>
            ) : verifiedDelivery ? (
              <>
                <h3>Verified delivery awaiting outcome record</h3>
                <p>
                  Record the measured outcome to complete the mission loop and
                  save the reusable lesson.
                </p>
                <button
                  className="primary-button"
                  data-testid="record-outcome"
                  onClick={verifyOutcome}
                  disabled={busy !== null}
                >
                  {busy === "verifyOutcome"
                    ? "Recording…"
                    : "Record outcome verification"}
                </button>
              </>
            ) : (
              <>
                <h3>Awaiting measured outcome</h3>
                <p>
                  Verification evidence appears here only after the governed
                  delivery reaches the verified stage.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
