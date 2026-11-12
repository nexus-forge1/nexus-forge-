export function enforceCouncilDecision(decision: string, specialistWavesSucceeded: boolean): string {
  if (specialistWavesSucceeded) return decision
  return `DECISION: NO-GO\nCOORDINATOR SAFETY OVERRIDE: One or more required specialist handoffs failed. Do not proceed until the blocked work is recovered and reviewed.\nMODEL RECOMMENDATION (retained for audit only; not authoritative):\n${decision}`
}
