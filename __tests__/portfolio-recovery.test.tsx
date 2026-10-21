import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { PortfolioIntelligence } from '../src/components/portfolio-intelligence'
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }))
vi.mock('convex/react', () => ({
  useQuery: (ref: any) => getFunctionName(ref) === 'portfolio:listRecommendations' ? [{ _id: 'recommendation-test', status: 'recommended', title: 'Test opportunity', mission: 'Test mission', evidence: [] }] : undefined,
  useMutation: () => vi.fn().mockRejectedValue(new Error('Recommendation changed. Refresh before retrying.')),
  useAction: () => vi.fn(),
}))
describe('Portfolio recovery feedback', () => {
  it.each(['Accept → Draft', 'Dismiss'])('handles a rejected %s without selecting a mission', async name => {
    const onSelect = vi.fn()
    render(<PortfolioIntelligence onSelect={onSelect} />)
    const button = screen.getByRole('button', { name })
    fireEvent.click(button)
    // Other child workspaces may independently render role="alert"; target this
    // action's expected error text instead of assuming it is the first alert.
    expect(await screen.findByText(/Recommendation changed/)).toBeInTheDocument()
    await waitFor(() => expect(button).toBeEnabled())
    expect(onSelect).not.toHaveBeenCalled()
  })
})
