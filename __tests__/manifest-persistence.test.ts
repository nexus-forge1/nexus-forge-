import { requiredBlueprintSections } from "../convex/blueprintCompleteness";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");

function identity(subject: string) {
  return {
    subject,
    issuer: "https://nexus-forge.test",
    tokenIdentifier: `https://nexus-forge.test|${subject}`,
  };
}

const candidates = [
  { name: "Small pilot", mechanism: "Test one narrow user segment", prerequisites: "A reachable pilot audience", timeToEvidence: "Within one week", expectedValue: "Activation evidence", reversibility: "Easy to stop", failureMode: "Too few participants", unverifiedAssumptions: "Pilot users resemble the target audience" },
  { name: "Workflow prototype", mechanism: "Build the smallest end-to-end slice", prerequisites: "One measurable use case", timeToEvidence: "Within three days", expectedValue: "Usability and delivery evidence", reversibility: "Can be discarded", failureMode: "Prototype misses the real need", unverifiedAssumptions: "The workflow can be automated safely" },
  { name: "Manual concierge", mechanism: "Deliver the result manually before automating", prerequisites: "Operator time and a test user", timeToEvidence: "Within two days", expectedValue: "Direct problem-fit evidence", reversibility: "Stop after the pilot", failureMode: "Manual service does not scale", unverifiedAssumptions: "Users value the outcome enough to return" },
];

