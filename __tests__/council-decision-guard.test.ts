import { describe, expect, it } from 'vitest'
import { enforceCouncilDecision } from '../convex/forgeDecision'

describe('Council decision safety gate', () => {
  it('overrides a model GO when required specialist handoffs failed', () => {
    const result = enforceCouncilDecision('DECISION: GO\nProceed immediately.', false)
    expect(result).toContain('DECISION: NO-GO')
    expect(result).toContain('COORDINATOR SAFETY OVERRIDE')
    expect(result).toContain('MODEL RECOMMENDATION (retained for audit only; not authoritative)')
    expect(result).toContain('DECISION: GO')
  })

  it('preserves the model decision when all required specialist handoffs succeeded', () => {
    const decision = 'DECISION: GO\nRequired handoffs completed.'
    expect(enforceCouncilDecision(decision, true)).toBe(decision)
  })
})
