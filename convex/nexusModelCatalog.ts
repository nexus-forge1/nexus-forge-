export type NexusModelId =
  | "nexus-forge-chat:1b"
  | "nexus-forge-code:3b"
  | "nexus-forge-mission:1b"
  | "nexus-forge-critic:1b"
  | "nexus-forge-research:1b";

export type NexusModelProfile = {
  id: NexusModelId;
  displayName: string;
  role: "chat" | "code" | "mission" | "critic" | "research";
  baseFamily: string;
  minimumPlan: "explorer" | "builder" | "sovereign";
  maxContextTokens: number;
  maxOutputTokens: number;
  creditMultiplier: number;
  status: "candidate" | "evaluation" | "active" | "retired";
  limitations: string[];
};

export const NEXUS_MODEL_CATALOG: readonly NexusModelProfile[] = [
  {
    id: "nexus-forge-chat:1b",
    displayName: "NEXUS Chat 1B",
    role: "chat",
    baseFamily: "qwen2.5:1.5b",
    minimumPlan: "explorer",
    maxContextTokens: 4096,
    maxOutputTokens: 1024,
    creditMultiplier: 1,
    status: "candidate",
    limitations: ["Designed for short responses and lightweight assistance."],
  },
  {
    id: "nexus-forge-code:3b",
    displayName: "NEXUS Code 3B",
    role: "code",
    baseFamily: "qwen2.5-coder:3b",
    minimumPlan: "builder",
    maxContextTokens: 8192,
    maxOutputTokens: 2048,
    creditMultiplier: 2,
    status: "candidate",
    limitations: ["Requires independent build and test verification for generated changes."],
  },
  {
    id: "nexus-forge-mission:1b",
    displayName: "NEXUS Mission 1B",
    role: "mission",
    baseFamily: "qwen2.5:1.5b",
    minimumPlan: "builder",
    maxContextTokens: 8192,
    maxOutputTokens: 1536,
    creditMultiplier: 2,
    status: "candidate",
    limitations: ["Produces plans and tool requests; it does not execute permissions."],
  },
  {
    id: "nexus-forge-critic:1b",
    displayName: "NEXUS Critic 1B",
    role: "critic",
    baseFamily: "qwen2.5:1.5b",
    minimumPlan: "builder",
    maxContextTokens: 4096,
    maxOutputTokens: 1024,
    creditMultiplier: 1,
    status: "candidate",
    limitations: ["A critic result is advisory until the platform's verification rules accept it."],
  },
  {
    id: "nexus-forge-research:1b",
    displayName: "NEXUS Research 1B",
    role: "research",
    baseFamily: "qwen2.5:1.5b",
    minimumPlan: "builder",
    maxContextTokens: 8192,
    maxOutputTokens: 1536,
    creditMultiplier: 2,
    status: "candidate",
    limitations: ["Source quality and retrieval authorization remain application responsibilities."],
  },
] as const;

export const NEXUS_OPERATION_CREDITS = {
  chatPerThousandTokens: 1,
  specification: 10,
  codeReview: 10,
  scaffoldCompilation: 25,
  diagnosticTrace: 10,
  boundedRepairSandbox: 50,
  swarmAgentCycle: 15,
  historicalAstComparison: 20,
  evidenceBundleExport: 100,
} as const;

export function getNexusModel(id: string) {
  return NEXUS_MODEL_CATALOG.find(model => model.id === id);
}

export function creditsForModel(modelId: string, baseCredits: number) {
  const model = getNexusModel(modelId);
  if (!model || !Number.isSafeInteger(baseCredits) || baseCredits < 0) throw new Error("Invalid NEXUS model or credit amount");
  return Math.ceil(baseCredits * model.creditMultiplier);
}
