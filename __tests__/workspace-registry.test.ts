import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allWorkspaces, primaryWorkspaces, workspaceGroups } from '../src/lib/workspaces'

describe('feature page registry', () => {
  it('gives every workspace one unique, directly routable page', () => {
    const paths = allWorkspaces.map(page => page.path)
    expect(new Set(paths).size).toBe(paths.length)

    for (const page of allWorkspaces) {
      const routeFile = page.path === '/'
        ? resolve(process.cwd(), 'src/routes/index.tsx')
        : resolve(process.cwd(), 'src/routes', page.path.slice(1) + '.tsx')

      expect(existsSync(routeFile), `Missing dedicated route file for ${page.path}`).toBe(true)
      expect(page.purpose.trim().length, `${page.path} needs a purpose`).toBeGreaterThan(0)
      expect(page.use.trim().length, `${page.path} needs a usage guide`).toBeGreaterThan(0)
      expect(page.output.trim().length, `${page.path} needs a defined output`).toBeGreaterThan(0)
    }
  })

  it('keeps support-only diagnostics reachable without adding them to the core feature tour', () => {
    const supportPaths = ['/capabilities', '/readiness', '/incidents', '/providers']
    for (const path of supportPaths) {
      expect(allWorkspaces.some(page => page.path === path)).toBe(true)
      expect(primaryWorkspaces.some(page => page.path === path)).toBe(false)
    }
    expect(primaryWorkspaces.length).toBe(22)
    expect(allWorkspaces.some(page => String(page.path) === '/multimodal')).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'src/routes/multimodal.tsx'))).toBe(false)
  })

  it('keeps Overview, Master Roadmap, and Guided Workflow as distinct destinations', () => {
    for (const path of ['/', '/roadmap', '/workflow']) {
      expect(allWorkspaces.some(page => page.path === path)).toBe(true)
    }
  })

  it('requires each new workspace to be registered in exactly one navigation group', () => {
    const groupedPaths = workspaceGroups.flatMap(group => group.pages.map(page => page.path))
    expect(new Set(groupedPaths).size).toBe(groupedPaths.length)
    expect([...groupedPaths].sort()).toEqual([...allWorkspaces.map(page => page.path)].sort())
  })
})
