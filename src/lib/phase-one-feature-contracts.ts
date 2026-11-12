import { masterFeatureRegister, type RegisterEntry, type RegisterList } from './master-feature-register'

/**
 * Phase 1 defines the product-level contract only. It deliberately does not
 * infer runtime completion from route presence, source mappings, or test counts.
 * Business logic, UI, and external integrations belong to later phases.
 */
export type FeaturePhase = 'Phase 1: High-Level Features'
export type FeatureDefinitionState = 'Defined' | 'Needs definition'

export type PhaseOneFeatureContract = {
  id: string
  name: string
  list: RegisterList
  category: string
  phase: FeaturePhase
  outcome: string
  acceptanceCriteria: string
  sourceRoute: string
  sourceReference: string
  accountableOwner: string
  nextAction: string
  definitionState: FeatureDefinitionState
  definitionGaps: string[]
  runtimeStatus: RegisterEntry['status']
  runtimeStatusNote: string
  nextPhaseBoundary: string
}

const requiredText = (value: string | undefined, label: string, gaps: string[]) => {
  if (!value?.trim()) gaps.push(label)
}

function contractFor(entry: RegisterEntry): PhaseOneFeatureContract {
  const gaps: string[] = []
  requiredText(entry.name, 'feature name', gaps)
  requiredText(entry.description, 'intended outcome', gaps)
  requiredText(entry.acceptance, 'acceptance criteria', gaps)
  requiredText(entry.route, 'primary route', gaps)
  requiredText(entry.source, 'source reference', gaps)
  requiredText(entry.owner, 'accountable owner', gaps)
  requiredText(entry.nextAction, 'next action', gaps)

  const acceptance = entry.acceptance.trim()
  const outcome = entry.description.trim()
  if (acceptance.length < 80) gaps.push('acceptance criteria are too brief to verify the feature')
  if (acceptance.toLowerCase() === outcome.toLowerCase()) gaps.push('acceptance criteria merely repeat the outcome')
  if (/acceptance criteria require feature-specific definition|verify the full user workflow|exercise the complete user journey/i.test(acceptance)) {
    gaps.push('acceptance criteria contain a generic placeholder rather than feature-specific checks')
  }
  if (/a clear status and next step|a saved mission contract|a prioritized project checklist/i.test(acceptance)) {
    gaps.push('acceptance criteria state only an output label, not observable pass/fail conditions')
  }
  if (/trace route\/component → convex api\/table|complete the remaining acceptance criteria described in the roadmap|compare the route against the full acceptance criteria|extend the starter to the full acceptance criteria/i.test(entry.nextAction)) {
    gaps.push('next action is a shared placeholder rather than a feature-specific follow-up')
  }

  return {
    id: entry.id,
    name: entry.name,
    list: entry.list,
    category: entry.category,
    phase: 'Phase 1: High-Level Features',
    outcome: entry.description,
    acceptanceCriteria: entry.acceptance,
    sourceRoute: entry.route,
    sourceReference: entry.source,
    accountableOwner: entry.owner,
    nextAction: entry.nextAction,
    definitionState: gaps.length === 0 ? 'Defined' : 'Needs definition',
    definitionGaps: gaps,
    // Kept separately so a well-defined feature is never mistaken for a shipped feature.
    runtimeStatus: entry.status,
    runtimeStatusNote: entry.statusNote,
    nextPhaseBoundary: 'Phase 2 owns underlying functions and business logic; Phase 3 owns UI/system components; Phase 4 owns external integrations. This contract does not implement or certify those later-phase capabilities.',
  }
}

export const phaseOneFeatureContracts: readonly PhaseOneFeatureContract[] =
  masterFeatureRegister.map(contractFor)

export const phaseOneFeatureAudit = {
  phase: 'Phase 1: High-Level Features' as const,
  total: phaseOneFeatureContracts.length,
  defined: phaseOneFeatureContracts.filter((item) => item.definitionState === 'Defined').length,
  needsDefinition: phaseOneFeatureContracts.filter((item) => item.definitionState === 'Needs definition').length,
  byList: Object.fromEntries(
    (['Original workspaces', 'Roadmap milestones', 'Expanded capability areas', 'Productivity features', '30-feature portfolio'] as const)
      .map((list) => [list, phaseOneFeatureContracts.filter((item) => item.list === list).length]),
  ) as Record<RegisterList, number>,
  incomplete: phaseOneFeatureContracts.filter((item) => item.definitionGaps.length > 0),
} as const
