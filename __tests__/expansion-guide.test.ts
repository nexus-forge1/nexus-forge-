import {describe,it,expect} from 'vitest'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {expansionCatalog,starterPaths} from '../src/lib/expansion-catalog'
import {guidedWorkspaces,workspaceGroups,primaryWorkspaces} from '../src/lib/workspaces'
describe('expanded product navigation',()=>{
 it('tracks all 36 distinct requests without treating existing foundations as completed upgrades',()=>{
  expect(expansionCatalog).toHaveLength(36)
  expect(new Set(expansionCatalog.map(f=>f.id)).size).toBe(36)
  expect(new Set(expansionCatalog.map(f=>f.path)).size).toBe(36)
 })
 it('keeps the original 16-page guide and core tour intact',()=>{
  expect(guidedWorkspaces).toHaveLength(16)
  expect(primaryWorkspaces).toHaveLength(18)
  for(const path of starterPaths)expect(guidedWorkspaces.some(p=>p.path===path)).toBe(false)
 })
 it('gives each functioning studio tool one real route and a forward dependency order',()=>{
  expect(starterPaths.slice(0,3)).toEqual(['/templates','/specifications','/knowledge'])
  const group=workspaceGroups.find(g=>g.title==='07 · PRODUCT STUDIO')!
  expect(group.pages.map(p=>p.path)).toEqual([...starterPaths,'/expansion'])
  for(const path of starterPaths){expect(expansionCatalog.some(f=>f.path===path)).toBe(true);expect(existsSync(resolve('src/routes'+path+'.tsx'))).toBe(true)}
 })
})
