import { describe, expect, it } from 'vitest'
import { matchesTargetWorkflowCommit, parseTargetQaRunUrl } from '../../convex/appFactoryQaCi'

describe('verified target-browser run URL parsing', () => {
  it('binds the report to the exact workflow commit without confusing it with target source', () => {
    const workflowSha = 'a'.repeat(40)
    expect(matchesTargetWorkflowCommit(workflowSha, workflowSha)).toBe(true)
    expect(matchesTargetWorkflowCommit('b'.repeat(40), workflowSha)).toBe(false)
    expect(matchesTargetWorkflowCommit('not-a-sha', workflowSha)).toBe(false)
  })

  it('normalizes an exact NEXUS FORGE Actions run URL', () => {
    expect(parseTargetQaRunUrl('https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456')).toEqual({
      id: '123456',
      url: 'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456',
    })
    expect(parseTargetQaRunUrl('https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456/')).toEqual({
      id: '123456',
      url: 'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456',
    })
  })

  it.each([
    'https://github.com/other/repo/actions/runs/123',
    'https://github.com/nexus-forge1/nexus-forge-/actions/runs/0',
    'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123?token=secret',
    'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123#fragment',
    'http://github.com/nexus-forge1/nexus-forge-/actions/runs/123',
    'https://user:pass@github.com/nexus-forge1/nexus-forge-/actions/runs/123',
    'https://github.com.evil.test/nexus-forge1/nexus-forge-/actions/runs/123',
  ])('rejects untrusted run URL %s', value => {
    expect(() => parseTargetQaRunUrl(value)).toThrow()
  })
})
