import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { MissionControl } from '../src/components/mission-control'
import type { Id } from '../convex/_generated/dataModel'

const claimState = vi.hoisted(() => ({ rows: [] as any[], cancel: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }))
vi.mock('convex/react', async () => ({
  ...await vi.importActual<typeof import('convex/react')>('convex/react'),
  useQuery: (ref: any, args?: any) => {
    const name = getFunctionName(ref)
    if (args?.id === 'mission-test' || (name.toLowerCase().includes('missions') && name.toLowerCase().includes('getbyid'))) return { _id: 'mission-test', title: 'Recovery mission', approved: true, status: 'running', mission: 'Recovery mission' }
    if (name.toLowerCase().includes('missionrunner') && name.toLowerCase().includes('get')) return { _id: 'run-test', status: 'running', currentStage: 'agent_coordination', lastError: undefined }
    if (name === 'executionClaims:unresolved') return claimState.rows
    if (name === 'delivery:list') return [{ _id: 'delivery-test', stage: 'verified' }]
    if (['artifacts:list', 'incidents:list', 'verification:list', 'verification:measurements', 'portfolio:listDecisions'].includes(name)) return []
    if (args?.missionId === 'mission-test') return []
    return undefined
  },
  useMutation: (ref: any) => getFunctionName(ref) === 'missionRunner:cancel' ? claimState.cancel : vi.fn().mockRejectedValue(new Error('Delivery evidence changed. Review before retrying.')),
  useAction: () => vi.fn(),
}))

describe('Mission Control recovery feedback', () => {
  it('shows uncertain work without exposing a reset or replay control', () => {
    claimState.rows = [{ id: 'claim-visible', scope: 'council', status: 'uncertain', createdAt: 1 }]
    render(<MissionControl missionId={'mission-test' as Id<'missions'>} />)
    expect(screen.getByText(/Interrupted or unconfirmed work requires review/)).toBeInTheDocument()
    expect(screen.getByText(/Reservations do not expire automatically/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review recovery evidence →' })).toHaveAttribute('href', '/incidents')
    expect(screen.queryByRole('button', { name: /reset|replay/i })).not.toBeInTheDocument()
    claimState.rows = []
  })
  it('requests owner cancellation with an explicit warning about in-flight provider work', async () => {
    claimState.cancel.mockReset().mockResolvedValue(null)
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    render(<MissionControl missionId={'mission-test' as Id<'missions'>} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request cancellation' }))
    await waitFor(() => expect(claimState.cancel).toHaveBeenCalledWith({ missionId: 'mission-test' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('provider work already in flight may finish'))
    expect(await screen.findByRole('status')).toHaveTextContent('Cancellation recorded')
    vi.unstubAllGlobals()
  })
  it('shows outcome errors even when portfolio snapshots are unavailable and restores the button', async () => {
    render(<MissionControl missionId={'mission-test' as Id<'missions'>} />)
    const button = screen.getByRole('button', { name: 'Record outcome verification' })
    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Delivery evidence changed')
    await waitFor(() => expect(button).toBeEnabled())
    expect(screen.getByRole('link', { name: 'Review delivery evidence →' })).toHaveAttribute('href', '/delivery')
    expect(screen.getByRole('link', { name: 'Review incidents →' })).toHaveAttribute('href', '/incidents')
  })
})
