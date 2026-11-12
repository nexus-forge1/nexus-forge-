import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { PlatformUsageEvidence } from '../src/components/platform-usage-evidence'

const makeSnapshot = (overrides: Record<string, unknown> = {}) => ({
  _id: 'usage-new',
  source: 'macaly-database-usage',
  capturedAt: '2026-10-23T03:00:00.000Z',
  historyStart: '2026-10-20T00:00:00.000Z',
  historyEnd: '2026-10-22T00:00:00.000Z',
  historyScope: 'chat_live_and_testing_combined',
  historyCoverage: 'Three complete reported daily buckets',
  historyDays: [{ date: '2026-10-20', functionCallsReported: 0, functionHoursReported: 1, storageHoursReported: 1, functionCalls: 120, databaseReadDocuments: 40, databaseReadBytes: 2097152, ioBytes: 1048576, egressBytes: 524288, storageRequests: 5 }],
  historyTotals: { functionHoursReported: 1, storageHoursReported: 1, functionCalls: 120, databaseReadDocuments: 40, databaseReadBytes: 2097152, ioBytes: 1048576, egressBytes: 524288, storageRequests: 5 },
  functionTarget: 'live',
  functionSnapshotStatus: 'available',
  functionSnapshotCapturedAt: '2026-10-23T03:00:00.000Z',
  functionWindowSeconds: 900,
  functions: [{ udfPath: 'missions:list', udfType: 'query', isPublic: true, invocations: 20, errors: 2, p50Ms: 20, p99Ms: 100, cacheHitPercentage: 10, available: true }],
  failedFunctionCount: 0,
  skippedFunctionCount: 0,
  truncated: false,
  digest: 'digest-new',
  recordedAt: 3000,
  ...overrides,
})
const newer = makeSnapshot()
const older = makeSnapshot({
  _id: 'usage-old',
  capturedAt: '2026-10-23T02:00:00.000Z',
  functionSnapshotCapturedAt: '2026-10-23T02:00:00.000Z',
  historyTotals: { functionHoursReported: 1, storageHoursReported: 1, functionCalls: 100, databaseReadDocuments: 30, databaseReadBytes: 1048576, ioBytes: 800000, egressBytes: 262144, storageRequests: 4 },
  functions: [{ udfPath: 'missions:list', udfType: 'query', isPublic: true, invocations: 15, errors: 1, p50Ms: 18, p99Ms: 70, cacheHitPercentage: 8, available: true }],
  digest: 'digest-old',
  recordedAt: 2000,
})
const mocks = vi.hoisted(() => ({ save: vi.fn(), rows: [] as any[], downloadJson: vi.fn() }))
vi.mock('convex/react', () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === 'platformUsage:history' ? mocks.rows : undefined,
  useMutation: () => mocks.save,
}))
vi.mock('../src/components/studio-shared', () => ({ downloadJson: mocks.downloadJson }))

describe('Platform usage evidence comparison', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rows = [newer, older] })
  it('shows signed deltas for matching windows and function identity', () => {
    render(<PlatformUsageEvidence />)
    fireEvent.click(screen.getByText(/Compare with previous compatible snapshot/))
    expect(screen.getByText('+20')).toBeTruthy()
    expect(screen.getByText('+10')).toBeTruthy()
    expect(screen.getAllByText('+1').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/P99/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/not a normalized rate or a bill/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Export matched comparison JSON' }))
    expect(mocks.downloadJson).toHaveBeenCalledWith('platform-usage-comparison.json', expect.objectContaining({ current: newer, previous: older, deltas: expect.objectContaining({ functionCalls: 20, databaseReadDocuments: 10, egressBytes: 262144 }) }))
  })
  it('does not compare different date scopes or function windows', () => {
    mocks.rows = [newer, makeSnapshot({ _id: 'different-window', historyEnd: '2026-10-21T00:00:00.000Z', functionWindowSeconds: 3600, recordedAt: 1000 })]
    render(<PlatformUsageEvidence />)
    expect(screen.getAllByText(/No prior snapshot with identical coverage/)).toHaveLength(2)
    expect(screen.queryByText(/Compare with previous compatible snapshot/)).toBeNull()
  })
})
