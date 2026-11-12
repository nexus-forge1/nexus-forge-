import { afterEach, describe, expect, it, vi } from "vitest"
import { convexTest } from "convex-test"
import schema from "../convex/schema"
import { api, internal } from "../convex/_generated/api"
const modules = import.meta.glob("../convex/**/*.ts")
const identity = { subject: "owner-a", issuer: "https://nexus-forge.test", tokenIdentifier: "https://nexus-forge.test|owner-a" }
async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    const missionId = await ctx.db.insert("missions", { title: "Delivery audit", mission: "Verify bounded delivery behavior", autonomy: "guided", budget: 0, status: "running", completion: 0, approved: true, ownerKey: "owner-a" })
    const artifactId = await ctx.db.insert("artifacts", { missionId, type: "html", name: "Approved artifact", content: "<html><title>Audit</title></html>", status: "ready", requiresApproval: false })
    return { missionId, artifactId }
  })
  const owner = t.withIdentity(identity)
  const args = { ...ids, target: "nexus-forge1/no-dispatch", branch: "main" }
  return { t, owner, args }
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe("audited delivery runtime contracts", () => {
  it("allows an internal runner lookup without browser identity while public history stays private", async () => {
    const { t, owner, args } = await fixture()
    const id = await owner.mutation(api.delivery.prepare, args)
    expect((await t.query(internal.delivery.listInternal, { missionId: args.missionId })).map(row => row._id)).toEqual([id])
    await expect(t.query(api.delivery.list, { missionId: args.missionId })).rejects.toThrow()
  })
  it("reuses only matching artifact, target, and branch preparations", async () => {
    const { owner, args } = await fixture()
    const first = await owner.mutation(api.delivery.prepare, args)
    expect(await owner.mutation(api.delivery.prepare, { ...args, target: " " + args.target + " ", branch: " main " })).toBe(first)
    expect(await owner.mutation(api.delivery.prepare, { ...args, target: "nexus-forge1/nexus-forge-" })).not.toBe(first)
    expect(await owner.mutation(api.delivery.prepare, { ...args, branch: "qa-only" })).not.toBe(first)
  })
  it("applies the same target and branch identity in runner preparation", async () => {
    const { t, args } = await fixture()
    const first = await t.mutation(internal.delivery.prepareInternal, args)
    expect(await t.mutation(internal.delivery.prepareInternal, args)).toBe(first)
    expect(await t.mutation(internal.delivery.prepareInternal, { ...args, branch: "qa-only" })).not.toBe(first)
  })
  it("records inaccessible repositories before attempting artifact writes or dispatch", async () => {
    const { t, owner, args } = await fixture()
    const id = await owner.mutation(api.delivery.prepare, args)
    await owner.mutation(api.delivery.approve, { id, approved: true })
    vi.stubEnv("GITHUB_ACCESS_TOKEN", "test-token")
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(owner.action(api.delivery.executeApproved, { id })).rejects.toThrow(/Repository not found/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await t.run(ctx => ctx.db.get("deliveries", id)))?.stage).toBe("blocked")
  })
  it("records inaccessible branches before attempting artifact writes or dispatch", async () => {
    const { t, owner, args } = await fixture()
    const id = await owner.mutation(api.delivery.prepare, args)
    await owner.mutation(api.delivery.approve, { id, approved: true })
    vi.stubEnv("GITHUB_ACCESS_TOKEN", "test-token")
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response("", { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(owner.action(api.delivery.executeApproved, { id })).rejects.toThrow(/Branch.*not found/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((await t.run(ctx => ctx.db.get("deliveries", id)))?.stage).toBe("blocked")
  })
  it("supports the separate dispatch repository after repository and branch preflight", async () => {
    const { t, owner, args } = await fixture()
    const id = await owner.mutation(api.delivery.prepare, args)
    await owner.mutation(api.delivery.approve, { id, approved: true })
    vi.stubEnv("GITHUB_ACCESS_TOKEN", "test-token")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(Response.json({commit:{sha:"a".repeat(40)}}))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await owner.action(api.delivery.executeApproved, { id })
    expect(result.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/nexus-forge1/no-dispatch")
    expect(fetchMock.mock.calls[1][0]).toContain("/branches/main")
    expect(fetchMock.mock.calls[3][1]?.method).toBe("PUT")
    expect(fetchMock.mock.calls[4][1]?.method).toBe("POST")
    expect((await t.run(ctx => ctx.db.get("deliveries", id)))?.status).toBe("GitHub Actions dispatched")
  })
})
