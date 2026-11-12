import { describe, expect, it } from 'vitest'
import { pipelineGuides } from '../src/lib/pipeline-guides'
import { allWorkspaces } from '../src/lib/workspaces'

const workspacePaths = new Set<string>(allWorkspaces.map(page => page.path))

describe('pipeline guides', () => {
  it('covers only real workspace pages', () => {
    for (const path of Object.keys(pipelineGuides)) {
      expect(workspacePaths.has(path), `${path} must be a real workspace page`).toBe(true)
    }
  })

  it('every guide has an ordered sequence and a valid handoff', () => {
    for (const [path, guide] of Object.entries(pipelineGuides)) {
      expect(guide.steps.length, `${path} needs at least two steps`).toBeGreaterThanOrEqual(2)
      for (const step of guide.steps) {
        expect(step.title.trim().length, `${path} step title`).toBeGreaterThan(0)
        expect(step.note.trim().length, `${path} step note`).toBeGreaterThan(0)
      }
      expect(workspacePaths.has(guide.handoff.path), `${path} handoff target must exist`).toBe(true)
      expect(guide.handoff.label.trim().length, `${path} handoff label`).toBeGreaterThan(0)
    }
  })

  it('could-also links point at real workspace pages', () => {
    for (const [path, guide] of Object.entries(pipelineGuides)) {
      for (const link of guide.couldAlso ?? []) {
        expect(workspacePaths.has(link.path), `${path} could-also target ${link.path} must exist`).toBe(true)
      }
    }
  })

  it('covers the business factory and release command pipelines', () => {
    for (const path of ['/demand', '/monetization', '/customer-operations', '/growth', '/business-readiness',
      '/deployment-planner', '/previews', '/environments', '/releases', '/recovery', '/diagnostics', '/ownership']) {
      expect(pipelineGuides[path], `${path} must have a pipeline guide`).toBeDefined()
    }
  })
})
