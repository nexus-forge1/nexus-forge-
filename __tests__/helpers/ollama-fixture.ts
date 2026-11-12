/** Emit Ollama's wire protocol from a controlled answer/usage fixture. No network calls. */
export function ollamaFixture(payload: { model?: string; choices: { message: { content: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number }; [key: string]: unknown }) {
  const { choices, usage, ...rest } = payload
  return {
    ...rest,
    done: true,
    message: choices[0]?.message,
    ...(usage?.prompt_tokens === undefined ? {} : { prompt_eval_count: usage.prompt_tokens }),
    ...(usage?.completion_tokens === undefined ? {} : { eval_count: usage.completion_tokens }),
    ...(usage?.cost === undefined ? {} : { cost: usage.cost }),
  }
}
