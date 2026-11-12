// Public model identifiers only. Credentials are read by server actions.
export const OLLAMA_MODELS = [
  { name: 'ollama-deepseek', label: 'DeepSeek V4.1 Flash', model: 'deepseek-v4.1-flash' },
  { name: 'ollama-gemma', label: 'Gemma 4', model: 'gemma4:31b' },
  { name: 'ollama-glm', label: 'GLM 5.3 Flash', model: 'glm-5.3-flash' },
  { name: 'ollama-gpt-oss', label: 'GPT OSS', model: 'gpt-oss:120b' },
  { name: 'ollama-minimax', label: 'MiniMax M3.1 Flash', model: 'minimax-m3.1-flash' },
  { name: 'ollama-nemotron', label: 'Nemotron 3 Nano', model: 'nemotron-3-nano:30b' },
] as const
export type OllamaProvider = typeof OLLAMA_MODELS[number]['name']
export function isOllamaProvider(value: string): value is OllamaProvider {
  return OLLAMA_MODELS.some(model => model.name === value)
}
