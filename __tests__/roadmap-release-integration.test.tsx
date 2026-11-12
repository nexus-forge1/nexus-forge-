import type { ComponentType } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a>,
}))
vi.mock('../src/components/workspace-layout', () => ({
  WorkspaceLayout: ({ children }: any) => <main>{children}</main>,
}))
import { Route } from '../src/routes/roadmap'

describe('roadmap release integration', () => {
  it('counts active milestones and retains current recovery scope without a stale approval blocker', () => {
    const Page = Route.options.component as ComponentType
    render(<Page />)
    expect(screen.getByText('24 ACTIVE MILESTONES')).toBeInTheDocument()
    expect(screen.getByText('Payment activation')).toBeInTheDocument()
    expect(screen.getByText(/Intentionally gated until business and payout activation/)).toBeInTheDocument()
    expect(screen.getByText(/All 16 workspaces remain in the guide/)).toBeInTheDocument()
    expect(screen.queryByText(/isolated restore awaits specific approval/)).not.toBeInTheDocument()
    expect(screen.getByText(/Full production readiness remains on hold/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Review current checks, environments/ })).toHaveAttribute('href', '/capabilities')
    expect(screen.getByRole('link', { name: /Continue guided workflow/ })).toHaveAttribute('href', '/workflow')
  })
})

vi.mock('../src/components/roadmap-acceptance-matrix',()=>({RoadmapAcceptanceMatrix:()=>null}))
