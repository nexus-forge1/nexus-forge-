import { haveDistinctStrategyIdentities } from './strategyDiversity';
export type ManifestStrategyCandidate = { name: string; mechanism: string; prerequisites: string; timeToEvidence: string; expectedValue: string; reversibility: string; failureMode: string; unverifiedAssumptions: string; };
export type ManifestStrategyExtraction = { blueprint: string; strategies: ManifestStrategyCandidate[]; foundBlock: boolean; validJson: boolean; };
const fields = ["name", "mechanism", "prerequisites", "timeToEvidence", "expectedValue", "reversibility", "failureMode", "unverifiedAssumptions"] as const;
/** Parse untrusted model-generated strategy JSON; only an exact, complete three-candidate set is ledger-ready. */
export function extractManifestStrategies(generated: string): ManifestStrategyExtraction {
  const fence = String.fromCharCode(96).repeat(3);
  const pattern = new RegExp(fence + "(?:manifest-strategies|json)\\s*([\\s\\S]*?)\\s*" + fence, "i");
  const match = pattern.exec(generated);
  const trimmed = generated.trim();
  const rawArray = !match && trimmed.startsWith("[") && trimmed.endsWith("]");
  if (!match && !rawArray) return { blueprint: trimmed, strategies: [], foundBlock: false, validJson: false };
  const payload = match ? match[1] : trimmed;
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { return { blueprint: match ? generated.replace(match[0], "").trim() : trimmed, strategies: [], foundBlock: true, validJson: false }; }
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    return { blueprint: match ? generated.replace(match[0], "").trim() : "", strategies: [], foundBlock: true, validJson: false };
  }
  const strategies: ManifestStrategyCandidate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { blueprint: match ? generated.replace(match[0], "").trim() : "", strategies: [], foundBlock: true, validJson: false };
    }
    const record = item as Record<string, unknown>;
    if (!fields.every((field) => typeof record[field] === "string" && (record[field] as string).trim().length > 0)) {
      return { blueprint: match ? generated.replace(match[0], "").trim() : "", strategies: [], foundBlock: true, validJson: false };
    }
    strategies.push(Object.fromEntries(fields.map((field) => [field, (record[field] as string).trim().slice(0, 1000)])) as unknown as ManifestStrategyCandidate);
  }
  if (!haveDistinctStrategyIdentities(strategies)) return { blueprint: match ? generated.replace(match[0], "").trim() : "", strategies: [], foundBlock: true, validJson: false };
  return { blueprint: match ? generated.replace(match[0], "").trim() : "", strategies, foundBlock: true, validJson: true };
}