const generated = [
  "## Manifest",
  "A bounded proposal with a measurable first experiment.",
  "",
  "```manifest-strategies",
  JSON.stringify(candidates),
  "```",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Manifest provider-to-ledger persistence", () => {
  it("persists a complete compact response with three distinct strategies in one provider call", async () => {
    const t=convexTest(schema,modules),operator=t.withIdentity(identity("compact-blueprint-owner"));
    vi.stubEnv("GROQ_API_KEY","test-provider-key");
    const nl=String.fromCharCode(10),f=String.fromCharCode(96).repeat(3);
    const complete=requiredBlueprintSections.map(section=>"## "+section+nl+"A concrete proposed step with a measurable acceptance threshold.").join(nl+nl);
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:complete+nl+f+"manifest-strategies"+nl+JSON.stringify(candidates)+nl+f}}],usage:{prompt_tokens:900,completion_tokens:1500,total_tokens:2400}}),{status:200,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);
    const result=await operator.action(api.manifestIntelligence.synthesize,{intent:"Propose a bounded bakery planning checklist.",domain:"QA software",budget:4,horizon:"one day",constraints:"No external action.",acceptanceCriteria:"Keep all required sections and strategies."});
    expect(result).toMatchObject({blueprintComplete:true,strategyCount:3,missingSections:[]});
    expect(fetchMock).toHaveBeenCalledOnce();
    const request=JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(request.max_tokens).toBe(3000);expect(request.messages[0].content).not.toContain("[context truncated");
    expect(JSON.parse((await operator.query(api.manifestIntelligence.listBlueprints,{}))[0].value).sectionCheck).toMatchObject({version:"blueprint-sections-v2",complete:true});
  });
  it("rejects oversized context before inference or ledger writes", async () => {
    const t=convexTest(schema,modules),operator=t.withIdentity(identity("oversize-blueprint-owner")),fetchMock=vi.fn();
    vi.stubGlobal("fetch",fetchMock);
    await expect(operator.action(api.manifestIntelligence.synthesize,{intent:"i".repeat(3000),domain:"QA",budget:4,horizon:"one day",constraints:"c".repeat(2000),acceptanceCriteria:"a".repeat(2000)})).rejects.toThrow(/no inference was started/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await operator.query(api.manifestIntelligence.listBlueprints,{})).toEqual([]);
  });
  it("shows only owned mission research with saved HTTPS citations in Manifest context", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const ownedMission = await ctx.db.insert("missions", {
        title: "Owned evidence mission", mission: "Research the user's stated hypothesis", autonomy: "guided",
        budget: 0, status: "draft", completion: 0, approved: false, ownerKey: "research-context-owner",
      });
      const foreignMission = await ctx.db.insert("missions", {
        title: "Foreign evidence mission", mission: "Private research for another operator", autonomy: "guided",
        budget: 0, status: "draft", completion: 0, approved: false, ownerKey: "different-research-owner",
      });
      await ctx.db.insert("research", {
        missionId: ownedMission, query: "Check market demand",
        result: "A source-backed summary with uncertainty noted.",
        citations: ["https://example.com/report", "javascript:alert(1)"], createdAt: 200,
      });
      await ctx.db.insert("research", {
        missionId: foreignMission, query: "Private foreign query",
        result: "Must not leak across operators.", citations: ["https://private.example/report"], createdAt: 300,
      });
      return { ownedMission, foreignMission };
    });

    const operator = t.withIdentity(identity("research-context-owner"));
    const rows = await operator.query(api.manifestIntelligence.listResearchEvidence, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      missionTitle: "Owned evidence mission",
      query: "Check market demand",
      result: "A source-backed summary with uncertainty noted.",
      citations: ["https://example.com/report"],
    });
    expect(rows.some(row => row.missionTitle === "Foreign evidence mission")).toBe(false);
    expect(await t.query(api.manifestIntelligence.listResearchEvidence, {})).toEqual([]);
    expect(ids.ownedMission).not.toBe(ids.foreignMission);
  });

  it("attaches classified assumption evidence only to the owning strategy", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GROQ_API_KEY", "test-provider-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: generated } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const operator = t.withIdentity(identity("assumption-evidence-owner"));
    await operator.action(api.manifestIntelligence.synthesize, {
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
      budget: 25,
      horizon: "14 days",
    });
    const strategy = (await operator.query(api.manifestIntelligence.listStrategies, {}))[0];
    await operator.mutation(api.manifestIntelligence.attachAssumptionEvidence, {
      strategyId: strategy._id,
      evidenceType: "contradicts",
      url: "https://example.com/market-study",
      note: "The study reports lower repeat usage than the assumption predicts.",
      sourcePublishedDate: "2026-08-12",
      sourceAuthority: "peer_reviewed",
      relevance: "The study measured repeat usage in a comparable customer segment.",
      claimMatch: "partially_matches",
    });
    const saved = (await operator.query(api.manifestIntelligence.listStrategies, {})).find(row => row._id === strategy._id)!;
    expect(JSON.parse(saved.value).assumptionEvidence).toMatchObject([{
      evidenceType: "contradicts",
      url: "https://example.com/market-study",
      note: "The study reports lower repeat usage than the assumption predicts.",
      sourcePublishedDate: "2026-08-12",
      sourceAuthority: "peer_reviewed",
      relevance: "The study measured repeat usage in a comparable customer segment.",
      claimMatch: "partially_matches",
    }]);
    expect(JSON.parse(saved.value).assumptionEvidence[0]).toMatchObject({
      sourcePublishedDate: "2026-08-12",
      sourceAuthority: "peer_reviewed",
      relevance: "The study measured repeat usage in a comparable customer segment.",
      claimMatch: "partially_matches",
    });
    expect(typeof JSON.parse(saved.value).assumptionEvidence[0].reviewedAt).toBe("number");
    await expect(operator.mutation(api.manifestIntelligence.attachAssumptionEvidence, {
      strategyId: strategy._id,
      evidenceType: "supports",
      url: "https://example.com/invalid-date",
      note: "Should reject invalid publication date",
      sourcePublishedDate: "2026-02-31",
      sourceAuthority: "official_primary",
      relevance: "This is a validation probe for invalid date values.",
      claimMatch: "not_reviewed",
    })).rejects.toThrow(/publication date/i);
    await expect(operator.mutation(api.manifestIntelligence.attachAssumptionEvidence, {
      strategyId: strategy._id,
      evidenceType: "supports",
      url: "http://example.com/not-https",
      note: "Should be rejected",
      sourceAuthority: "official_primary",
      relevance: "This is a validation probe for the invalid URL scheme.",
      claimMatch: "not_reviewed",
    })).rejects.toThrow(/HTTPS/i);
    await expect(t.withIdentity(identity("different-assumption-owner")).mutation(api.manifestIntelligence.attachAssumptionEvidence, {
      strategyId: strategy._id,
      evidenceType: "supports",
      url: "https://example.com/other",
      note: "Cross-owner write must fail",
      sourceAuthority: "official_primary",
      relevance: "This request should fail the owner access check.",
      claimMatch: "not_reviewed",
    })).rejects.toThrow(/access denied/i);
    expect(JSON.parse((await operator.query(api.manifestIntelligence.listStrategies, {})).find(row => row._id === strategy._id)!.value).assumptionEvidence).toHaveLength(1);
  });

  it("assigns unique receipt keys to rapidly persisted blueprints", async () => {
    const t = convexTest(schema, modules);
    const save = (intent: string) => t.mutation(internal.manifestIntelligence.saveBlueprint, {
      ownerKey: "manifest-key-owner",
      intent,
      domain: "AI product",
      budget: 25,
      horizon: "14 days",
      blueprint: "A bounded proposal.",
    });

    const keys = await Promise.all([
      save("First measurable experiment"),
      save("Second measurable experiment"),
    ]);

    expect(keys[0]).not.toBe(keys[1]);
    const operator = t.withIdentity(identity("manifest-key-owner"));
    const blueprints = await operator.query(api.manifestIntelligence.listBlueprints, {});
    expect(blueprints.map(row => row.key).sort()).toEqual([...keys].sort());
    expect(blueprints.every(row => row.key.startsWith("manifest:"))).toBe(true);
  });

  it("persists the provider blueprint and structured strategies to the authenticated owner's private ledger", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GROQ_API_KEY", "test-provider-key");
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        choices: [{ message: { content: generated } }],
        usage: { prompt_tokens: 120, completion_tokens: 340, total_tokens: 460, cost: 0.00042 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const operator = t.withIdentity(identity("manifest-owner-a"));
    const result = await operator.action(api.manifestIntelligence.synthesize, {
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
      budget: 25,
      horizon: "14 days",
      constraints: "Keep external actions governed and use existing resources.",
      acceptanceCriteria: "Save a readable blueprint and three structured candidates.",
    });

    expect(result).toMatchObject({ saved: true, strategyCount: 3, strategyBlockValid: true, blueprintComplete: false });
    expect(result.missingSections).toContain("Next action");
    expect(result.blueprint).toContain("A bounded proposal");
    expect(result.blueprintKey).toMatch(/^manifest:/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const blueprints = await operator.query(api.manifestIntelligence.listBlueprints, {});
    const strategies = await operator.query(api.manifestIntelligence.listStrategies, {});
    const usage = await operator.query(api.manifestIntelligence.listProviderUsage, {});
    expect(blueprints).toHaveLength(1);
    expect(blueprints[0].key).toBe(result.blueprintKey);
    expect(strategies).toHaveLength(3);
    expect(strategies.every(row => row.key.startsWith(`${result.blueprintKey}:strategy:`))).toBe(true);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      provider: "groq",
      model: "openai/gpt-oss-20b",
      promptTokens: 120,
      completionTokens: 340,
      totalTokens: 460,
      reportedCostUsd: 0.00042,
      costStatus: "provider-reported",
    });
    const otherOwner = t.withIdentity(identity("manifest-owner-b"));
    const otherOwnerBlueprints = await otherOwner.query(api.manifestIntelligence.listBlueprints, {});
    const otherOwnerStrategies = await otherOwner.query(api.manifestIntelligence.listStrategies, {});
    const anonymousBlueprints = await t.query(api.manifestIntelligence.listBlueprints, {});
    const anonymousStrategies = await t.query(api.manifestIntelligence.listStrategies, {});

    expect(blueprints).toHaveLength(1);
    expect(JSON.parse(blueprints[0].value)).toMatchObject({
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
    });
    expect(strategies).toHaveLength(3);
    expect(strategies.map(row => JSON.parse(row.value).name).sort()).toEqual([
      "Manual concierge", "Small pilot", "Workflow prototype",
    ]);
    expect(otherOwnerBlueprints).toEqual([]);
    expect(otherOwnerStrategies).toEqual([]);
    expect(anonymousBlueprints).toEqual([]);
    expect(anonymousStrategies).toEqual([]);
  });

  it("retries structured extraction and persists strategies when the first blueprint omits its block", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GROQ_API_KEY", "test-provider-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: "## Manifest\\nA readable blueprint with three distinct strategy ideas." } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidates) } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const operator = t.withIdentity(identity("manifest-retry-owner"));
    const result = await operator.action(api.manifestIntelligence.synthesize, {
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
      budget: 25,
      horizon: "14 days",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ saved: true, strategyCount: 3, strategyBlockValid: true });
    expect(result.blueprint).toContain("readable blueprint");
    const strategies = await operator.query(api.manifestIntelligence.listStrategies, {});
    expect(strategies).toHaveLength(3);
    expect(strategies.map(row => JSON.parse(row.value).name).sort()).toEqual([
      "Manual concierge", "Small pilot", "Workflow prototype",
    ]);
  });

  it("preserves a readable blueprint when the structured-only retry is invalid", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GROQ_API_KEY", "test-provider-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: "## Manifest\\nA readable blueprint survives a failed structured retry." } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: "This is not a JSON strategy array." } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const operator = t.withIdentity(identity("manifest-invalid-retry-owner"));
    const result = await operator.action(api.manifestIntelligence.synthesize, {
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
      budget: 25,
      horizon: "14 days",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ saved: true, strategyCount: 0, strategyBlockValid: false });
    expect(result.blueprint).toContain("readable blueprint survives");
    expect(await operator.query(api.manifestIntelligence.listBlueprints, {})).toHaveLength(1);
    expect(await operator.query(api.manifestIntelligence.listStrategies, {})).toEqual([]);
  });

  it("persists measured outcomes and prevents another operator from changing them", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GROQ_API_KEY", "test-provider-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: generated } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const operator = t.withIdentity(identity("manifest-outcome-owner"));
    await operator.action(api.manifestIntelligence.synthesize, {
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
      budget: 25,
      horizon: "14 days",
    });
    const strategies = await operator.query(api.manifestIntelligence.listStrategies, {});
    const strategy = strategies[0];

    await operator.mutation(api.manifestIntelligence.recordStrategyOutcome, {
      strategyId: strategy._id,
      outcomeStatus: "partial",
      actualResult: "Pilot reached 4 of 6 target users.",
      evidence: "Pilot interview log, 2026-10-12",
      actualCost: 12,
    });

    const updated = await operator.query(api.manifestIntelligence.listStrategies, {});
    const saved = updated.find(row => row._id === strategy._id);
    expect(JSON.parse(saved!.value)).toMatchObject({
      outcomeStatus: "partial",
      actualResult: "Pilot reached 4 of 6 target users.",
      evidence: "Pilot interview log, 2026-10-12",
      actualCost: 12,
    });
    expect(saved!.source).toBe("manifest-intelligence-operator-measured-outcome");

    await operator.mutation(api.manifestIntelligence.recordStrategyOutcome, {
      strategyId: strategy._id,
      outcomeStatus: "partial",
      actualResult: "Follow-up pilot reached 5 of 6 target users.",
      evidence: "Follow-up pilot interview log",
    });
    const revised = await operator.query(api.manifestIntelligence.listStrategies, {});
    const revisedRecord = JSON.parse(revised.find(row => row._id === strategy._id)!.value);
    expect(revisedRecord.actualResult).toBe("Follow-up pilot reached 5 of 6 target users.");
    expect(revisedRecord.outcomeHistory).toHaveLength(2);
    expect(revisedRecord.outcomeHistory[0]).toMatchObject({
      outcomeStatus: "partial",
      actualResult: "Pilot reached 4 of 6 target users.",
      evidence: "Pilot interview log, 2026-10-12",
      actualCost: 12,
    });
    expect(revisedRecord.outcomeHistory[1]).toMatchObject({
      outcomeStatus: "partial",
      actualResult: "Follow-up pilot reached 5 of 6 target users.",
      evidence: "Follow-up pilot interview log",
      actualCost: null,
    });

    await expect(t.withIdentity(identity("manifest-outcome-owner-b"))
      .mutation(api.manifestIntelligence.recordStrategyOutcome, {
        strategyId: strategy._id,
        outcomeStatus: "succeeded",
        actualResult: "Unauthorized overwrite attempt",
        evidence: "Not owned by this operator",
      })).rejects.toThrow(/not found or access denied/i);

    const afterAttempt = await operator.query(api.manifestIntelligence.listStrategies, {});
    expect(JSON.parse(afterAttempt.find(row => row._id === strategy._id)!.value).outcomeStatus).toBe("partial");
  });

  it("rejects invalid measured costs and preserves the existing outcome", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GROQ_API_KEY", "test-provider-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: generated } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    const operator = t.withIdentity(identity("manifest-cost-owner"));
    await operator.action(api.manifestIntelligence.synthesize, {
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
      budget: 25,
      horizon: "14 days",
    });
    const strategy = (await operator.query(api.manifestIntelligence.listStrategies, {}))[0];
    const validOutcome = {
      strategyId: strategy._id,
      outcomeStatus: "partial" as const,
      actualResult: "Pilot reached 4 of 6 target users.",
      evidence: "Pilot interview log, 2026-10-12",
      actualCost: 12,
    };
    await operator.mutation(api.manifestIntelligence.recordStrategyOutcome, validOutcome);

    for (const actualCost of [-1, 1000001]) {
      await expect(operator.mutation(api.manifestIntelligence.recordStrategyOutcome, {
        ...validOutcome, actualCost,
      })).rejects.toThrow(/actual cost must be finite and between/i);
    }

    const afterAttempts = await operator.query(api.manifestIntelligence.listStrategies, {});
    expect(JSON.parse(afterAttempts.find(row => row._id === strategy._id)!.value)).toMatchObject({
      outcomeStatus: "partial", actualCost: 12,
      actualResult: "Pilot reached 4 of 6 target users.",
    });
  });

  it("does not persist a blueprint or strategy records when every provider attempt fails", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GROQ_API_KEY", "test-provider-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: { message: "provider temporarily unavailable" } }),
      { status: 503, headers: { "content-type": "application/json" } },
    )));

    const operator = t.withIdentity(identity("manifest-provider-failure-owner"));
    await expect(operator.action(api.manifestIntelligence.synthesize, {
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
      budget: 25,
      horizon: "14 days",
    })).rejects.toThrow(/Automatic fallback stopped/i);

    expect(await operator.query(api.manifestIntelligence.listBlueprints, {})).toEqual([]);
    expect(await operator.query(api.manifestIntelligence.listStrategies, {})).toEqual([]);
  });


  it("rejects malformed provider usage metadata before it reaches the private ledger", async () => {
    const t = convexTest(schema, modules);
    const base = {
      ownerKey: "usage-owner",
      provider: "groq",
      model: "test-model",
      totalTokens: 42,
      promptTokens: 30,
      completionTokens: 12,
      reportedCostUsd: 0.001,
      capturedAt: Date.now(),
    };
    for (const invalid of [
      { totalTokens: -1 },
      { promptTokens: Number.NaN },
      { completionTokens: Number.POSITIVE_INFINITY },
      { totalTokens: 100000001 },
      { reportedCostUsd: -0.01 },
      { capturedAt: Number.NaN },
      { provider: " " },
      { model: " " },
    ]) {
      await expect(t.mutation(internal.manifestIntelligence.recordProviderUsageInternal, {
        ...base,
        ...invalid,
      })).rejects.toThrow(/provider-reported|provider usage/i);
    }
    await t.mutation(internal.manifestIntelligence.recordProviderUsageInternal, base);
    const rows = await t.withIdentity(identity("usage-owner")).query(api.manifestIntelligence.listProviderUsage, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "groq", model: "test-model", totalTokens: 42, reportedCostUsd: 0.001 });
  });

  it("rejects non-finite budgets before invoking the provider or writing ledger records", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const operator = t.withIdentity(identity("manifest-invalid-budget-owner"));

    for (const budget of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      await expect(operator.action(api.manifestIntelligence.synthesize, {
        intent: "Create a measurable product experiment for a new digital workflow.",
        domain: "AI product / venture",
        budget,
        horizon: "14 days",
      })).rejects.toThrow(/budget cap must be a finite number/i);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await operator.query(api.manifestIntelligence.listBlueprints, {})).toEqual([]);
    expect(await operator.query(api.manifestIntelligence.listStrategies, {})).toEqual([]);
  });

  it("rejects anonymous synthesis before invoking the provider", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(t.action(api.manifestIntelligence.synthesize, {
      intent: "Create a measurable product experiment for a new digital workflow.",
      domain: "AI product / venture",
      budget: 25,
      horizon: "14 days",
    })).rejects.toThrow(/authenticated operator session required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
