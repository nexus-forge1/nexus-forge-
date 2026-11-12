import { describe, expect, it } from 'vitest'
import { matchesDraftBinding, parseRunUrl } from '../convex/appFactoryQaCi'

describe('verified snapshot CI draft binding', () => {
  const source = { draftKey: 'browser-private-tasks', revision: 3, contentDigest: 'a'.repeat(64) }
  it('accepts only an exact Browser QA draft kind, key, revision and digest', () => {
    expect(matchesDraftBinding({ kind: 'browser-qa-plan', ...source }, source)).toBe(true)
    expect(matchesDraftBinding({ kind: 'artifact-ci-snapshot', ...source }, source)).toBe(false)
    expect(matchesDraftBinding({ kind: 'browser-qa-plan', ...source, revision: 2 }, source)).toBe(false)
    expect(matchesDraftBinding({ kind: 'browser-qa-plan', ...source, contentDigest: 'b'.repeat(64) }, source)).toBe(false)
    expect(matchesDraftBinding({ kind: 'browser-qa-plan', ...source, draftKey: 'another-plan' }, source)).toBe(false)
  })
})

describe('verified snapshot CI run URL allowlist', () => {
  it('normalizes a canonical NEXUS FORGE GitHub Actions run URL', () => {
    expect(parseRunUrl('https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456')).toEqual({
      id: '123456',
      url: 'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456',
    })
  })

  it.each([
    'http://github.com/nexus-forge1/nexus-forge-/actions/runs/123',
    'https://github.com.attacker.example/nexus-forge1/nexus-forge-/actions/runs/123',
    'https://github.com/other/repo/actions/runs/123',
    'https://user:pass@github.com/nexus-forge1/nexus-forge-/actions/runs/123',
    'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123?token=secret',
    'https://github.com/nexus-forge1/nexus-forge-/actions/runs/0',
    'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123#fragment',
  ])('rejects untrusted or malformed run URL: %s', url => {
    expect(() => parseRunUrl(url)).toThrow()
  })
})
