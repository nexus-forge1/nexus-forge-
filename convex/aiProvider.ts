type ProviderName = "cloudflare" | "groq" | "mistral" | "cerebras" | "openrouter" | "huggingface" | "ollama";
type ChatRole = "planner" | "wave1" | "wave2" | "critic" | "research";

const providers: Record<ProviderName, { url: string; key: string; model: string }> = {
  cloudflare: { url: "https://api.cloudflare.com/client/v4/accounts", key: "CLOUDFLARE_API_TOKEN", model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast" },
  groq: { url: "https://api.groq.com/openai/v1", key: "GROQ_API_KEY", model: "openai/gpt-oss-20b" },
  mistral: { url: "https://api.mistral.ai/v1", key: "MISTRAL_API_KEY", model: "mistral-small-latest" },
  cerebras: { url: "https://api.cerebras.ai/v1", key: "CEREBRAS_API_KEY", model: "gpt-oss-120b" },
  // OpenRouter model-level fallbacks are best-effort; free endpoints may be rate-limited or unavailable.
  openrouter: { url: "https://openrouter.ai/api/v1", key: "OPENROUTER_API_KEY", model: "openai/gpt-oss-120b:free" },
  // Hugging Face Inference Providers has limited free-tier quota; availability and free credits vary by account.
  huggingface: { url: "https://router.huggingface.co/v1", key: "HUGGINGFACE_API_KEY", model: "Qwen/Qwen3-4B-Instruct-2507" },
  // Ollama is intentionally configured by a private base URL rather than an API key.
  ollama: { url: "http://127.0.0.1:11434/v1", key: "OLLAMA_BASE_URL", model: "nexus-forge-chat:1b" },
};

const routes: Record<ChatRole, ProviderName> = {
  planner: "groq",
  wave1: "groq",
  wave2: "cerebras",
  critic: "cerebras",
  research: "groq",
};

const localModels: Record<ChatRole, string> = {
  planner: "nexus-forge-mission:1b",
  wave1: "nexus-forge-code:3b",
  wave2: "nexus-forge-code:3b",
  critic: "nexus-forge-critic:1b",
  research: "nexus-forge-research:1b",
};

// Keep automatic routing limited to the selected hosted providers by default. Ollama becomes
// part of routing only when OLLAMA_BASE_URL is configured, and becomes primary only when
// NEXUS_OLLAMA_PRIMARY=true. This lets production roll out local models gradually.
const fallbacks: ProviderName[] = ["cloudflare", "groq", "cerebras"];

function text(data: any): string {
  const content = data?.choices?.[0]?.message?.content ?? data?.text ?? data?.output;
  if (typeof content === "string" && content.trim()) return content.trim();
  throw new Error("AI provider returned no usable text.");
}

type ProviderUsage = { provider: ProviderName; model: string; promptTokens?: number; completionTokens?: number; totalTokens?: number; reportedCostUsd?: number; capturedAt: number };
type UsageRecorder = (usage: ProviderUsage) => Promise<void>;

function isOllamaConfigured() {
  return Boolean(process.env.OLLAMA_BASE_URL?.trim());
}

function isTruthy(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function providerConfigured(provider: ProviderName) {
  if (provider === "ollama") return isOllamaConfigured();
  return Boolean(process.env[providers[provider].key]?.trim()) && (provider !== "cloudflare" || Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim()));
}

function modelFor(provider: ProviderName, role?: ChatRole) {
  if (provider === "ollama" && role) {
    return process.env[`OLLAMA_MODEL_${role.toUpperCase()}`]?.trim() || localModels[role];
  }
  const cfg = providers[provider];
  return process.env[`${provider.toUpperCase()}_MODEL`]?.trim() || process.env[`${cfg.key}_MODEL`]?.trim() || cfg.model;
}

async function call(provider: ProviderName, prompt: string, maxTokens: number, onUsage?: UsageRecorder, role?: ChatRole): Promise<string> {
  const cfg = providers[provider];
  const rawKey = process.env[cfg.key]?.trim();
  const key = rawKey?.replace(/^["']|["']$/g, "").trim();
  if (provider === "ollama" && !isOllamaConfigured()) throw new Error("ollama is not configured: set OLLAMA_BASE_URL.");
  if (provider === "cloudflare" && !process.env.CLOUDFLARE_ACCOUNT_ID?.trim()) throw new Error("Cloudflare is not configured: set CLOUDFLARE_ACCOUNT_ID.");
  if (provider !== "ollama" && !key) throw new Error(`${provider} is not configured.`);
  const model = modelFor(provider, role);
  const openRouterModels = provider === "openrouter"
    ? [model, process.env.OPENROUTER_SECONDARY_MODEL?.trim() || "meta-llama/llama-3.3-70b-instruct:free", "openrouter/free"]
        .filter((candidate, index, all) => Boolean(candidate) && all.indexOf(candidate) === index)
    : undefined;
  const boundedPrompt = prompt.length > 8000
    ? `${prompt.slice(0, 5000)}\n\n...[context truncated for provider limits]...\n\n${prompt.slice(-2000)}`
    : prompt;
  const boundedMaxTokens = Math.min(maxTokens, provider === "ollama" ? 2048 : 3000);
  const endpoint = provider === "cloudflare"
    ? `${cfg.url}/${process.env.CLOUDFLARE_ACCOUNT_ID?.trim()}/ai/v1/chat/completions`
    : provider === "ollama"
      ? `${(process.env.OLLAMA_BASE_URL?.trim() || cfg.url).replace(/\/$/, "")}/chat/completions`
      : `${cfg.url}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(provider === "ollama" ? 60000 : 25000),
    headers: {
      "Content-Type": "application/json",
      ...(provider !== "ollama" ? { Authorization: `Bearer ${key}` } : {}),
      ...(provider === "openrouter" ? { "HTTP-Referer": "https://bphntw8kdojl9qvuifywyjtk.macaly.app", "X-Title": "NEXUS FORGE" } : {}),
    },
    body: JSON.stringify({ ...(openRouterModels ? { models: openRouterModels } : { model }), messages: [{ role: "user", content: boundedPrompt }], max_tokens: boundedMaxTokens, temperature: 0.15 }),
  });
  const body = await response.text();
  if (!response.ok) {
    const detail = body.slice(0, 220).replace(/\s+/g, " ").trim();
    const retryable = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500;
    const error = new Error(`${provider} failed (${response.status}${retryable ? ", retryable" : ", non-retryable"}): ${detail}`);
    (error as Error & { retryable?: boolean; provider?: string; status?: number }).retryable = retryable;
    (error as Error & { provider?: string }).provider = provider;
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  const payload = JSON.parse(body);
  if (onUsage) {
    const usage = payload?.usage ?? payload?.result?.usage ?? {};
    const tokenCount = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 100000000 ? value : undefined;
    const rawCost = usage.cost ?? payload?.cost ?? payload?.result?.cost;
    const reportedCostUsd = typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost >= 0 && rawCost <= 1000000 ? rawCost : undefined;
    const promptTokens = tokenCount(usage.prompt_tokens) ?? tokenCount(usage.input_tokens);
    const completionTokens = tokenCount(usage.completion_tokens) ?? tokenCount(usage.output_tokens);
    // Ollama may omit token metadata. Missing values remain unknown; credit policy handles this case.
    const totalTokens = tokenCount(usage.total_tokens) ?? (promptTokens !== undefined && completionTokens !== undefined ? tokenCount(promptTokens + completionTokens) : undefined);
    const responseModel = payload?.model ?? payload?.result?.model;
    const measuredModel = typeof responseModel === "string" && responseModel.trim() && responseModel.trim().length <= 160 ? responseModel.trim() : model;
    if (promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined || reportedCostUsd !== undefined) {
      try {
        await onUsage({ provider, model: measuredModel, promptTokens, completionTokens, totalTokens, reportedCostUsd, capturedAt: Date.now() });
      } catch {
        console.warn("AI provider usage receipt could not be saved; accounting may be incomplete. No inference retry was made for this recording failure.");
      }
    }
  }
  return text(payload);
}

export async function callAiProvider(role: ChatRole, prompt: string, maxTokens: number, onUsage?: UsageRecorder): Promise<string> {
  const localFirst = isTruthy(process.env.NEXUS_OLLAMA_PRIMARY) && providerConfigured("ollama");
  const ordered = localFirst
    ? ["ollama" as const, routes[role], ...fallbacks.filter((p) => p !== routes[role])]
    : [routes[role], ...fallbacks.filter((p) => p !== routes[role]), ...(providerConfigured("ollama") ? ["ollama" as const] : [])];
  const configured = ordered.filter(providerConfigured);
  if (!configured.length) throw new Error("No AI providers configured. Set OLLAMA_BASE_URL or a supported hosted-provider credential.");
  const failures: string[] = [];
  for (const provider of configured) {
    try { return await call(provider, prompt, maxTokens, onUsage, role); }
    catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      failures.push(failure.message);
    }
  }
  throw new Error(`All configured AI providers failed: ${failures.join(" | ")}`);
}

// Explicit evaluation calls never fall back, so comparisons cannot silently measure a different provider.
export async function callNamedEvaluationProvider(provider: 'cloudflare' | 'groq' | 'cerebras' | 'ollama', prompt: string, maxTokens: number, onUsage?: UsageRecorder) {
  return call(provider, prompt, maxTokens, onUsage, provider === "ollama" ? "planner" : undefined);
}

export const COUNCIL_MODELS = {
  planner: "planner" as const,
  wave1: "wave1" as const,
  wave2: "wave2" as const,
  critic: "critic" as const,
  research: "research" as const,
};

export const NEXUS_LOCAL_MODELS = localModels;

export const AI_PROVIDER_PLAN = {
  planner: "Groq with Cloudflare Workers AI fallback; opt-in nexus-forge-mission via Ollama",
  wave1: "Groq with Cloudflare Workers AI fallback; opt-in nexus-forge-code via Ollama",
  wave2: "Cerebras with Cloudflare Workers AI fallback; opt-in nexus-forge-code via Ollama",
  critic: "Cerebras with Cloudflare Workers AI fallback; opt-in nexus-forge-critic via Ollama",
  research: "Groq with Cloudflare Workers AI fallback; opt-in nexus-forge-research via Ollama",
  openrouter: "Manual diagnostic configuration only; not included in automatic routing until inference and quota reliability are confirmed",
  huggingface: "Deferred from automatic routing until a key is configured and inference is verified",
  ollama: "Private small-model family; enabled by OLLAMA_BASE_URL and promoted to primary only with NEXUS_OLLAMA_PRIMARY=true",
  fallbackOrder: "Role primary (Groq/Cerebras) → Cloudflare Workers AI → the other selected primary provider → configured Ollama local model; local-first is opt-in",
} as const;
