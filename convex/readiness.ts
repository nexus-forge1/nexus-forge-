import { action, internalAction, internalMutation, mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { requireOperator } from "./permissions"
import { fetchResearchPageViaGateway } from "./research"

type CheckSpec = { key: string; name: string; criterion: string; severity: "required" | "warning" }
type CheckResult = CheckSpec & { status: "pass" | "fail"; detail: string; evidence: string }

const CHECKS: CheckSpec[] = [
  { key: "https", name: "HTTPS", criterion: "Deployment must be served over HTTPS.", severity: "required" },
  { key: "reachable", name: "Reachability", criterion: "Deployment URL must respond successfully.", severity: "required" },
  { key: "html", name: "HTML document", criterion: "Deployment must return a parseable HTML document.", severity: "required" },
  { key: "title", name: "Page title", criterion: "Document must declare a non-empty <title>.", severity: "warning" },
  { key: "viewport", name: "Mobile viewport", criterion: "Document must declare a responsive viewport meta tag.", severity: "required" },
  { key: "charset", name: "Character encoding", criterion: "Document must declare its character encoding.", severity: "warning" },
]

export function normalizeUrl(siteUrl: string): string {
  let normalized = siteUrl.trim()
  if (normalized.length > 2048) throw new Error('Deployment URL must be at most 2048 characters')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) && !/^https?:\/\//i.test(normalized)) throw new Error("Only http and https URLs are supported")
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`
  let parsed: URL
  try { parsed = new URL(normalized) } catch { throw new Error("Enter a valid deployment URL, for example https://example.com") }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http and https URLs are supported")
  if (parsed.username || parsed.password) throw new Error("Deployment URLs must not contain embedded credentials")
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname === "metadata.google.internal" || hostname === "metadata") {
    throw new Error("Local and metadata hosts cannot be probed")
  }
  // Reject IP literals to avoid direct access to loopback, private, link-local, and cloud metadata addresses.
  if (hostname.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || /^0x[\da-f]+$/i.test(hostname) || /^\d+$/.test(hostname)) {
    throw new Error("Use a public DNS hostname rather than an IP address")
  }
  if (parsed.port && !((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80"))) {
    throw new Error("Only standard HTTP/HTTPS ports are supported")
  }
  parsed.hash = ""
  return parsed.toString()
}

async function probe(url: string): Promise<{ ok: boolean; status: number; headers: string; bodySnippet: string; error?: string; finalUrl?: string }> {
  try {
    const target = normalizeUrl(url)
    // The gateway resolves and pins public addresses and validates every redirect.
    // HTTP input remains reportable as a failed HTTPS check, without fetching it.
    const page = await fetchResearchPageViaGateway(target)
    return { ok: page.status >= 200 && page.status < 300, status: page.status,
      headers: JSON.stringify({"content-type":page.contentType}), bodySnippet: page.body.slice(0,5000), finalUrl: page.finalUrl }
  } catch (error) {
    return { ok: false, status: 0, headers: "{}", bodySnippet: "", error: error instanceof Error ? error.message : String(error), finalUrl: url }
  }
}

async function runChecks(url: string): Promise<CheckResult[]> {
  const first = await probe(url)
  const finalUrl = first.finalUrl ?? url
  const second = first
  const html = second.bodySnippet
  const lower = html.toLowerCase()
  return CHECKS.map(spec => {
    let status: "pass" | "fail" = "fail"
    let detail = ""
    let evidence = ""
    if (spec.key === "https") {
      const isHttps = finalUrl.startsWith("https://")
      status = isHttps ? "pass" : "fail"
      detail = isHttps ? `Final URL is served over HTTPS: ${finalUrl}` : `Final URL is not HTTPS: ${finalUrl}`
      evidence = `Fetch followed redirects to ${finalUrl}; scheme=${new URL(finalUrl).protocol.replace(":", "")}`
    } else if (spec.key === "reachable") {
      status = second.ok ? "pass" : "fail"
      detail = second.ok ? `Server responded with HTTP ${second.status}` : second.error ? `Request failed: ${second.error}` : `Server responded with HTTP ${second.status}`
      evidence = `HTTP status ${second.status} from GET ${finalUrl}`
    } else if (spec.key === "html") {
      const looksHtml = lower.includes("<!doctype html") || (lower.includes("<html") && lower.includes("<body"))
      status = looksHtml ? "pass" : "fail"
      detail = looksHtml ? "Response body contains a valid HTML document structure." : "Response body does not contain an HTML document."
      evidence = looksHtml ? `Body starts with: ${html.trim().slice(0, 120)}` : `Body sample (first 120 chars): ${html.trim().slice(0, 120) || "(empty)"}`
    } else if (spec.key === "title") {
      const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
      const title = match?.[1]?.trim() ?? ""
      status = title.length > 0 ? "pass" : "fail"
      detail = status === "pass" ? `Document title is "${title}"` : "Document has no <title> element or it is empty."
      evidence = status === "pass" ? `Parsed <title>: ${title.slice(0, 120)}` : "No <title>...</title> match found in the response body."
    } else if (spec.key === "viewport") {
      const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html)
      status = hasViewport ? "pass" : "fail"
      detail = hasViewport ? "Responsive viewport meta tag is present." : "No responsive viewport meta tag found."
      evidence = hasViewport ? (html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i)?.[0] ?? "viewport meta present") : "No <meta name=\"viewport\"> element found in <head>."
    } else if (spec.key === "charset") {
      const hasCharset = /<meta[^>]+charset/i.test(html) || /charset=/i.test(second.headers)
      status = hasCharset ? "pass" : "fail"
      detail = hasCharset ? "Character encoding is declared." : "No character encoding declaration found in document or headers."
      evidence = hasCharset ? (html.match(/<meta[^>]+charset[^>]*>/i)?.[0] ?? `Response header content-type: ${second.headers.slice(0, 160)}`) : "No charset meta tag and no charset in content-type header."
    }
    return { ...spec, status, detail, evidence }
  })
}

export const run: any = (action as any)({
  args: { siteUrl: v.string(), label: v.optional(v.string()) },
  returns: v.object({ runId: v.id("readinessRuns"), status: v.union(v.literal("pass"), v.literal("fail")), passedCount: v.number(), failedCount: v.number(), totalCount: v.number() }),
  handler: async (ctx: any, args: any) => {
    const operatorId = await requireOperator(ctx)
    if (args.label?.trim().length > 160) throw new Error('Readiness label must be at most 160 characters')
    const siteUrl = normalizeUrl(args.siteUrl)
    const results = await runChecks(siteUrl)
    const passedCount = results.filter(r => r.status === "pass").length
    const failedCount = results.length - passedCount
    const status = results.some(r => r.severity === "required" && r.status === "fail") ? "fail" as const : "pass" as const
    const saveRunRef: any = (internal as any).readiness.saveRun
    const saved = await (ctx as any).runMutation(saveRunRef, {
      siteUrl, label: args.label?.trim() || new URL(siteUrl).hostname,
      status, passedCount, failedCount, totalCount: results.length, operatorId,
      results: results.map(r => ({ checkKey: r.key, name: r.name, criterion: r.criterion, severity: r.severity, status: r.status, detail: r.detail, evidence: r.evidence })),
    })
    return saved as any
  },
})

// Canonical deployment gate used by the protected GitHub callback.
export const runForDelivery: any = internalAction({
  args: { siteUrl: v.string(), deliveryId: v.id("deliveries") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const delivery = await (ctx as any).runQuery((internal as any).delivery.getInternal, { id: args.deliveryId })
    if (!delivery) throw new Error("Delivery not found for readiness history")
    const mission = await (ctx as any).runQuery((internal as any).missions.getByIdInternal, { id: delivery.missionId })
    if (!mission?.ownerKey) throw new Error("Delivery owner not found for readiness history")
    const siteUrl = normalizeUrl(args.siteUrl)
    const results = await runChecks(siteUrl)
    const passedCount = results.filter(r => r.status === "pass").length
    const failedCount = results.length - passedCount
    const status = results.some(r => r.severity === "required" && r.status === "fail") ? "fail" as const : "pass" as const
    const saved = await (ctx as any).runMutation((internal as any).readiness.saveRun, {
      siteUrl, label: `Delivery ${args.deliveryId}`, status, passedCount, failedCount, totalCount: results.length, operatorId: mission.ownerKey,
      results: results.map(r => ({ checkKey: r.key, name: r.name, criterion: r.criterion, severity: r.severity, status: r.status, detail: r.detail, evidence: r.evidence })),
    })
    return saved as any
  },
})

export const saveRun: any = internalMutation({
  args: {
    siteUrl: v.string(), label: v.string(), status: v.union(v.literal("pass"), v.literal("fail")),
    passedCount: v.number(), failedCount: v.number(), totalCount: v.number(), operatorId: v.string(),
    results: v.array(v.object({ checkKey: v.string(), name: v.string(), criterion: v.string(), severity: v.union(v.literal("required"), v.literal("warning")), status: v.union(v.literal("pass"), v.literal("fail")), detail: v.string(), evidence: v.string() })),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const ranAt = Date.now()
    const runId = await (ctx as any).db.insert("readinessRuns", { siteUrl: args.siteUrl, label: args.label, status: args.status, passedCount: args.passedCount, failedCount: args.failedCount, totalCount: args.totalCount, ranAt, operatorId: args.operatorId })
    for (const result of args.results) await (ctx as any).db.insert("readinessChecks", { runId, checkKey: result.checkKey, name: result.name, criterion: result.criterion, severity: result.severity, status: result.status, detail: result.detail, evidence: result.evidence, ranAt })
    return { runId, status: args.status, passedCount: args.passedCount, failedCount: args.failedCount, totalCount: args.totalCount }
  },
})

export const listRuns: any = (query as any)({
  args: {},
  returns: v.any(),
  handler: async (ctx: any) => { const operatorId = await requireOperator(ctx); const runs = await (ctx as any).db.query("readinessRuns").withIndex("by_operator_ranAt", (q: any) => q.eq("operatorId", operatorId)).order("desc").take(25); return runs.map((run: any) => ({ _id: run._id, siteUrl: run.siteUrl, label: run.label, status: run.status, passedCount: run.passedCount, failedCount: run.failedCount, totalCount: run.totalCount, ranAt: run.ranAt })); },
})

export const getRun: any = (query as any)({
  args: { runId: v.id("readinessRuns") },
  returns: v.any(),
  handler: async (ctx: any, args: any) => {
    const operatorId = await requireOperator(ctx)
    const run = await (ctx as any).db.get(args.runId)
    if (!run || run.operatorId !== operatorId) throw new Error("Readiness run not found or access denied")
    const checks = await (ctx as any).db.query("readinessChecks").withIndex("by_run", (q: any) => q.eq("runId", args.runId)).order("asc").collect()
    return {
      run: { _id: run._id, siteUrl: run.siteUrl, label: run.label, status: run.status, passedCount: run.passedCount, failedCount: run.failedCount, totalCount: run.totalCount, ranAt: run.ranAt },
      checks: checks.map((c: any) => ({ _id: c._id, checkKey: c.checkKey, name: c.name, criterion: c.criterion, severity: c.severity, status: c.status, detail: c.detail, evidence: c.evidence })),
    }
  },
})
