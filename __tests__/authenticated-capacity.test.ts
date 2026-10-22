// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'
import { validateProfile, assessSamples, runWorkload } from '../scripts/check-authenticated-capacity.mjs'
const profile = { label: 'Controlled read test', environment: 'Testing', backendOrigin: 'https://quick-rabbit-810.eu-west-1.convex.cloud', workers: 1, iterations: 2, intervalMs: 1000, timeoutMs: 1000, p95LimitMs: 1000, maxErrorRate: 0 }
const token = 'controlled-session-token-for-tests'
const success = () => new Response(JSON.stringify({ status: 'success', value: { page: [{ private: 'DO-NOT-RETAIN' }], isDone: true, continueCursor: '' } }), { status: 200 })
describe('bounded authenticated workload harness', () => {
  it('rejects non-project and mismatched environment targets before network access', () => {
    for (const backendOrigin of ['http://quick-rabbit-810.eu-west-1.convex.cloud', 'https://other.convex.cloud', 'https://quick-rabbit-810.eu-west-1.convex.cloud/path', 'https://tame-rat-826.eu-west-1.convex.cloud'])
      expect(() => validateProfile({ ...profile, backendOrigin })).toThrow()
  })
  it('requires bounded concurrency, pacing and explicit acceptance targets', () => {
    for (const patch of [{ workers: 9 }, { iterations: 121 }, { intervalMs: 0 }, { timeoutMs: 16000 }, { p95LimitMs: NaN }, { maxErrorRate: .5 }])
      expect(() => validateProfile({ ...profile, ...patch })).toThrow()
  })
  it('does not pass missing, malformed, partial, slow or error-budget-exceeding observations', () => {
    expect(assessSamples(profile, []).passed).toBe(false)
    expect(assessSamples(profile, [{ ok: true, durationMs: 1 }]).passed).toBe(false)
    expect(assessSamples(profile, [{ ok: true, durationMs: NaN }, { ok: true, durationMs: 1 }]).passed).toBe(false)
    expect(assessSamples(profile, [{ ok: true, durationMs: 1001 }, { ok: true, durationMs: 1 }]).passed).toBe(false)
    expect(assessSamples(profile, [{ ok: true, durationMs: 1 }, { ok: false, durationMs: 1 }]).passed).toBe(false)
    expect(assessSamples(profile, [{ ok: true, durationMs: 1 }, { ok: true, durationMs: 1 }]).passed).toBe(true)
  })
  it('authenticates every session before admitting workload and rejects missing credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'error', errorData: 'SECRET-UPSTREAM' })))
    await expect(runWorkload(profile, [], fetcher)).rejects.toThrow(/session token/)
    expect(fetcher).not.toHaveBeenCalled()
    await expect(runWorkload(profile, [token], fetcher)).rejects.toThrow(/preflight failed/)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('retains aggregate timing observations while redacting tokens and private response contents', async () => {
    const fetcher = vi.fn().mockImplementation(success)
    const report = await runWorkload(profile, [token], fetcher, async () => {})
    expect(report.summary).toMatchObject({ completed: 2, failures: 0, passed: true })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(report)).not.toContain(token)
    expect(JSON.stringify(report)).not.toContain('DO-NOT-RETAIN')
    for (const call of fetcher.mock.calls) {
      expect(call[0]).toBe(profile.backendOrigin + '/api/query')
      expect(JSON.parse(call[1].body).path).toBe('providerUsage:history')
      expect(call[1].redirect).toBe('error')
    }
  })
  it('stops after five observed failures and never treats an early stop as acceptance', async () => {
    let calls = 0
    const fetcher = vi.fn().mockImplementation(() => ++calls === 1 ? success() : new Response('private-upstream-error', { status: 503 }))
    const report = await runWorkload({ ...profile, iterations: 8 }, [token], fetcher, async () => {})
    expect(report.summary).toMatchObject({ completed: 5, failures: 5, stoppedEarly: true, passed: false })
    expect(JSON.stringify(report)).not.toContain('private-upstream-error')
  })
  it('does not infer distinct users from worker count', async () => {
    const report = await runWorkload({ ...profile, workers: 2, iterations: 1 }, [token, token], vi.fn().mockImplementation(success), async () => {})
    expect(report.authentication).toContain('distinct users are not inferred')
    expect(report.summary.passed).toBe(true)
  })
})
