import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CouncilPage } from '../src/routes/council'
import { EvidencePage } from '../src/routes/evidence'
import { ArtifactsPage } from '../src/routes/artifacts'
import { DeliveryPage } from '../src/routes/delivery'
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options, Link: ({ to, children }: any) => <a href={to}>{children}</a> }))
vi.mock('../src/components/workspace-layout', () => ({ WorkspaceLayout: ({ children }: any) => <main>{children}</main> }))
vi.mock('../src/hooks/use-active-mission', () => ({ useActiveMission: () => ({ evidenceLoading: true, missionId: 'selected-mission', mission: undefined, agents: [], research: [], artifacts: [], deliveries: [] }) }))
vi.mock('convex/react', () => ({ useAction: () => vi.fn(), useMutation: () => vi.fn(), useQuery: () => undefined }))
describe('mission workspace loading', () => {
  it.each([CouncilPage, EvidencePage, ArtifactsPage, DeliveryPage])('does not show false prerequisites or action controls while evidence loads', Page => {
    render(<Page />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading selected mission and saved evidence')
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/approval required|No artifacts yet|No delivery prepared|No Council run yet/i)).not.toBeInTheDocument()
  })
})
