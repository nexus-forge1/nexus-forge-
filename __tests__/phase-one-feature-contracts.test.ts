import { describe, expect, it } from 'vitest'
import { registerCounts } from '../src/lib/master-feature-register'
import { phaseOneFeatureAudit, phaseOneFeatureContracts } from '../src/lib/phase-one-feature-contracts'

describe('Phase 1 high-level feature contracts', () => {
  it('defines a contract for every catalog entry without changing catalog scope', () => {
    expect(phaseOneFeatureAudit.total).toBe(82)
    expect(phaseOneFeatureContracts).toHaveLength(registerCounts.total)
    expect(phaseOneFeatureAudit.byList).toEqual({
      'Original workspaces': 16,
      'Roadmap milestones': 24,
      'Expanded capability areas': 6,
      'Productivity features': 6,
      '30-feature portfolio': 30,
    })
    expect(new Set(phaseOneFeatureContracts.map((feature) => feature.id)).size).toBe(82)
  })

  it('requires complete metadata and verifies acceptance definition quality', () => {
    for (const feature of phaseOneFeatureContracts) {
      expect(feature.name, feature.id).toBeTruthy()
      expect(feature.category, feature.id).toBeTruthy()
      expect(feature.outcome, feature.id).toBeTruthy()
      expect(feature.acceptanceCriteria, feature.id).toBeTruthy()
      expect(feature.sourceRoute, feature.id).toMatch(/^\//)
      expect(feature.sourceReference, feature.id).toBeTruthy()
      expect(feature.accountableOwner, feature.id).toBeTruthy()
      expect(feature.nextAction, feature.id).toBeTruthy()
      expect(feature.definitionState, feature.id).toBe(feature.definitionGaps.length === 0 ? 'Defined' : 'Needs definition')
    }
    expect(phaseOneFeatureAudit.defined).toBe(82)
    expect(phaseOneFeatureAudit.needsDefinition).toBe(0)
    expect(phaseOneFeatureAudit.incomplete).toHaveLength(0)
  })

  it('uses feature-specific criteria for every original workspace and roadmap milestone', () => {
    const workspaces = phaseOneFeatureContracts.filter((feature) => feature.list === 'Original workspaces')
    const milestones = phaseOneFeatureContracts.filter((feature) => feature.list === 'Roadmap milestones')
    expect(workspaces).toHaveLength(16)
    expect(milestones).toHaveLength(24)
    for (const feature of [...workspaces, ...milestones]) {
      expect(feature.acceptanceCriteria.length, feature.id).toBeGreaterThan(80)
      expect(feature.acceptanceCriteria.toLowerCase(), feature.id).not.toBe(feature.outcome.toLowerCase())
    }
  })

  it('gives every expanded capability its own actionable acceptance criteria', () => {
    const expanded = phaseOneFeatureContracts.filter((feature) => feature.list === 'Expanded capability areas')
    expect(expanded).toHaveLength(6)
    expect(new Set(expanded.map((feature) => feature.acceptanceCriteria)).size).toBe(6)
    for (const feature of expanded) {
      expect(feature.acceptanceCriteria.length, feature.id).toBeGreaterThan(100)
      expect(feature.acceptanceCriteria).not.toContain('Verify the full user workflow')
      expect(feature.acceptanceCriteria).not.toContain('Acceptance criteria require feature-specific definition')
    }
  })

  it('never equates a high-level definition with runtime implementation', () => {
    for (const feature of phaseOneFeatureContracts) {
      expect(feature.phase).toBe('Phase 1: High-Level Features')
      expect(feature.runtimeStatus).toBeTruthy()
      expect(feature.runtimeStatusNote).toBeTruthy()
      expect(feature.nextPhaseBoundary).toContain('Phase 2')
      expect(feature.nextPhaseBoundary).toContain('Phase 3')
      expect(feature.nextPhaseBoundary).toContain('Phase 4')
    }
  })
})
