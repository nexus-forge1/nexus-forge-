import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { useActiveMission } from "../hooks/use-active-mission";
import type { Id } from "../../convex/_generated/dataModel";
import { WorkspaceLayout } from "../components/workspace-layout";

export const Route = createFileRoute("/orchestrator")({ head: () => routeHead("/orchestrator"), component: IntelligenceOrchestratorPage });

type Strategy = { name: string; rationale: string; tradeoff: string; expectedOutcome: string };
type Specification = {
  objective: string;
  constraints: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  risks: string[];
  deadline: string;
  strategies: Strategy[];
  recommendedStrategy: number;
};
type SavedSpec = { _id: string; key: string; value: string; confidence: number; source: string };

function parseSaved(row: SavedSpec): { intent: string; domain: string; budget: number; horizon: string; specification: Specification } | null {
  try {
    const stored = JSON.parse(row.value) as { intent?: unknown; domain?: unknown; budget?: unknown; horizon?: unknown; specification?: unknown };
    if (typeof stored.intent !== 'string' || typeof stored.domain !== 'string' || typeof stored.specification !== 'string') return null;
    const specification = JSON.parse(stored.specification) as Specification;
    if (typeof specification.objective !== 'string' || !Array.isArray(specification.strategies) || !Array.isArray(specification.acceptanceCriteria)) return null;
    return { intent: stored.intent, domain: stored.domain, budget: typeof stored.budget === 'number' ? stored.budget : 0, horizon: typeof stored.horizon === 'string' ? stored.horizon : '14 days', specification };
  } catch { return null; }
}

