import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { PortfolioIntelligence } from '../src/components/portfolio-intelligence'
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }))
const authState = vi.hoisted(() => ({ isAuthenticated: true, queryCalls: [] as Array<{ name: string; args: any }> }))
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: authState.isAuthenticated }),
  useQuery: (ref: any, args: any) => { authState.queryCalls.push({ name: getFunctionName(ref), args }); return getFunctionName(ref) === 'portfolio:listRecommendations' ? [{ _id: 'recommendation-test', status: 'recommended', title: 'Test opportunity', mission: 'Test mission', evidence: [] }] : undefined }, 
  useMutation: () => vi.fn().mockRejectedValue(new Error('Recommendation changed. Refresh before retrying.')),
  useAction: () => vi.fn(),
}))
afterEach(() => vi.unstubAllEnvs())
describe('Portfolio recovery feedback', () => {
  it('skips protected portfolio queries until authenticated', () => {
    authState.isAuthenticated = false
    authState.queryCalls = []
    render(<PortfolioIntelligence onSelect={vi.fn()} />)
    expect(authState.queryCalls.filter(call => call.name.startsWith('portfolio:')).length).toBeGreaterThanOrEqual(5)
    expect(authState.queryCalls.filter(call => call.name.startsWith('portfolio:')).every(call => call.args === 'skip')).toBe(true)
    authState.isAuthenticated = true
  })
  it.each(['Accept → Draft', 'Dismiss'])('handles a rejected %s without selecting a mission', async name => {
    vi.stubEnv('VITE_CONVEX_URL', '')
    const onSelect = vi.fn()
    render(<PortfolioIntelligence onSelect={onSelect} />)
    const button = screen.getByRole('button', { name })
    fireEvent.click(button)
    const error = await screen.findByText('Recommendation changed. Refresh before retrying.')
    expect(error).toHaveAttribute('role', 'alert')
    await waitFor(() => expect(button).toBeEnabled())
    expect(onSelect).not.toHaveBeenCalled()
  })
})
