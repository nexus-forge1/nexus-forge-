import { afterEach, describe, expect, it, vi } from "vitest";
import { callAiProvider } from "../convex/aiProvider";

describe("NEXUS Ollama small-model routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("routes planner work to the configured local mission model when local-first is enabled", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://private-ollama:11434/v1");
    vi.stubEnv("NEXUS_OLLAMA_PRIMARY", "true");
    vi.stubEnv("OLLAMA_MODEL_PLANNER", "nexus-forge-mission:1b");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "nexus-forge-mission:1b",
      choices: [{ message: { content: "bounded plan" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callAiProvider("planner", "plan a bounded task", 400)).resolves.toBe("bounded plan");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://private-ollama:11434/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("nexus-forge-mission:1b");
  });

  it("keeps Ollama available as an opt-in fallback without replacing hosted primaries", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://private-ollama:11434/v1");
    vi.stubEnv("NEXUS_OLLAMA_PRIMARY", "false");
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "unavailable" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "local fallback" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callAiProvider("planner", "fallback test", 100)).resolves.toBe("local fallback");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("api.groq.com");
    expect(fetchMock.mock.calls[1][0]).toBe("http://private-ollama:11434/v1/chat/completions");
  });
});
