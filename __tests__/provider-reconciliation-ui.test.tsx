import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProviderReconciliation } from '../src/components/provider-reconciliation'
const mocks = vi.hoisted(() => ({ save: vi.fn(), results: [] as any[], status: 'LoadingFirstPage', loadMore: vi.fn() }))
vi.mock('convex/react', () => ({
  useMutation: () => mocks.save,
  usePaginatedQuery: () => ({ results: mocks.results, status: mocks.status, loadMore: mocks.loadMore }),
}))
beforeEach(() => { cleanup(); vi.clearAllMocks(); mocks.results = []; mocks.status = 'LoadingFirstPage'; mocks.save.mockResolvedValue('saved') })
function fill() {
  fireEvent.change(screen.getByLabelText('Period start (UTC, inclusive)'), { target: { value: '2026-10-01T00:00' } })
  fireEvent.change(screen.getByLabelText('Period end (UTC, exclusive)'), { target: { value: '2026-10-02T00:00' } })
  fireEvent.change(screen.getByLabelText('Invoice or export reference'), { target: { value: 'invoice-123' } })
  fireEvent.change(screen.getByLabelText('Invoiced usage amount (USD)'), { target: { value: '1.25' } })
  fireEvent.change(screen.getByLabelText('Private evidence reference'), { target: { value: 'private-export.csv' } })
}
describe('invoice comparison UI', () => {
  it('distinguishes loading and empty history while keeping invoice authenticity explicit', () => {
    const view = render(<ProviderReconciliation />)
    expect(screen.getByText('Loading reconciliation history…')).toBeInTheDocument()
    mocks.status = 'Exhausted'; view.rerender(<ProviderReconciliation />)
    expect(screen.getByText('No invoice comparisons saved yet.')).toBeInTheDocument()
    expect(screen.getByText(/does not retrieve or authenticate an invoice/)).toBeInTheDocument()
  })
  it('submits explicit UTC bounds and preserves drafts after a failed save', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Accounting period unavailable'))
    render(<ProviderReconciliation />); fill()
    fireEvent.click(screen.getByRole('button', { name: 'Save invoice comparison' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Accounting period unavailable'))
    expect(screen.getByLabelText('Invoice or export reference')).toHaveValue('invoice-123')
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ periodStart: Date.parse('2026-10-01T00:00Z'), periodEnd: Date.parse('2026-10-02T00:00Z'), invoiceUsd: 1.25, scopeConfirmed: false }))
  })
  it('requires explicit USD and invoice-scope confirmation before applying a local CSV total', async () => {
    render(<ProviderReconciliation />)
    const file = new File(['Description,Amount USD\nusage,1.25\ncredit,0.25'], 'provider-invoice.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Provider billing CSV (maximum 2 MB and 10,000 rows)'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText(/2 data rows/)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Amount column (inspect the sample before choosing)'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Calculate selected-column total' }))
    await waitFor(() => expect(screen.getByText(/Preview total: USD 1.500000/)).toBeInTheDocument())
    const apply = screen.getByRole('button', { name: 'Apply reviewed USD total to reconciliation form' })
    expect(apply).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/I verified the selected column is denominated in USD/))
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    expect(screen.getByLabelText('Invoiced usage amount (USD)')).toHaveValue(1.5)
    expect(screen.getByLabelText('Invoice or export reference')).toHaveValue('provider-invoice.csv')
  })
  it('renders older immutable receipts that do not contain model-level totals', () => {
    mocks.status = 'Exhausted'
    mocks.results = [{ _id: 'old-r', provider: 'groq', status: 'incomplete', invoiceReference: 'old-invoice', periodStart: 1000, periodEnd: 10000, invoiceUsd: 2, ledgerUsd: 1, varianceUsd: 1, invocationCount: 1, matchedReports: 1, missingCharges: 0, unresolvedInvocations: 0, createdAt: 20000, evidenceReference: 'private.csv', invocationIds: ['old-inv'], reports: [{ invocationId: 'old-inv', ordinal: 1, model: 'legacy' }] }]
    render(<ProviderReconciliation />)
    expect(screen.getByText(/No model-level charge totals are available for this snapshot/)).toBeInTheDocument()
    expect(screen.getByText('old-inv')).toBeInTheDocument()
  })
  it('shows incomplete scope, captured provenance and pagination without claiming a verified invoice', () => {
    mocks.status = 'CanLoadMore'
    mocks.results = [{ _id: 'r1', provider: 'groq', status: 'incomplete', invoiceReference: 'private-invoice', periodStart: 1000, periodEnd: 10000, invoiceUsd: 2, ledgerUsd: 1, varianceUsd: 1, invocationCount: 2, matchedReports: 1, missingCharges: 1, unresolvedInvocations: 1, createdAt: 20000, evidenceReference: 'private.csv', invocationIds: ['inv-one'], reports: [{ invocationId: 'inv-one', ordinal: 1, model: 'test' }], modelTotals: [{ model: 'test', reportCount: 1, knownUsd: 1, unknownCharges: 0 }] }]
    render(<ProviderReconciliation />)
    expect(screen.getByText('groq · Incomplete ledger')).toBeInTheDocument()
    expect(screen.getByText(/1 unknown charges · 1 unresolved invocations/)).toBeInTheDocument()
    expect(screen.getByText('inv-one')).toBeInTheDocument()
    expect(screen.getByText(/Model-level charge breakdown \(1 models\)/)).toBeInTheDocument()
    expect(screen.getByText(/known USD 1\.000000 · 0 unknown charges/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more comparisons' }))
    expect(mocks.loadMore).toHaveBeenCalledWith(10)
  })
})
