import { describe, expect, it } from 'vitest'
import { validateDraftContent, validateDraftKey } from '../convex/appFactoryModel'

describe('Persistent App Factory draft contracts', () => {
  it('accepts stable keys and valid JSON documents', () => {
    expect(validateDraftKey('database-project-notes')).toBe('database-project-notes')
    expect(validateDraftContent('{"kind":"browser-qa-plan","execution":"not-run"}')).toContain('"not-run"')
  })
  it('rejects unstable keys, non-JSON and oversized content', () => {
    expect(() => validateDraftKey('../bad')).toThrow()
    expect(() => validateDraftKey('UPPER-CASE')).toThrow()
    expect(() => validateDraftContent('not json')).toThrow(/valid JSON/)
    expect(() => validateDraftContent('x'.repeat(65537))).toThrow(/65536/)
  })
  it('rejects credential-like strings from saved artifact payloads', () => {
    expect(() => validateDraftContent(JSON.stringify({ note: 'ghp_' + 'A'.repeat(40) }))).toThrow(/credential-like/)
  })
})
