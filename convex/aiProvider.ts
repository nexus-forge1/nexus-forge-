import { boundedText } from "./boundedResponse";
import { OLLAMA_MODELS, isOllamaProvider, type OllamaProvider } from "./ollamaModels";

// Legacy names remain readable in frozen contracts, but can no longer dispatch.
export type GraphProvider = OllamaProvider | 'cloudflare' | 'groq' | 'cerebras';
type ChatRole = "planner" | "wave1" | "wave2" | "critic" | "research";
const routes: Record<ChatRole, OllamaProvider> = {
  planner: 'ollama-deepseek', wave1: 'ollama-glm', wave2: 'ollama-minimax',
  critic: 'ollama-gpt-oss', research: 'ollama-gemma',
};
export function graphProviderConfiguration(provider: GraphProvider) {
  const cfg = OLLAMA_MODELS.find(item => item.name === provider);
  return { model: cfg?.model ?? 'retired', configured: Boolean(cfg && process.env.OLLAMA_API_KEY?.trim()) };
}
export function getProviderRoutingPlan() {
  const fallbackOrder = OLLAMA_MODELS.map(item => item.name);
  return {
    roles: Object.entries(routes).map(([role, primary]) => ({
      role, primary, model: graphProviderConfiguration(primary).model,
      failoverOrder: [primary, ...fallbackOrder.filter(item => item !== primary)],
    })),
    fallbackOrder,
  };
}
type ProviderUsage = { provider: OllamaProvider; model: string; promptTokens?: number; completionTokens?: number; totalTokens?: number; reportedCostUsd?: number; capturedAt: number };
type UsageRecorder = (usage: ProviderUsage) => Promise<void>;
export async function callOllamaModel(provider: GraphProvider, prompt: string, maxTokens: number, onUsage?: UsageRecorder): Promise<string> {
  if (!isOllamaProvider(provider)) throw new Error('This provider has been retired. Freeze a new contract using an Ollama Cloud model.');
  const key = process.env.OLLAMA_API_KEY?.trim().replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('Ollama Cloud is not connected. Set OLLAMA_API_KEY in the backend environment.');
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error('Invalid output token limit.');
  const model = graphProviderConfiguration(provider).model;
  const boundedPrompt = prompt.length > 8000
    ? `${prompt.slice(0, 5000)}\n\n...[context truncated for provider limits]...\n\n${prompt.slice(-2000)}` : prompt;
  const response = await fetch('https://ollama.com/api/chat', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: boundedPrompt }], stream: false,
      options: { num_predict: Math.min(maxTokens, 3000), temperature: 0.15 } }),
  });
  const body = await boundedText(response, 1024 * 1024);
  if (!response.ok) {
    // Never return provider bodies: error responses can echo prompts or credentials.
    const error = new Error(`Ollama Cloud / ${model} rejected the request (HTTP ${response.status}).`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  const payload = JSON.parse(body);
  if (typeof payload.model === 'string' && payload.model !== model) throw new Error('Ollama returned a different model; review the invocation before retrying.');
  const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100000000 ? value : undefined;
  const promptTokens = count(payload.prompt_eval_count), completionTokens = count(payload.eval_count);
  const totalTokens = promptTokens !== undefined && completionTokens !== undefined ? count(promptTokens + completionTokens) : undefined;
  const cost = payload.cost;
  const reportedCostUsd = typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 && cost <= 1000000 ? cost : undefined;
  if (onUsage && (promptTokens !== undefined || completionTokens !== undefined || reportedCostUsd !== undefined)) {
    try { await onUsage({ provider, model, promptTokens, completionTokens, totalTokens, reportedCostUsd, capturedAt: Date.now() }); }
    catch { console.warn('Ollama usage receipt could not be saved; no inference retry was made.'); }
  }
  // Thinking is not a final answer. A truncated thinking-only response needs review.
  const answer = payload?.message?.content;
  if (payload.done !== true || typeof answer !== 'string' || !answer.trim()) throw new Error('Ollama returned no complete usable answer; review the invocation before retrying.');
  return answer.trim();
}
export async function callAiProvider(role: ChatRole, prompt: string, maxTokens: number, onUsage?: UsageRecorder): Promise<string> {
  if (!process.env.OLLAMA_API_KEY?.trim()) throw new Error('Ollama Cloud is not connected. Set OLLAMA_API_KEY in the backend environment.');
  const ordered = getProviderRoutingPlan().roles.find(item => item.role === role)!.failoverOrder;
  const failures: string[] = [];
  for (const provider of ordered) {
    try { return await callOllamaModel(provider, prompt, maxTokens, onUsage); }
    catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      failures.push(failure.message);
      const status = (failure as Error & { status?: number }).status;
      // Explicit model rejection only. Authentication and quota failures are
      // account-wide; uncertain remote work must never trigger another paid call.
      if (status === undefined || ![400, 404, 405, 413, 415, 422].includes(status)) {
        if(status===401||status===403||status===429)throw failure;
        throw new Error('Ollama execution could not be confirmed. Automatic fallback stopped; review the invocation and usage before starting new work.');
      }
    }
  }
  throw new Error(`All selected Ollama models rejected the request: ${failures.join(' | ')}`);
}
export async function callGraphProvider(provider: GraphProvider, expectedModel: string, prompt: string, maxTokens: number, onUsage?: UsageRecorder) {
  const config = graphProviderConfiguration(provider);
  if (!config.configured || config.model !== expectedModel) throw new Error('Frozen graph model configuration changed or is unavailable');
  if (new TextEncoder().encode(prompt).length > 8000 || prompt.length > 8000 || !Number.isInteger(maxTokens) || maxTokens < 64 || maxTokens > 512) throw new Error('Graph request exceeds its frozen bounds');
  return callOllamaModel(provider, prompt, maxTokens, onUsage);
}
export async function callNamedEvaluationProvider(provider: GraphProvider, prompt: string, maxTokens: number, onUsage?: UsageRecorder) {
  return callOllamaModel(provider, prompt, maxTokens, onUsage);
}
export const COUNCIL_MODELS = { planner: 'planner', wave1: 'wave1', wave2: 'wave2', critic: 'critic', research: 'research' } as const;
export const AI_PROVIDER_PLAN = {
  planner: 'Ollama Cloud: DeepSeek V4.1 Flash', wave1: 'Ollama Cloud: GLM 5.3 Flash',
  wave2: 'Ollama Cloud: MiniMax M3.1 Flash', critic: 'Ollama Cloud: GPT OSS 120B',
  research: 'Ollama Cloud: Gemma 4 31B', fallbackOrder: 'Requested six Ollama Cloud models only; Nemotron 3 Nano 30B included',
} as const;
