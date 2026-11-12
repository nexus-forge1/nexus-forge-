import {ollamaFixture} from './helpers/ollama-fixture'
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { isSafeResearchUrl } from "../convex/research";

const modules = import.meta.glob("../convex/**/*.ts");

const GATEWAY_URL = "https://egress.test";

function stubGateway() {
  vi.stubEnv("RESEARCH_EGRESS_GATEWAY_URL", GATEWAY_URL);
  vi.stubEnv("RESEARCH_EGRESS_GATEWAY_TOKEN", "gw-test-token");
}

function gatewayResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function identity(subject: string) {
  return {
    subject,
    issuer: "https://nexus-forge.test",
    tokenIdentifier: `https://nexus-forge.test|${subject}`,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Research Oracle persistence", () => {
  it("allows ordinary HTTPS DNS URLs and rejects unsafe URL forms", () => {
    expect(isSafeResearchUrl("https://example.com/research")).toBe(true);
    expect(isSafeResearchUrl("https://www.example.co.uk/path")).toBe(true);
    for (const url of [
      "http://example.com/",
      "https://user:pass@example.com/",
      "https://example.com:8443/",
      "https://localhost/",
      "https://service.localhost/",
      "https://metadata.google.internal/",
      "https://service.internal/",
      "https://service.local/",
      "https://127.0.0.1/",
      "https://127.1/",
      "https://2130706433/",
      "https://0x7f000001/",
      "https://[::1]/",
      "https://singlelabel/",
    ]) {
      expect(isSafeResearchUrl(url), url).toBe(false);
    }
  });
  it("saves an authenticated research result and only its retrieved citations", async () => {
    const t = convexTest(schema, modules);
    const owner = "research-owner-a";
    const missionId = await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Research persistence test",
      mission: "Validate source-backed research persistence",
      autonomy: "guided",
      budget: 0,
      status: "draft",
      completion: 0,
      approved: false,
      ownerKey: owner,
    }));
    const target = "https://example.com/research";
    const wrapped = "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent(target);
    const html = `<a class="result__a" href="${wrapped}">Example research</a><div class="result__snippet">A useful source snippet.</div>`;
    const providerResult = JSON.stringify({
      result: "The retrieved source supports a narrow, testable opportunity.",
      citations: [target, "https://unretrieved.example/fabricated"],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(gatewayResponse({
        ok: true,
        status: 200,
        contentType: "text/html",
        finalUrl: target,
        hops: [target],
        body: "<html><body>Verified source content</body></html>",
        truncated: false,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ollamaFixture({ choices: [{ message: { content: providerResult } }] })), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubEnv('OLLAMA_API_KEY', "test-provider-key");
    stubGateway();
    vi.stubGlobal("fetch", fetchMock);

    const operator = t.withIdentity(identity(owner));
    const result = await operator.action(api.research.search, {
      missionId,
      query: "test a source-backed opportunity",
      deepResearch: false,
    });
    const rows = await operator.query(api.research.list, { missionId });

    expect(result.ok).toBe(true);
    expect((await operator.query(api.platformTasks.summary, { missionId })).rows[0]).toMatchObject({ successes: 1, failures: 0, pending: 0, timedCount: 1 });
    expect(result.result).toContain("narrow, testable opportunity");
    expect(result.citations).toEqual([target]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${GATEWAY_URL}/fetch`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      missionId,
      query: "test a source-backed opportunity",
      result: result.result,
      citations: [target],
    });
    await expect(t.withIdentity(identity("research-owner-b")).query(api.research.list, { missionId }))
      .rejects.toThrow(/access denied|not found/i);
  });

  it("does not follow a source redirect to a private or local destination", async () => {
    const t = convexTest(schema, modules);
    const owner = "research-redirect-owner";
    const missionId = await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Redirect safety test",
      mission: "Verify unsafe source redirects are not followed",
      autonomy: "guided",
      budget: 0,
      status: "draft",
      completion: 0,
      approved: false,
      ownerKey: owner,
    }));
    const target = "https://example.com/research";
    const wrapped = "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent(target);
    const html = `<a class="result__a" href="${wrapped}">Example research</a>`;
    const providerResult = JSON.stringify({ result: "A cautious result based on the available source metadata.", citations: [target] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(gatewayResponse({ ok: false, error: "redirect_destination_rejected" }, 403))
      .mockResolvedValueOnce(new Response(JSON.stringify(ollamaFixture({ choices: [{ message: { content: providerResult } }] })), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubEnv('OLLAMA_API_KEY', "test-provider-key");
    stubGateway();
    vi.stubGlobal("fetch", fetchMock);

    const operator = t.withIdentity(identity(owner));
    const result = await operator.action(api.research.search, {
      missionId,
      query: "test unsafe redirect handling",
      deepResearch: false,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${GATEWAY_URL}/fetch`);
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("127.0.0.1"))).toBe(false);
    expect(result.citations).toEqual([target]);
  });

  it("stops after the redirect-hop limit and never fetches the next destination", async () => {
    const t = convexTest(schema, modules);
    const owner = "research-redirect-cap-owner";
    const missionId = await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Redirect cap test",
      mission: "Verify redirect chains have a strict hop limit",
      autonomy: "guided",
      budget: 0,
      status: "draft",
      completion: 0,
      approved: false,
      ownerKey: owner,
    }));
    const target = "https://example.com/research";
    const wrapped = "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent(target);
    const html = `<a class="result__a" href="${wrapped}">Example research</a>`;
    const providerResult = JSON.stringify({ result: "Result based only on available source metadata.", citations: [] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(gatewayResponse({ ok: false, error: "redirect_limit" }, 422))
      .mockResolvedValueOnce(new Response(JSON.stringify(ollamaFixture({ choices: [{ message: { content: providerResult } }] })), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubEnv('OLLAMA_API_KEY', "test-provider-key");
    stubGateway();
    vi.stubGlobal("fetch", fetchMock);

    await expect(t.withIdentity(identity(owner)).action(api.research.search, {
      missionId,
      query: "test redirect chain limit",
      deepResearch: false,
    })).rejects.toThrow(/no supported retrieved citations/);
    expect(await t.withIdentity(identity(owner)).query(api.research.list, { missionId })).toEqual([]);
    expect((await t.withIdentity(identity(owner)).query(api.platformTasks.summary, { missionId })).rows[0]).toMatchObject({ successes: 0, failures: 1, pending: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${GATEWAY_URL}/fetch`);
  });

  it("synthesizes saved research and persists an owner-scoped learning memory", async () => {
    const t = convexTest(schema, modules);
    const owner = "research-synthesis-owner";
    const missionId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("missions", {
        title: "Synthesis persistence test",
        mission: "Verify research synthesis is evidence-backed and persisted",
        autonomy: "guided", budget: 0, status: "draft", completion: 0, approved: false, ownerKey: owner,
      });
      await ctx.db.insert("research", {
        missionId: id,
        query: "market signal",
        result: "A credible source indicates a measurable customer pain point.",
        citations: ["https://example.com/evidence"],
        createdAt: Date.now(),
      });
      return id;
    });
    const synthesis = "SIGNALS: customer pain point. UNCERTAINTY: sample size. OPPORTUNITIES: validate demand. RISKS: weak evidence. NEXT QUESTION: will customers pay?";
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(ollamaFixture({ choices: [{ message: { content: synthesis } }] })), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubEnv('OLLAMA_API_KEY', "test-provider-key");
    vi.stubGlobal("fetch", fetchMock);

    const result = await t.withIdentity(identity(owner)).action(api.research.synthesize, { missionId, ownerKey: owner });
    const memories = await t.run(async (ctx) => ctx.db.query("memories").withIndex("by_owner", (q) => q.eq("ownerKey", owner)).collect());

    expect(result.ok).toBe(true);
    expect(result.synthesis).toContain("customer pain point");
    expect(result.sourceCount).toBe(1);
    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({ missionId, category: "research-synthesis", value: result.synthesis, source: "NEXUS Research Oracle" });
  });

  it("rejects synthesis for another operator before calling the provider", async () => {
    const t = convexTest(schema, modules);
    const missionId = await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Foreign synthesis test", mission: "Verify synthesis ownership", autonomy: "guided", budget: 0,
      status: "draft", completion: 0, approved: false, ownerKey: "research-synthesis-owner-a",
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(t.withIdentity(identity("research-synthesis-owner-b")).action(api.research.synthesize, {
      missionId, ownerKey: "research-synthesis-owner-a",
    })).rejects.toThrow(/access denied|not found/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects anonymous research before making external requests", async () => {
    const t = convexTest(schema, modules);
    const missionId = await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Anonymous research test",
      mission: "Validate anonymous access is rejected",
      autonomy: "guided",
      budget: 0,
      status: "draft",
      completion: 0,
      approved: false,
      ownerKey: "research-owner-a",
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(t.action(api.research.search, {
      missionId,
      query: "test research",
      deepResearch: false,
    })).rejects.toThrow(/authenticated operator session required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the egress gateway is not configured", async () => {
    const t = convexTest(schema, modules);
    const missionId = await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Unconfigured gateway test",
      mission: "Verify research stops when the egress gateway is missing",
      autonomy: "guided",
      budget: 0,
      status: "draft",
      completion: 0,
      approved: false,
      ownerKey: "research-owner-a",
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(t.withIdentity(identity("research-owner-a")).action(api.research.search, {
      missionId,
      query: "test research",
      deepResearch: false,
    })).rejects.toThrow(/egress gateway is not configured.*fail closed/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed without a direct-fetch fallback when the gateway rejects its credentials", async () => {
    const t = convexTest(schema, modules);
    const owner = "research-gateway-auth-owner";
    const missionId = await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Gateway auth failure test",
      mission: "Verify gateway credential failures stop research",
      autonomy: "guided",
      budget: 0,
      status: "draft",
      completion: 0,
      approved: false,
      ownerKey: owner,
    }));
    const target = "https://example.com/research";
    const wrapped = "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent(target);
    const html = `<a class="result__a" href="${wrapped}">Example research</a>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(gatewayResponse({ ok: false, error: "unauthorized" }, 401));
    vi.stubEnv('OLLAMA_API_KEY', "test-provider-key");
    stubGateway();
    vi.stubGlobal("fetch", fetchMock);

    await expect(t.withIdentity(identity(owner)).action(api.research.search, {
      missionId,
      query: "test gateway credential failure",
      deepResearch: false,
    })).rejects.toThrow(/fail closed/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${GATEWAY_URL}/fetch`);
    expect(fetchMock.mock.calls.some(call => String(call[0]).startsWith(target))).toBe(false);
  });

  it("skips a source whose gateway-reported redirect hop fails application validation", async () => {
    const t = convexTest(schema, modules);
    const owner = "research-hop-validation-owner";
    const missionId = await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Hop revalidation test",
      mission: "Verify application-level redirect hop revalidation",
      autonomy: "guided",
      budget: 0,
      status: "draft",
      completion: 0,
      approved: false,
      ownerKey: owner,
    }));
    const target = "https://example.com/research";
    const wrapped = "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent(target);
    const html = `<a class="result__a" href="${wrapped}">Example research</a>`;
    const providerResult = JSON.stringify({ result: "Result built from source metadata only.", citations: [target] });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(html, { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(gatewayResponse({
        ok: true,
        status: 200,
        contentType: "text/html",
        finalUrl: target,
        hops: [target, "http://127.0.0.1/admin"],
        body: "<html><body>should never be used</body></html>",
        truncated: false,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ollamaFixture({ choices: [{ message: { content: providerResult } }] })), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubEnv('OLLAMA_API_KEY', "test-provider-key");
    stubGateway();
    vi.stubGlobal("fetch", fetchMock);

    const result = await t.withIdentity(identity(owner)).action(api.research.search, {
      missionId,
      query: "test hop revalidation",
      deepResearch: false,
    });

    expect(result.ok).toBe(true);
    expect(result.result).not.toContain("should never be used");
    expect(result.citations).toEqual([target]);
  });

  it("reports the egress gateway as unconfigured without external calls", async () => {
    const t = convexTest(schema, modules);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const status = await t.action(internal.research.egressHealth, {});
    expect(status).toEqual({ configured: false, healthy: false, policy: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