function IntelligenceOrchestratorPage() {
  const { setMissionId } = useActiveMission();
  const [sourceMemoryId, setSourceMemoryId] = useState<Id<'memories'> | undefined>();
  const compileIntent = useAction(api.intelligenceOrchestrator.compileIntent);
  const createMission = useMutation(api.missions.create);
  const savedRows = useQuery(api.intelligenceOrchestrator.listRecent, {});
  const [intent, setIntent] = useState("Create a useful digital product from an idea, test it, and establish evidence of real user value.");
  const [domain, setDomain] = useState("AI product / venture");
  const [budget, setBudget] = useState(25);
  const [horizon, setHorizon] = useState("14 days");
  const [specification, setSpecification] = useState<Specification | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const compile = async () => {
    setError(""); setNotice("");
    if (intent.trim().length < 12) { setError("Describe the intended outcome in at least 12 characters."); return; }
    setBusy(true);
    try {
      const result = await compileIntent({ intent: intent.trim(), domain, budget, horizon });
      const compiled = result.specification as Specification;
      setSpecification(compiled);
      setSourceMemoryId(result.sourceMemoryId);
      setSelectedStrategy(compiled.recommendedStrategy);
      setNotice("Mission specification saved. Review the alternatives and select the strategy to carry into the governed draft.");
    } catch (e) { setError(e instanceof Error ? e.message : "Intent compilation failed. Check provider health and retry."); }
    finally { setBusy(false); }
  };

  const createDraft = async () => {
    if (!specification) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const chosenIndex = selectedStrategy ?? specification.recommendedStrategy;
      const chosen = specification.strategies[chosenIndex];
      const mission = [
        `OBJECTIVE: ${specification.objective}`,
        `USER INTENT: ${intent.trim()}`,
        `DOMAIN: ${domain}`,
        `TIME HORIZON: ${horizon}`,
        `BUDGET CAP: $${Math.max(0, Math.min(500, budget))} USD`,
        `OPERATOR-SELECTED STRATEGY (proposal only): ${chosen?.name ?? "Review alternatives"} — ${chosen?.rationale ?? ""}`,
        "ALTERNATIVE STRATEGIES:",
        ...specification.strategies.map((s, i) => `${i + 1}. ${s.name}: ${s.rationale} Trade-off: ${s.tradeoff} Expected outcome: ${s.expectedOutcome}`),
        "CONSTRAINTS:", ...specification.constraints.map(x => `- ${x}`),
        "DEPENDENCIES:", ...specification.dependencies.map(x => `- ${x}`),
        "ACCEPTANCE CRITERIA:", ...specification.acceptanceCriteria.map(x => `- ${x}`),
        "RISKS:", ...specification.risks.map(x => `- ${x}`),
        `DEADLINE TARGET: ${specification.deadline}`,
        "GOVERNANCE: This is a draft. Require explicit human approval before execution or external actions. Independently verify each acceptance criterion before claiming completion.",
      ].join("\n");
      const id = await createMission({ title: `Orchestrated: ${intent.trim().slice(0, 48)}`, mission, autonomy: "Approval required", budget: Math.max(0, Math.min(500, budget)), ownerKey: "local-workspace", ...(sourceMemoryId ? { sourceMemoryId } : {}) });
      setMissionId(id);
      setNotice("Governed draft mission created. It has not been approved or executed. Open Mission Console to review it and explicitly approve when ready.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create a governed draft."); }
    finally { setBusy(false); }
  };

  const history = (savedRows ?? []) as SavedSpec[];
  return <WorkspaceLayout title="Intelligence Orchestrator" eyebrow="STAGE 02 / STRUCTURE → STRATEGY → GOVERNED MISSION">
    <section className="workspace">
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span /> UNIFIED INTELLIGENCE WORKFLOW</div>
          <h2>Turn intent into <em>a verifiable mission.</em></h2>
          <p className="hero-text">Compile a goal into constraints, dependencies, measurable acceptance criteria, risks, and competing strategies. Compare the alternatives and choose one before creating a governed draft. AI recommendation is advisory—not an automatic decision or execution.</p>
          <div className="hero-actions"><Link className="secondary-button" to="/manifest">Manifest Intelligence →</Link><Link className="secondary-button" to="/mission">Mission Console →</Link></div>
        </div>
        <div className="glass-card research-card">
          <div className="panel-title"><span>ORCHESTRATION CONTRACT</span><span className="live-pill">HUMAN AUTHORITY</span></div>
          {["Structured objective", "Constraints & dependencies", "Competing strategies", "Acceptance criteria", "Risk and budget limits", "Human approval gate"].map((item, i) => <div className="decision-line" key={item}><span>0{i + 1}</span><strong>{item}</strong></div>)}
          <p className="muted-copy">Execution and production delivery remain separate, explicitly governed steps.</p>
        </div>
      </div>
      <div className="console-grid">
        <div className="glass-card research-card">
          <div className="panel-title"><span>INTENT COMPILER</span><span className="live-pill">BOUNDED AI RUN</span></div>
          <label htmlFor="orchestrator-intent">MISSION INTENT</label>
          <textarea id="orchestrator-intent" rows={6} maxLength={3000} value={intent} onChange={e => setIntent(e.target.value)} />
          <div className="field-grid">
            <div><label htmlFor="orchestrator-domain">DOMAIN</label><select id="orchestrator-domain" value={domain} onChange={e => setDomain(e.target.value)}>{["AI product / venture", "Software and automation", "Creative media and art", "Scientific research", "Education and learning", "Business operations", "Cross-domain exploration"].map(x => <option key={x}>{x}</option>)}</select></div>
            <div><label htmlFor="orchestrator-budget">BUDGET CAP · USD</label><input id="orchestrator-budget" type="number" min={0} max={500} value={budget} onChange={e => setBudget(Math.max(0, Math.min(500, Number(e.target.value))))} /></div>
          </div>
          <label htmlFor="orchestrator-horizon">TIME HORIZON</label>
          <select id="orchestrator-horizon" value={horizon} onChange={e => setHorizon(e.target.value)}>{["48 hours", "7 days", "14 days", "30 days", "90 days", "Exploratory / no fixed deadline"].map(x => <option key={x}>{x}</option>)}</select>
          <button className="primary-button" disabled={busy} onClick={() => void compile()}>{busy ? "Compiling intent…" : "Compile mission specification ↗"}</button>
          <p className="muted-copy">Uses the configured provider router and saves a private specification. No mission is created until you choose to create a draft.</p>
        </div>
        <div className="glass-card research-card">
          <div className="panel-title"><span>MISSION SPECIFICATION</span><span className="live-pill">{specification ? "REVIEW REQUIRED" : "AWAITING INTENT"}</span></div>
          {specification ? <>
            <h3>{specification.objective}</h3>
            <div className="decision-line"><span>DEADLINE TARGET</span><strong>{specification.deadline}</strong></div>
            <h4>Competing strategies</h4>
            {specification.strategies.map((s, i) => <div className="decision-line" key={s.name}><span>{i === selectedStrategy ? "SELECTED" : i === specification.recommendedStrategy ? "AI RECOMMENDED" : `OPTION ${i + 1}`}</span><div><strong>{s.name}</strong><p>{s.rationale} Trade-off: {s.tradeoff} Expected: {s.expectedOutcome}</p><button type="button" className={i === selectedStrategy ? "secondary-button small" : "secondary-button small"} aria-pressed={i === selectedStrategy} onClick={() => setSelectedStrategy(i)}>{i === selectedStrategy ? "Selected strategy ✓" : "Choose this strategy"}</button></div></div>)}
            <h4>Acceptance criteria</h4><ul>{specification.acceptanceCriteria.map(x => <li key={x}>{x}</li>)}</ul>
            <h4>Constraints</h4><ul>{specification.constraints.map(x => <li key={x}>{x}</li>)}</ul>
            <h4>Dependencies and risks</h4><ul>{[...specification.dependencies.map(x => `Dependency: ${x}`), ...specification.risks.map(x => `Risk: ${x}`)].map(x => <li key={x}>{x}</li>)}</ul>
            <p className="muted-copy">Selected strategy: {specification.strategies[selectedStrategy ?? specification.recommendedStrategy]?.name ?? "Review alternatives"}. Your choice is recorded in the draft; it does not approve or execute the mission.</p>
            <button className="primary-button" disabled={busy || selectedStrategy === null} onClick={() => void createDraft()}>Create governed draft mission ↗</button>
          </> : <div className="empty-state"><h3>Define success before execution.</h3><p>Compile your intent to see structured criteria and compare strategies before deciding what to do next.</p></div>}
        </div>
      </div>
      {error && <p className="warning" role="alert">{error}</p>}
      {notice && <p className="receipt" role="status">{notice}</p>}
      <div className="glass-card research-card">
        <div className="panel-title"><span>RECENT SPECIFICATIONS</span><span className="live-pill">{history.length} SAVED</span></div>
        {savedRows === undefined ? <p>Loading saved specifications…</p> : history.length === 0 ? <p>No saved specifications yet.</p> : history.map(row => {
          const item = parseSaved(row);
          return <div className="portfolio-row" key={row._id}><div className="portfolio-main"><strong>{item?.intent ?? "Saved mission specification"}</strong><p>{item?.domain ?? "Domain unavailable"} · {item?.horizon ?? 'Horizon unavailable'} · Budget cap ${item?.budget ?? 0}</p></div><div className="portfolio-cell"><small>STATUS</small><b>SAVED DRAFT</b></div><div className="portfolio-cell"><small>CONFIDENCE</small><b>{Math.round(row.confidence * 100)}% RECORD</b></div><button className="secondary-button small" disabled={!item} onClick={() => { if (!item) return; setSourceMemoryId(row._id as Id<'memories'>); setIntent(item.intent); setDomain(item.domain); setBudget(Math.max(0, Math.min(500, item.budget))); setHorizon(item.horizon); setSpecification(item.specification); setSelectedStrategy(item.specification.recommendedStrategy); setNotice('Saved specification restored. Review the alternatives and confirm the strategy before creating a governed draft.'); setError(''); }}>Load specification</button></div>;
        })}
      </div>
    </section>
  </WorkspaceLayout>;
}
