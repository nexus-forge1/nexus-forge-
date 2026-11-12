import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { UnitEconomics } from '../src/components/unit-economics'

const mocks = vi.hoisted(() => ({ query: vi.fn(), save: vi.fn() }))
vi.mock('convex/react', () => ({
  useQuery: (ref: any, args: any) => mocks.query(getFunctionName(ref), args),
  useMutation: () => mocks.save,
}))

const project = { _id: 'project-1', title: 'Measured pilot', missionId: 'mission-1', description: 'Pilot', createdAt: 1 }
const taskOutcome = { _id: 'outcome-1', _creationTime: 1, missionId: 'mission-1', metric: 'task-success-rate', actual: 90, target: 80, unit: '%', sampleSize: 10, periodStart: 1000, periodEnd: 2000, method: 'Authenticated task event batch', evidence: ['product source'], notes: 'Not independently verified', observed: 9, targetMet: true, provenance: 'product-events' }
const usage = {
  scope: 'mission', invocationCount: 4, successfulInvocations: 3, failedInvocations: 1, pendingInvocations: 0,
  incompleteInvocations: 0, reportCount: 4, knownChargeReports: 4, unknownChargeReports: 0, knownCostUsd: 0.8,
  estimatedCostUsd: 0, estimatedChargeReports: 0, unpricedReports: 0, promptTokens: 100, completionTokens: 50,
  totalTokens: 150, missingTokenReports: 0, truncated: false, complete: true, providers: [],
}
beforeEach(() => {
  cleanup(); sessionStorage.clear(); mocks.query.mockReset(); mocks.save.mockReset()
  mocks.query.mockImplementation((name: string) => name === 'studio:projects' ? [project] : name === 'providerUsage:summary' ? usage : name === 'verification:productOutcomesV2' ? { page: [taskOutcome] } : [])
})

describe('unit economics observed usage baseline', () => {
  it('requires complete mission usage and only prefills the forecast after an explicit click', () => {
    render(<UnitEconomics />)
    expect(screen.getByLabelText('Cost per attempted operation · USD')).toHaveValue(0.2)
    expect(screen.getByLabelText('Expected success fraction · 0–1')).toHaveValue(0.9)
    fireEvent.click(screen.getByRole('button', { name: 'Copy average AI cost into attempt-cost input' }))
    expect(screen.getByLabelText('Cost per attempted operation · USD')).toHaveValue(0.2)
    expect(screen.getByLabelText('Expected success fraction · 0–1')).toHaveValue(0.9)
    expect(screen.getByLabelText('Scenario label')).toHaveValue('Observed AI cost input · 4 retained invocations')
    expect(screen.getByText(/Invocation success is not business-operation success/)).toBeInTheDocument()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('shows authenticated task success separately and never substitutes it for business success', () => {
    render(<UnitEconomics />)
    expect(screen.getByTestId('economics-task-outcome')).toHaveTextContent('90.0%')
    expect(screen.getByTestId('economics-task-outcome')).toHaveTextContent('across 10 completed tasks')
    expect(screen.getByTestId('economics-task-outcome')).toHaveTextContent(/not independent verification, revenue conversion, or business-operation success/)
    expect(screen.getByLabelText('Expected success fraction · 0–1')).toHaveValue(0.9)
    fireEvent.click(screen.getByRole('button', { name: 'Copy average AI cost into attempt-cost input' }))
    expect(screen.getByLabelText('Expected success fraction · 0–1')).toHaveValue(0.9)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('does not treat manually entered task metrics as event-backed task success', () => {
    mocks.query.mockImplementation((name: string) => name === 'studio:projects' ? [project] : name === 'providerUsage:summary' ? usage : name === 'verification:productOutcomesV2' ? { page: [{ ...taskOutcome, provenance: 'operator-recorded' }] } : [])
    render(<UnitEconomics />)
    expect(screen.getByTestId('economics-task-outcome')).toHaveTextContent(/No retained event-backed task-success batch/)
    expect(screen.getByLabelText('Expected success fraction · 0–1')).toHaveValue(0.9)
  })
  it('does not offer a measured baseline when retained usage is incomplete', () => {
    mocks.query.mockImplementation((name: string) => name === 'studio:projects' ? [project] : name === 'providerUsage:summary' ? { ...usage, complete: false, unknownChargeReports: 1 } : [])
    render(<UnitEconomics />)
    expect(screen.queryByRole('button', { name: 'Copy average AI cost into attempt-cost input' })).toBeNull()
    expect(screen.getByText(/cannot be applied as a measured cost input/)).toBeInTheDocument()
  })
})
