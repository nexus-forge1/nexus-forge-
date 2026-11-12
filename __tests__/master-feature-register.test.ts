import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { masterFeatureRegister, registerCounts, registerStatusOptions } from '../src/lib/master-feature-register'

const PLACEHOLDER_BACKEND = 'No runtime backend is wired to this entry; it is a static tracking/reference page.'
const STATIC_ROUTES = new Set(['/roadmap'])

describe('master feature register', () => {
  it('preserves the requested five-list catalog counts', () => {
    expect(registerCounts).toEqual({
      workspaces: 16,
      milestones: 24,
      expanded: 6,
      productivity: 6,
      portfolio: 30,
      total: 82,
    })
    expect(masterFeatureRegister).toHaveLength(82)
  })

  it('uses unique stable IDs and keeps evidence gaps explicit', () => {
    const ids = masterFeatureRegister.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(82)
    expect(masterFeatureRegister.every((entry) => entry.backend.length > 0 && entry.liveVerification.length > 0 && entry.nextAction.length > 0)).toBe(true)
    expect(registerStatusOptions).toContain('Wired + tested')
  })

  it('gives every non-static entry a concrete wired backend and item test evidence', () => {
    for (const entry of masterFeatureRegister) {
      if (STATIC_ROUTES.has(entry.route)) continue
      expect(entry.backend, `${entry.id} lacks a concrete backend mapping`).not.toBe(PLACEHOLDER_BACKEND)
      expect(entry.testEvidence, `${entry.id} lacks item test evidence`).toContain('__tests__/')
    }
  })

  it('links routes to existing repository test files', () => {
    for (const route of ['/mission', '/artifacts', '/delivery', '/incidents', '/learning', '/providers', '/readiness']) {
      const entry = masterFeatureRegister.find((candidate) => candidate.route === route)
      expect(entry, `expected a register entry for ${route}`).toBeDefined()
      expect(entry?.testEvidence, `expected explicit test evidence for ${route}`).toContain('__tests__/')
    }
    for (const entry of masterFeatureRegister) {
      const refs = entry.testEvidence.match(/__tests__\/[A-Za-z0-9._/-]+\.test\.tsx?/g) ?? []
      for (const ref of refs) expect(existsSync(ref), `${entry.id} references missing test ${ref}`).toBe(true)
    }
  })

  it('keeps every referenced route backed by a real route file', () => {
    for (const entry of masterFeatureRegister) {
      const file = entry.route === '/' ? 'src/routes/index.tsx' : `src/routes/${entry.route.slice(1)}.tsx`
      expect(existsSync(file), `${entry.id} references missing route ${file}`).toBe(true)
    }
  })

  it('does not infer production verification from source presence or route probes', () => {
    expect(masterFeatureRegister.some((entry) => entry.statusNote.toLowerCase().includes('production verified'))).toBe(false)
    // The register retains the 2026-10-22 baseline and newer 2026-10-23 probes for selected routes.
    // Both are anonymous route availability checks only, never authenticated acceptance evidence.
    for (const entry of masterFeatureRegister) {
      expect(entry.liveVerification, `${entry.id} lacks dated Live route evidence`).toMatch(/2026-10-2[23]/)
      expect(entry.liveVerification, `${entry.id} probe evidence must stay a route-level claim`).toContain('route-level availability only')
      expect(entry.liveVerification, `${entry.id} probe evidence must not claim acceptance`).toContain('not an authenticated end-to-end')
    }
    for (const entry of masterFeatureRegister) {
      if (entry.status === 'Wired + tested') {
        expect(entry.statusNote, `${entry.id} must not claim end-to-end verification`).toContain('not an end-to-end')
      }
    }
  })

  it('records the by-design checkout redirect instead of counting it as a straight 200', () => {
    const checkout = masterFeatureRegister.find((entry) => entry.route === '/checkout')
    expect(checkout).toBeDefined()
    expect(checkout?.liveVerification).toContain('HTTP 307 to /checkout?product=')
  })
})
