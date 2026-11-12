import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ProductionReleaseReadiness } from '../src/components/production-release-readiness'
import { releaseReady } from '../src/lib/production-readiness'
import { confirmsAnonymousDenial, inspectPublicShell, summarizeProbe } from '../src/lib/production-probe'

describe('release evidence boundaries', () => {
  it('keeps lab-only results separate from archive retention and the release decision', () => {
    render(<ProductionReleaseReadiness />)
    const table = screen.getByRole('table', { name: 'Operational recovery evidence' })
    expect(within(table).getByRole('row', { name: /Retained backup restore and return/ })).toHaveTextContent('Managed Testing')
    const retention = within(table).getByRole('row', { name: /External private archive retention/ })
    expect(retention).toHaveTextContent('Isolated lab')
    expect(retention).toHaveTextContent('EVIDENCE RECORDED')
    expect(retention).toHaveTextContent('not continuing production backup coverage')
    expect(within(retention).getByRole('link')).toHaveAttribute('href', expect.stringContaining('recovery-retained-copy-20261017.json'))
    expect(within(table).getByRole('row', { name: /Daily capture and recovery targets/ })).toHaveTextContent('PARTIAL')
    expect(screen.getByText('RELEASE HOLD')).toBeInTheDocument()
  })

  it('does not call an empty or incomplete checklist ready', () => {
    expect(releaseReady([])).toBe(false)
    expect(releaseReady([{ status: 'verified' }, { status: 'partial' }])).toBe(false)
    expect(releaseReady([{ status: 'blocked' }])).toBe(false)
    expect(releaseReady([{ status: 'verified' }])).toBe(true)
  })
  it('rejects error pages, non-HTML and unidentified shells', () => {
    const html = '<title>NEXUS FORGE</title>'
    expect(inspectPublicShell(200, 'text/html', html)).toBeNull()
    expect(inspectPublicShell(503, 'text/html', html)).not.toBeNull()
    expect(inspectPublicShell(200, 'application/json', html)).not.toBeNull()
    expect(inspectPublicShell(200, 'text/html', 'NEXUS FORGE')).not.toBeNull()
    expect(inspectPublicShell(200, 'text/html', '<title>Other service</title>')).not.toBeNull()
  })
  it('fails empty observations, failed requests and an exceeded latency budget', () => {
    expect(summarizeProbe([]).passedWithinBudget).toBe(false)
    expect(summarizeProbe([{ ok: false, durationMs: 1 }]).passedWithinBudget).toBe(false)
    expect(summarizeProbe([{ ok: true, durationMs: 5001 }]).passedWithinBudget).toBe(false)
    expect(summarizeProbe([{ ok: true, durationMs: 40 }, { ok: true, durationMs: 50 }])).toMatchObject({ p95Ms: 50, passedWithinBudget: true })
  })
  it('requires explicit authorization denial instead of treating network or server failure as a pass', () => {
    expect(confirmsAnonymousDenial({ status: 'error', errorData: 'Authenticated operator session required' })).toBe(true)
    expect(confirmsAnonymousDenial({ status: 'error', errorData: 'Server Error' })).toBe(false)
    expect(confirmsAnonymousDenial({ status: 'success', errorData: 'Authenticated operator session required' })).toBe(false)
  })
  it('shows the dated release hold, demonstrated-but-open recovery work and evidence links', () => {
    render(<ProductionReleaseReadiness />)
    expect(screen.getByText('RELEASE HOLD')).toBeInTheDocument()
    expect(screen.getByText(/Backup and isolated restore · PARTIAL/)).toBeInTheDocument()
    expect(screen.getByText(/Rollback rehearsal · PARTIAL/)).toBeInTheDocument()
    expect(screen.getByText(/This snapshot is not live telemetry/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open monitoring runs/ })).toHaveAttribute('href', expect.stringContaining('/actions/workflows/production-release.yml'))
  })
})
