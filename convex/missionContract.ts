export const missionLimits = { title: 160, description: 30000, authority: 80, maxBudgetUsd: 500 } as const
export function validateMissionBudget(budget: number) {
  if (!Number.isFinite(budget) || budget < 0 || budget > missionLimits.maxBudgetUsd)
    throw new Error('Mission spend cap must be a finite amount from $0 to $500')
}
export function validateMissionContract(input: { title: string; mission: string; autonomy: string; budget: number }) {
  validateMissionBudget(input.budget)
  const title = input.title.trim() || 'Untitled Mission', mission = input.mission.trim(), autonomy = input.autonomy.trim()
  if (!mission || mission.length > missionLimits.description) throw new Error('Mission must contain 1 to 30000 characters')
  if (title.length > missionLimits.title) throw new Error('Mission title must contain at most 160 characters')
  if (!autonomy || autonomy.length > missionLimits.authority) throw new Error('Mission authority must contain 1 to 80 characters')
  return { title, mission, autonomy, budget: input.budget }
}
export function missionApprovalTransition(mission: { status: string; approved: boolean; budget: number }, approved: boolean) {
  if (mission.status === 'complete' || mission.status === 'cancelled') {
    if (mission.approved === approved) return null
    throw new Error('Completed or cancelled missions cannot change approval; create a new draft')
  }
  if (mission.status === 'review') {
    if (approved) throw new Error('Resolve the portfolio review before approving this mission')
    return mission.approved ? { approved: false, status: 'review' as const } : null
  }
  if (approved) validateMissionBudget(mission.budget)
  const status = approved ? 'running' as const : 'draft' as const
  return mission.approved === approved && mission.status === status ? null : { approved, status }
}
