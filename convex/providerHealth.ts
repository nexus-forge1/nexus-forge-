import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {boundedText} from "./boundedResponse";
import { requireOperator } from "./permissions";
import { getAuthUserId } from "@convex-dev/auth/server";

const configs = [
  { name: "cloudflare", label: "Cloudflare Workers AI", url: "https://api.cloudflare.com/client/v4/accounts", key: "CLOUDFLARE_API_TOKEN", model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast" },
  { name: "groq", label: "Groq", url: "https://api.groq.com/openai/v1", key: "GROQ_API_KEY", model: "openai/gpt-oss-20b" },
  { name: "cerebras", label: "Cerebras", url: "https://api.cerebras.ai/v1", key: "CEREBRAS_API_KEY", model: "gpt-oss-120b" },
  { name: "openrouter", label: "OpenRouter (free-model fallback chain)", url: "https://openrouter.ai/api/v1", key: "OPENROUTER_API_KEY", model: "openai/gpt-oss-120b:free" },
] as const;

const providerResult = v.object({
  name: v.string(),
  label: v.string(),
  configured: v.boolean(),
  status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("offline"), v.literal("unconfigured")),
  latencyMs: v.number(),
  detail: v.string(),
});

export const recordBatch: any = (internalMutation as any)({
  args: { checkedAt: v.number(), operatorId: v.string(), results: v.array(providerResult) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const result of args.results) {
      await ctx.db.insert("providerHealthChecks", { ...result, checkedAt: args.checkedAt, operatorId: args.operatorId });
    }
    return null;
  },
});

export const history: any = (query as any)({
  args: {},
  returns: v.array(v.object({
    _id: v.id("providerHealthChecks"),
    _creationTime: v.number(),
    name: v.string(), label: v.string(), configured: v.boolean(),
    status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("offline"), v.literal("unconfigured")),
    latencyMs: v.number(), detail: v.string(), checkedAt: v.number(), operatorId: v.string(),
  })),
  handler: async (ctx) => {
    // Client queries can mount before the auth provider finishes restoring the session.
    // Return no private rows during that brief state rather than producing repeated
    // unauthenticated-query errors. The health-check action itself still requires auth.
    const operatorId = await getAuthUserId(ctx);
    if (!operatorId) return [];
    return await ctx.db.query("providerHealthChecks").withIndex("by_operator_checkedAt", q => q.eq("operatorId", operatorId)).order("desc").take(60);
  },
});

export const check: any = (action as any)({
  args: {},
  returns: v.array(v.object({
    name: v.string(),
    label: v.string(),
    configured: v.boolean(),
    status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("offline"), v.literal("unconfigured")),
    latencyMs: v.number(),
    detail: v.string(),
  })),
  handler: async (ctx) => {
    const operatorId = await requireOperator(ctx);
    await ctx.runMutation((internal as any).billingDiagnostics.authorize, { ownerKey: operatorId });
    const results: Array<{
      name: string;
      label: string;
      configured: boolean;
      status: "healthy" | "degraded" | "offline" | "unconfigured";
      latencyMs: number;
      detail: string;
    }> = [];

    // A public /models catalog may respond even when a key is invalid.
    // Exercise the authenticated chat-completions endpoint with a tiny prompt
    // so health reflects actual inference readiness, not just reachability.
    for (const provider of configs) {
      const rawKey = process.env[provider.key]?.trim();
      const key = rawKey?.replace(/^["\']|["\']$/g, "").trim();
      if (!key || (provider.name === "cloudflare" && !process.env.CLOUDFLARE_ACCOUNT_ID?.trim())) {
        results.push({ name: provider.name, label: provider.label, configured: false, status: "unconfigured", latencyMs: 0, detail: provider.name === "cloudflare" && !process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ? "Cloudflare account ID is not configured." : "API key is not configured." });
        continue;
      }

      const started = Date.now();
      try {
        const model = process.env[`${provider.name.toUpperCase()}_MODEL`]?.trim() || process.env[`${provider.key}_MODEL`]?.trim() || provider.model;
        const openRouterModels = provider.name === "openrouter"
          ? [model, process.env.OPENROUTER_SECONDARY_MODEL?.trim() || "meta-llama/llama-3.3-70b-instruct:free", "openrouter/free"]
              .filter((candidate, index, all) => Boolean(candidate) && all.indexOf(candidate) === index)
          : undefined;
        const endpoint = provider.name === "cloudflare"
          ? `${provider.url}/${process.env.CLOUDFLARE_ACCOUNT_ID?.trim()}/ai/v1/chat/completions`
          : `${provider.url}/chat/completions`;
        const response = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(25000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            ...(provider.name === "openrouter" ? { "HTTP-Referer": "https://bphntw8kdojl9qvuifywyjtk.macaly.app", "X-Title": "NEXUS FORGE" } : {}),
          },
          body: JSON.stringify({
            ...(openRouterModels ? { models: openRouterModels } : { model }),
            messages: [{ role: "user", content: "Reply with the single word OK." }],
            // Reasoning-capable models can spend most of a tiny token budget on
            // internal reasoning and return no completion text. Use a realistic
            // smoke-test budget so healthy Groq/Cerebras endpoints are not falsely degraded.
            max_tokens: 512,
            temperature: 0,
          }),
        });
        const latencyMs = Date.now() - started;
        const body = await boundedText(response, 256 * 1024);

        if (response.ok) {
          let usable = false;
          let diagnostic = "Endpoint responded, but returned no usable completion text.";
          try {
            const parsed = JSON.parse(body);
            const choice = parsed?.choices?.[0];
            const message = choice?.message;
            usable = typeof message?.content === "string" && message.content.trim().length > 0;
            if (!usable) {
              const topKeys = parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 8).join(",") : typeof parsed;
              const choiceKeys = choice && typeof choice === "object" ? Object.keys(choice).slice(0, 8).join(",") : "none";
              const messageKeys = message && typeof message === "object" ? Object.keys(message).slice(0, 8).join(",") : "none";
              diagnostic = `No text content; top-level keys: ${topKeys}; choice keys: ${choiceKeys}; message keys: ${messageKeys}.`;
            }
          } catch {
            diagnostic = "Endpoint returned HTTP success but its body was not valid JSON.";
          }
          results.push({
            name: provider.name,
            label: provider.label,
            configured: true,
            status: usable ? "healthy" : "degraded",
            latencyMs,
            detail: usable ? "Authenticated chat completion succeeded." : diagnostic,
          });
        } else {
          const retryable = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500;
          const detail = body.replaceAll(key, "[redacted]").slice(0, 180).replace(/\s+/g, " ").trim();
          results.push({
            name: provider.name,
            label: provider.label,
            configured: true,
            status: retryable ? "degraded" : "offline",
            latencyMs,
            detail: `${response.status}: ${detail || "Provider rejected the completion request."}`,
          });
        }
      } catch (error) {
        results.push({
          name: provider.name,
          label: provider.label,
          configured: true,
          status: "offline",
          latencyMs: Date.now() - started,
          detail: "Provider request or response could not be confirmed. Review connection health before another check.",
        });
      }
    }
    await ctx.runMutation((internal as any).providerHealth.recordBatch, { checkedAt: Date.now(), operatorId, results });
    return results;
  },
});
