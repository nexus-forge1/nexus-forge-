// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { convexTest } from "convex-test"
import schema from "../../convex/schema"
import { internal } from "../../convex/_generated/api"

const modules = import.meta.glob("../../convex/**/*.ts")

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv("GROQ_API_KEY", "controlled-key")
  vi.stubEnv("CEREBRAS_API_KEY", "")
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "")
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("cooperative mission cancellation fencing", () => {
  it("does not advance Council or overwrite cancellation when a provider call is already in flight", async () => {
    const t = convexTest(schema, modules)
    const now = Date.now()
    const missionId = await t.run(ctx => ctx.db.insert("missions", {
      title: "Cancellation race",
      mission: "Prove late Council work cannot overwrite cancellation",
      autonomy: "guided",
      budget: 0,
      status: "running",
      completion: 0,
      approved: true,
      ownerKey: "cancellation-owner",
    }))
    const runId = await t.run(ctx => ctx.db.insert("missionRuns", {
      missionId,
      startedAt: now,
      deadlineAt: now + 600_000,
      maxRetries: 2,
      retries: 0,
      status: "running",
      currentStage: "orchestration",
      nextActionAt: now,
    }))
    const fetchMock = vi.fn(async () => {
      // Simulate the operator cancelling while the external request is in flight.
      await t.run(ctx => ctx.db.patch(missionId, { status: "cancelled", approved: false }))
      return new Response(JSON.stringify({ choices: [{ message: { content: "late provider answer" } }] }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await t.action(internal.forge.orchestrateInternal, {
      missionId,
      mission: "Prove late Council work cannot overwrite cancellation",
      missionRunId: runId,
    })

    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await t.run(ctx => ctx.db.get(missionId))).toMatchObject({ status: "cancelled", approved: false })
    const evidence = await t.run(ctx => ctx.db.query("evidence").collect())
    expect(evidence.some(row => row.agent === "Council Planner" && row.message.includes("Model "))).toBe(false)
  })
})
