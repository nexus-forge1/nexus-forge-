import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

function identity(subject: string) {
  return {
    subject,
    issuer: "https://nexus-forge.test",
    tokenIdentifier: `https://nexus-forge.test|${subject}`,
  };
}

async function seedMission(t: ReturnType<typeof convexTest>, ownerKey = "owner-a", approved = false) {
  return t.run(async (ctx) => ctx.db.insert("missions", {
    title: "Isolation regression",
    mission: "Confirm mission data remains private to its owner",
    autonomy: "guided",
    budget: 0,
    status: "draft",
    completion: 0,
    approved,
    ownerKey,
  }));
}

async function seedRun(t: ReturnType<typeof convexTest>, missionId: any) {
  return t.run(async (ctx) => ctx.db.insert("missionRuns", {
    missionId,
    startedAt: 1,
    deadlineAt: 9999999999999,
    maxRetries: 2,
    retries: 0,
    status: "running",
    currentStage: "orchestration",
    nextActionAt: 1,
  }));
}

describe("public mission access isolation", () => {
  it("rejects anonymous access to mission details", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t);
    await expect(t.query(api.missions.getById, { id: missionId })).rejects.toThrow();
  });

  it("rejects a different operator reading a mission by ID", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t);
    await expect(
      t.withIdentity(identity("owner-b")).query(api.missions.getById, { id: missionId }),
    ).rejects.toThrow(/not found or access denied/i);
  });

  it("rejects a different operator orchestrating another owner's approved mission", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t, "owner-a", true);
    await expect(
      t.withIdentity(identity("owner-b")).action(api.forge.orchestrate, {
        missionId,
        mission: "attacker-supplied replacement mission text",
      }),
    ).rejects.toThrow(/not found or access denied/i);
  });

  it("rejects anonymous access to the legacy mission-run lookup", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t);
    await expect(t.query(api.missionRunner.get, { missionId })).rejects.toThrow();
  });

  it("rejects a different operator reading the legacy mission-run lookup", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t);
    await expect(
      t.withIdentity(identity("owner-b")).query(api.missionRunner.get, { missionId }),
    ).rejects.toThrow(/not found or access denied/i);
  });

  it("rejects a different operator ticking another owner's run", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t, "owner-a");
    const runId = await seedRun(t, missionId);
    await expect(
      t.withIdentity(identity("owner-b")).action(api.missionRunner.tick, { runId }),
    ).rejects.toThrow(/not found or access denied/i);
  });

  it("ignores a client-supplied owner filter when listing missions", async () => {
    const t = convexTest(schema, modules);
    await seedMission(t);
    await t.run(async (ctx) => ctx.db.insert("missions", {
      title: "Owner B mission",
      mission: "Must remain isolated",
      autonomy: "guided",
      budget: 0,
      status: "draft",
      completion: 0,
      approved: false,
      ownerKey: "owner-b",
    }));
    const page = await t.withIdentity(identity("owner-b")).query(api.missions.list, {
      ownerKey: "owner-a",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((mission) => mission.ownerKey)).toEqual(["owner-b"]);
  });

  it("assigns newly created missions to the authenticated operator, not the submitted owner", async () => {
    const t = convexTest(schema, modules);
    const missionId = await t.withIdentity(identity("owner-b")).mutation(api.missions.create, {
      title: "Owner assignment regression",
      mission: "Server-side owner assignment",
      autonomy: "guided",
      budget: 0,
      ownerKey: "owner-a",
    });
    const mission = await t.run(async (ctx) => ctx.db.get(missionId as Id<"missions">));
    expect(mission?.ownerKey).toBe("owner-b");
  });

  it("rejects anonymous memory reads", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.memory.list, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow(/authenticated operator/i);
  });

  it("ignores a spoofed owner key when saving memory", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t, "owner-b");
    const memoryId = await t.withIdentity(identity("owner-b")).mutation(api.memory.remember, {
      ownerKey: "owner-a",
      missionId,
      category: "lesson",
      key: "owner-spoof-regression",
      value: "Owner must come from the session or owned mission",
      confidence: 0.9,
      source: "ownership regression test",
    });
    const memory = await t.run(async (ctx) => ctx.db.get(memoryId as Id<"memories">));
    expect(memory?.ownerKey).toBe("owner-b");
  });

  it("rejects another operator listing a mission's artifacts", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t, "owner-a");
    await expect(t.withIdentity(identity("owner-b")).query(api.artifacts.list, { missionId })).rejects.toThrow(/not found or access denied/i);
  });

  it("rejects another operator listing a mission's verification history", async () => {
    const t = convexTest(schema, modules);
    const missionId = await seedMission(t, "owner-a");
    await expect(t.withIdentity(identity("owner-b")).query(api.verification.list, { missionId })).rejects.toThrow(/not found or access denied/i);
  });

  it("rejects anonymous portfolio analytics", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.portfolio.decisionSnapshot, {})).rejects.toThrow(/authenticated operator/i);
    await expect(t.query(api.portfolio.learningSnapshot, {})).rejects.toThrow(/authenticated operator/i);
  });
});
