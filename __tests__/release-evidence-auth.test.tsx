import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { ReleaseEvidenceCenter } from '../src/routes/release-evidence'

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  queryArgs: [] as {name: string; args: unknown}[],
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: auth.isAuthenticated }),
  useQuery: (_reference: unknown, args: unknown) => {
    auth.queryArgs.push({name:getFunctionName(_reference as any),args})
    return undefined
  },
  useMutation: () => vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children: unknown }) => children,
}))

vi.mock('../src/components/workspace-layout', () => ({
  WorkspaceLayout: ({ children }: { children: unknown }) => children,
}))

vi.mock('../src/lib/route-metadata', () => ({ routeHead: () => ({}) }))

afterEach(() => {
  cleanup()
  auth.isAuthenticated = false
  auth.queryArgs = []
})

describe('release evidence authentication readiness', () => {
  it('skips all protected queries while unauthenticated', () => {
    render(<ReleaseEvidenceCenter />)
    expect(auth.queryArgs.length).toBeGreaterThanOrEqual(4)
    expect(auth.queryArgs.every(row => row.args === 'skip')).toBe(true)
  })

  it('enables owner queries after authentication is ready', () => {
    auth.isAuthenticated = true
    render(<ReleaseEvidenceCenter />)
    expect(auth.queryArgs.length).toBeGreaterThanOrEqual(4)
    for (const name of ['releaseEvidence:list','releaseEvidence:history','releaseEvidence:workspaceKey']) {
      expect(auth.queryArgs.filter(row => row.name === name).at(-1)?.args).toEqual({})
    }
    expect(auth.queryArgs.filter(row => row.name === 'releaseEvidence:reviewQueue').at(-1)?.args).toBe('skip')
  })
})
