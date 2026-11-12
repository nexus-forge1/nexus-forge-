import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { MissionControl } from '../src/components/mission-control'
import type { Id } from '../convex/_generated/dataModel'
const state = vi.hoisted(() => ({ escalated: false, contextUnknown: false, review: vi.fn(), execute: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }))
vi.mock('convex/react', () => ({
  useQuery: (ref: any) => {
    const name = getFunctionName(ref)
    if (name === 'missions:getById') return { _id: 'mission-test', title: 'Recovery mission', approved: true, status: 'blocked' }
    if (name === 'memory:adaptivePreflightStatus') return state.contextUnknown ? {ok:false,message:'Risk evidence has not been cleared; review retained memory history.'} : { ok:true,value:{ rationale: [], riskSignals: [], reusePatterns: [], requiredEvidence: [], recoveryGuidance: [] } }
    if (name === 'orchestration:preflight') return { ready: true, blockers: [], advisories: [], resources: [] }
    if (name === 'missionRunner:get') return { status: 'escalated', currentStage: 'timeout_escalation', lastError: 'The last run exceeded its deadline.' }
    if (name === 'portfolio:decisionSnapshot') return { totalMissions: 1, completionRate: 0, blocked: 1, recommendation: 'review', priorities: [] }
    if (name === 'portfolio:listDecisions') return [{ decision: 'approve', action: 'Execute approved mission', priorityRank: 1 }]
    if (name === 'incidents:list') return state.escalated ? [{ _id: 'incident-test', status: 'escalated', stage: 'timeout', message: 'Review timeout evidence' }] : []
    if (['artifacts:list', 'delivery:list', 'verification:list', 'verification:measurements'].includes(name)) return []
    return undefined
  },
  useMutation: (ref: any) => getFunctionName(ref) === 'incidents:reviewEscalated' ? state.review : state.execute,
  useAction: () => vi.fn(),
}))
beforeEach(() => { cleanup(); vi.clearAllMocks(); state.escalated = false; state.contextUnknown = false; state.review.mockResolvedValue(null) })
function fillReview() {
  fireEvent.change(screen.getByLabelText('RECOVERY ACTION / INVESTIGATION'), { target: { value: 'Reviewed the actual timeout evidence.' } })
  fireEvent.change(screen.getByLabelText('REUSABLE LESSON'), { target: { value: 'Check the inputs before the next run.' } })
}
describe('Mission Control adaptive guidance and recovery', () => {
  it('shows unknown risk context with a retained-memory link instead of zero-risk counts',()=>{
    state.contextUnknown=true
    render(<MissionControl missionId={'mission-test' as Id<'missions'>}/>)
    expect(screen.getByRole('alert')).toHaveTextContent('Risk evidence has not been cleared')
    expect(screen.getByRole('link',{name:'Review retained memory →'})).toHaveAttribute('href','/evidence')
    expect(screen.queryByText('Risk signals')).toBeNull()
    expect(state.execute).not.toHaveBeenCalled()
  })
  it('handles empty adaptive rationale and shows the saved runner failure', () => {
    render(<MissionControl missionId={'mission-test' as Id<'missions'>} />)
    expect(screen.getByText('No prior learning rationale is available for this mission.')).toBeInTheDocument()
    expect(screen.getByText('The last run exceeded its deadline.')).toBeInTheDocument()
  })
  it('requires documented recovery and keeps execution blocked while escalated', () => {
    state.escalated = true
    render(<MissionControl missionId={'mission-test' as Id<'missions'>} />)
    expect(screen.getByTestId('resolve-escalation')).toBeDisabled()
    expect(screen.getByTestId('autonomous-workflow-start')).toBeDisabled()
  })
  it('records recovery without starting a run', async () => {
    state.escalated = true
    render(<MissionControl missionId={'mission-test' as Id<'missions'>} />)
    fillReview()
    fireEvent.click(screen.getByTestId('resolve-escalation'))
    await waitFor(() => expect(state.review).toHaveBeenCalledWith({ incidentId: 'incident-test', recovery: 'Reviewed the actual timeout evidence.', lesson: 'Check the inputs before the next run.' }))
    expect(await screen.findByText(/Human review recorded\./)).toHaveTextContent('will not resume automatically')
    expect(state.execute).not.toHaveBeenCalled()
  })
  it('preserves notes and restores the review button after a failed save', async () => {
    state.escalated = true; state.review.mockRejectedValueOnce(new Error('Review could not be saved.'))
    render(<MissionControl missionId={'mission-test' as Id<'missions'>} />)
    fillReview()
    fireEvent.click(screen.getByTestId('resolve-escalation'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Review could not be saved.')
    await waitFor(() => expect(screen.getByTestId('resolve-escalation')).toBeEnabled())
    expect(screen.getByLabelText('RECOVERY ACTION / INVESTIGATION')).toHaveValue('Reviewed the actual timeout evidence.')
  })
})
