import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductInstrumentation } from '../src/components/product-instrumentation'
import { productEventsEndpoint } from '../src/lib/product-events-endpoint'
import type { Id } from '../convex/_generated/dataModel'
import { getFunctionName } from 'convex/server'
const mocks = vi.hoisted(() => ({ create: vi.fn(), downloadJson: vi.fn(), sources: [] as any[] | undefined }))
vi.mock('convex/react', () => ({ useQuery: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === 'productTelemetry:transportSummary' ? { scope: 'Endpoint-only', requests: 0, requestBytes: 0, responseBytes: 0, meanIngestElapsedMs: null, p50IngestElapsedMs: null, p95IngestElapsedMs: null, bySource: [], complete: true } : getFunctionName(ref) === 'productTelemetry:transportFailureSummary' ? { scope: 'Authenticated HTTP 409 rejections only; raw bodies and secrets are not retained.', requests: 1, invalidRequests: 0, rejectedEvents: 1, requestBytes: 50, responseBytes: 80, bySource: [{ sourceId: 'source-one', requests: 1, requestBytes: 50, responseBytes: 80 }], complete: true } : mocks.sources, useAction: () => mocks.create, useMutation: () => vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a> }))
vi.mock('../src/components/studio-shared', () => ({ downloadJson: mocks.downloadJson }))
beforeEach(() => { mocks.create.mockReset(); mocks.downloadJson.mockReset(); mocks.sources = []; vi.stubEnv('VITE_CONVEX_URL', 'https://example.eu-west-1.convex.cloud') })
afterEach(() => vi.unstubAllEnvs())
describe('product task setup', () => {
  it('derives HTTP site endpoints for ordinary and regional deployments', () => {
    expect(productEventsEndpoint('https://example.convex.cloud')).toBe('https://example.convex.site/product-events')
    expect(productEventsEndpoint('https://example.eu-west-1.convex.cloud')).toBe('https://example.eu-west-1.convex.site/product-events')
    for (const value of ['', 'http://example.convex.cloud', 'https://example.convex.cloud/path', 'https://example.convex.cloud?key=x', 'https://other.example', 'https://user:pass@example.convex.cloud']) expect(productEventsEndpoint(value)).toBeNull()
  })
  it('requires a selected mission and distinguishes loading from empty sources', () => {
    mocks.sources = undefined
    const view = render(<ProductInstrumentation/>)
    expect(screen.getByRole('link', { name: /Select a mission/ })).toHaveAttribute('href', '/mission')
    expect(screen.queryByRole('button', { name: 'Create task measurement source' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    mocks.sources = []; view.rerender(<ProductInstrumentation/>)
    expect(screen.getByText(/No task sources connected yet/)).toBeInTheDocument()
  })
  it('creates only on submission for the selected mission and displays the site endpoint', async () => {
    mocks.create.mockResolvedValue({ sourceId: 'source-one', token: 'one-time-test-token' })
    render(<ProductInstrumentation missionId={'mission-one' as Id<'missions'>} missionTitle="Pilot product"/>)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Owned mission ID')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Product source name'), { target: { value: '  Product server  ' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create task measurement source' }).closest('form')!)
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ missionId: 'mission-one', name: 'Product server' }))
    expect(await screen.findByText('https://example.eu-west-1.convex.site/product-events')).toBeInTheDocument()
  })
  it('exports the bounded transport summary and labels source-reported outcomes', () => {
    mocks.sources = [{ _id: 'source-one', name: 'Pilot source', missionId: 'mission-one', enabled: true, received: 10, successEvents: 9, failureEvents: 1, batch: 1, pendingCount: 0 }]
    render(<ProductInstrumentation missionId={'mission-one' as Id<'missions'>} />)
    expect(screen.getByText(/Task outcomes since counter initialization: 9 successful · 1 unsuccessful · 90.0% reported success/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Export transport evidence JSON' }))
    expect(mocks.downloadJson).toHaveBeenCalledWith('product-transport-evidence.json', expect.objectContaining({ scope: 'Endpoint-only', complete: true, aggregate: expect.objectContaining({ requests: 0 }), bySource: [] }))
    expect(screen.getByText(/1 retained authenticated rejections/)).toBeInTheDocument()
    expect(screen.getByText(/Malformed authenticated requests: 0 · rejected event submissions: 1/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Export rejection evidence JSON' }))
    expect(mocks.downloadJson).toHaveBeenCalledWith('product-transport-rejections.json', expect.objectContaining({ requests: 1, invalidRequests: 0, rejectedEvents: 1, requestBytes: 50, responseBytes: 80 }))
  })
  it('preserves the source name and permits recovery after rejected creation', async () => {
    mocks.create.mockRejectedValue(new Error('Source limit reached'))
    render(<ProductInstrumentation missionId={'mission-one' as Id<'missions'>}/>)
    fireEvent.change(screen.getByLabelText('Product source name'), { target: { value: 'Pilot server' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create task measurement source' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Source limit reached')
    expect(screen.getByLabelText('Product source name')).toHaveValue('Pilot server')
    expect(screen.getByRole('button', { name: 'Create task measurement source' })).toBeEnabled()
  })
})
