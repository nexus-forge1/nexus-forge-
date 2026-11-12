import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { CouncilPage } from '../src/routes/council'
import { WorkspaceLayout } from '../src/components/workspace-layout'
const mocks = vi.hoisted(() => ({ orchestrate: vi.fn(), remember: vi.fn(), signOut: vi.fn(), navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({}),
  Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useRouterState: ({ select }: any) => select({ location: { pathname: '/council' } }),
  useRouter: () => ({ navigate: mocks.navigate }),
}))
vi.mock('@convex-dev/auth/react', () => ({ useAuthActions: () => ({ signOut: mocks.signOut }) }))
vi.mock('convex/react', () => ({ useAction: () => mocks.orchestrate, useMutation: () => mocks.remember, useQuery: (ref:any) => getFunctionName(ref)==='scopeAFunctions:evaluateCouncilConsensus'?undefined:[] }))
vi.mock('../src/components/auth-wrapper', () => ({ AuthWrapper: ({ children }: any) => children }))
vi.mock('../src/components/workspace-guide', () => ({ WorkspaceGuide: () => null }))
vi.mock('../src/hooks/use-active-mission', () => ({ useActiveMission: () => ({
  evidenceLoading: false, missionId: 'mission-test',
  mission: { title: 'Audit mission', mission: 'Verify the Council handoff', approved: true },
  agents: [], research: [], artifacts: [], deliveries: [], measurements: [], councilComplete: false, hasResearch: false,
}) }))
beforeEach(() => {
  cleanup(); window.sessionStorage.clear(); vi.resetAllMocks()
  mocks.signOut.mockResolvedValue(undefined); mocks.navigate.mockResolvedValue(undefined)
  mocks.remember.mockResolvedValue('memory-test')
  mocks.orchestrate.mockResolvedValue({ ok: false, summary: 'Research specialist could not finish.' })
})
describe('audited workflow handoffs', () => {
  it('links Council to research and saves partial planning with lower confidence', async () => {
    render(<CouncilPage />)
    expect(screen.getByRole('link', { name: 'Continue to research & memory →' })).toHaveAttribute('href', '/evidence')
    fireEvent.click(screen.getByRole('button', { name: 'Execute approved mission planning ↗' }))
    await waitFor(() => expect(mocks.remember).toHaveBeenCalledWith(expect.objectContaining({ missionId: 'mission-test', confidence: 0.5 })))
    expect(await screen.findByRole('alert')).toHaveTextContent('partial result')
  })
  it('uses the successful planning confidence after a complete Council result', async () => {
    mocks.orchestrate.mockResolvedValueOnce({ ok: true, summary: 'All specialists completed.' })
    render(<CouncilPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Execute approved mission planning ↗' }))
    await waitFor(() => expect(mocks.remember).toHaveBeenCalledWith(expect.objectContaining({ confidence: 0.9 })))
  })
  it('preserves mission selection and restores sign out after a rejected request', async () => {
    window.sessionStorage.setItem('nexus-forge-active-mission', 'mission-test')
    mocks.signOut.mockRejectedValueOnce(new Error('Network unavailable'))
    render(<WorkspaceLayout title="Audit" eyebrow="WORKSPACE">Controls</WorkspaceLayout>)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign out')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
    expect(window.sessionStorage.getItem('nexus-forge-active-mission')).toBe('mission-test')
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
  it('clears mission selection after successful sign out', async () => {
    window.sessionStorage.setItem('nexus-forge-active-mission', 'mission-test')
    render(<WorkspaceLayout title="Audit" eyebrow="WORKSPACE">Controls</WorkspaceLayout>)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: '/', replace: true }))
    expect(window.sessionStorage.getItem('nexus-forge-active-mission')).toBeNull()
  })
})
