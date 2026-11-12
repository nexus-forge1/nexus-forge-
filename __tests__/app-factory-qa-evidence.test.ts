import { describe, expect, it } from 'vitest'
import { deriveQaOutcome, validateQaTargetUrl } from '../convex/appFactoryModel'

describe('browser QA evidence helpers', () => {
  it('does not mark incomplete runs as passed', () => {
    expect(deriveQaOutcome([{ status: 'passed' }, { status: 'not-run' }])).toBe('partial')
    expect(deriveQaOutcome([{ status: 'not-run' }])).toBe('partial')
  })
  it('marks any complete run with a failure as failed', () => {
    expect(deriveQaOutcome([{ status: 'passed' }, { status: 'failed' }])).toBe('failed')
  })
  it('passes only when every recorded case passed', () => {
    expect(deriveQaOutcome([{ status: 'passed' }, { status: 'passed' }])).toBe('passed')
  })
  it('normalizes safe HTTPS targets and local loopback URLs', () => {
    expect(validateQaTargetUrl('https://example.test/path')).toBe('https://example.test/path')
    expect(validateQaTargetUrl('http://localhost:3000/')).toBe('http://localhost:3000/')
  })
  it.each([
    'http://example.test/',
    'https://user:pass@example.test/',
    'https://example.test/path?token=secret',
    'https://example.test/path#session',
  ])('rejects unsafe QA target URL %s', url => {
    expect(() => validateQaTargetUrl(url)).toThrow()
  })
})
