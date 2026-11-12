import { describe, expect, it } from "vitest";
import { extractManifestStrategies } from "../convex/manifestStrategyParser";

const candidate = { name: "Small pilot", mechanism: "Test one user segment", prerequisites: "A reachable pilot audience", timeToEvidence: "Within one week", expectedValue: "Evidence about activation", reversibility: "Easy to stop", failureMode: "Too few participants", unverifiedAssumptions: "Pilot users resemble target users" };
const three = [candidate, { ...candidate, name: "Second path", mechanism: "Build a self-service prototype" }, { ...candidate, name: "Third path", mechanism: "Deliver a manual concierge pilot" }];
const fence = String.fromCharCode(96).repeat(3);

describe("Manifest strategy extraction", () => {
  it("rejects repeated names and renamed copies of the same mechanism", () => {
    expect(extractManifestStrategies(JSON.stringify([candidate, {...three[1], name: "SMALL—PILOT"}, three[2]])).validJson).toBe(false);
    expect(extractManifestStrategies(JSON.stringify([candidate, {...three[1], mechanism: "TEST ONE USER SEGMENT!"}, three[2]])).validJson).toBe(false);
  });
  it("extracts exactly three valid candidates and leaves readable Markdown", () => {
    const raw = ["## Blueprint", "Run a small pilot.", "", fence + "manifest-strategies", JSON.stringify(three), fence].join("\n");
    const result = extractManifestStrategies(raw);
    expect(result.blueprint).toContain("Run a small pilot");
    expect(result.strategies).toHaveLength(3);
    expect(result.strategies[0].name).toBe("Small pilot");
    expect(result.validJson).toBe(true);
  });
  it("preserves the full readable response when the optional block is missing", () => {
    const raw = "## Blueprint\nA readable provider response without structured data.";
    expect(extractManifestStrategies(raw)).toMatchObject({ blueprint: raw, strategies: [], foundBlock: false, validJson: false });
  });
  it("removes malformed optional JSON without failing blueprint generation", () => {
    const raw = ["Readable plan.", "", fence + "manifest-strategies", "{bad json}", fence].join("\n");
    const result = extractManifestStrategies(raw);
    expect(result.blueprint).toBe("Readable plan.");
    expect(result.strategies).toEqual([]);
    expect(result.foundBlock).toBe(true);
    expect(result.validJson).toBe(false);
  });
  it("rejects incomplete candidate objects instead of persisting them", () => {
    const raw = ["Readable plan.", fence + "manifest-strategies", JSON.stringify([candidate, { ...candidate, failureMode: 42 }, three[2]]), fence].join("\n");
    const result = extractManifestStrategies(raw);
    expect(result.strategies).toEqual([]);
    expect(result.validJson).toBe(false);
  });
  it("rejects partial arrays from the structured retry", () => {
    const result = extractManifestStrategies(JSON.stringify(three.slice(0, 2)));
    expect(result.strategies).toEqual([]);
    expect(result.validJson).toBe(false);
    expect(result.blueprint).toBe("");
  });
  it("accepts a JSON-only array from the structured retry", () => {
    const result = extractManifestStrategies(JSON.stringify(three));
    expect(result.strategies).toHaveLength(3);
    expect(result.validJson).toBe(true);
    expect(result.blueprint).toBe("");
  });
  it("accepts exactly three candidates in a JSON fenced response", () => {
    const raw = [fence + "json", JSON.stringify(three), fence].join("\n");
    const result = extractManifestStrategies(raw);
    expect(result.strategies).toHaveLength(3);
    expect(result.strategies[0].name).toBe("Small pilot");
    expect(result.validJson).toBe(true);
  });
});
