import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProviderUsageLedger } from '../src/components/provider-usage-ledger'
const mocks = vi.hoisted(() => ({ results: [] as any[], status: 'LoadingFirstPage', loadMore: vi.fn(), query: vi.fn(), summaryQuery: vi.fn(), summary: undefined as any, missionId: 'mission-one' as string | undefined }))
vi.mock('convex/react', () => ({ usePaginatedQuery: (ref: any, args: any) => { mocks.query(args); return { results: mocks.results, status: mocks.status, loadMore: mocks.loadMore } }, useQuery: (ref: any, args: any) => { mocks.summaryQuery(args); return mocks.summary } }))
vi.mock('../src/hooks/use-active-mission', () => ({ useActiveMission: () => ({ missionId: mocks.missionId }) }))
beforeEach(() => { cleanup(); mocks.results = []; mocks.status = 'LoadingFirstPage'; mocks.summary = undefined; mocks.missionId = 'mission-one'; vi.clearAllMocks() })
describe('provider invocation history UI', () => {
  it('distinguishes loading, missing history and unknown historical usage', () => {
    const view = render(<ProviderUsageLedger />)
    expect(screen.getByText('Loading invocation history…')).toBeInTheDocument()
    expect(mocks.query).toHaveBeenLastCalledWith({ missionId: 'mission-one' })
    mocks.status = 'Exhausted'; view.rerender(<ProviderUsageLedger />)
    expect(screen.getByText(/this is not zero historical usage/)).toBeInTheDocument()
    expect(screen.getByText(/subtotal: Unknown/)).toBeInTheDocument()
  })
  it('shows pending/gap states and never presents a loaded subtotal as a full invoice', () => {
    mocks.status = 'CanLoadMore'
    mocks.results = [
      { _id: 'pending-one', stage: 'council-plan', outcome: 'pending', usageStatus: 'pending', startedAt: 1, reports: [] },
      { _id: 'gap-one', stage: 'artifact-build', outcome: 'succeeded', usageStatus: 'gap', startedAt: 2, observedReports: 2, missionRunId: 'run-one', reports: [{ ordinal: 2, provider: 'groq', model: 'served-model', totalTokens: 20 }] },
    ]
    render(<ProviderUsageLedger />)
    expect(screen.getByText(/council-plan · PENDING · PENDING/)).toBeInTheDocument()
    expect(screen.getByText(/artifact-build · SUCCEEDED · GAP/)).toBeInTheDocument()
    expect(screen.getByText(/Charge unknown/)).toBeInTheDocument()
    expect(screen.getByText(/not account or invoice totals/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more invocations' }))
    expect(mocks.loadMore).toHaveBeenCalledWith(20)
    fireEvent.change(screen.getByLabelText('USAGE SCOPE'), { target: { value: 'all' } })
    expect(mocks.query).toHaveBeenLastCalledWith({})
  })
  it('retains explicitly reported zero charges and uses all-owned scope without a selected mission', () => {
    mocks.missionId = undefined; mocks.status = 'Exhausted'
    mocks.results = [{ _id: 'zero-one', stage: 'intent-compile', outcome: 'succeeded', usageStatus: 'recorded', startedAt: 1, observedReports: 1, reports: [{ ordinal: 1, provider: 'groq', model: 'served', reportedCostUsd: 0 }] }]
    render(<ProviderUsageLedger />)
    expect(mocks.query).toHaveBeenLastCalledWith({})
    expect(screen.getByText(/Known reported subtotal: \$0.000000/)).toBeInTheDocument()
  })
})
