// @vitest-environment node
import {describe,it,expect} from 'vitest'
import {readFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'

const artifact=readFileSync(resolve('.github/workflows/nexus-forge-artifact-checks.yml'),'utf8')
const delivery=readFileSync(resolve('.github/workflows/nexus-forge-delivery.yml'),'utf8')

function section(text:string,start:string,end?:string){
 const i=text.indexOf(start);expect(i).toBeGreaterThan(-1)
 const j=end?text.indexOf(end,i+start.length):-1
 return text.slice(i,j>-1?j:undefined)
}

describe('verified backup capture lives in nexus-forge1/no-dispatch',()=>{
 it('does not keep a second backup workflow in the main repository',()=>{
  expect(existsSync(resolve('.github/workflows/nexus-forge-backup-capture.yml'))).toBe(false)
 })
})

describe('exact artifact checks triggers and assertions',()=>{
 it('runs on pull requests to main, pushes to main and manual dispatch without path filters',()=>{
  const on=section(artifact,'on:','permissions:')
  expect(on).toMatch(/workflow_dispatch:/);expect(on).toMatch(/pull_request:\n\s+branches: \[main\]/);expect(on).toMatch(/push:\n\s+branches: \[main\]/)
  expect(on).not.toMatch(/paths:/)
 })
 it('keeps the exact negative-control assertion text',()=>{
  expect(artifact).toContain("steps[0].detail.includes('Expected 14; observed 140')")
 })
})

describe('delivery workflow stays mission-dispatched',()=>{
 it('only deploys on explicit mission dispatch with environment protection',()=>{
  const on=section(delivery,'on:','permissions:')
  expect(on).toMatch(/workflow_dispatch:/);expect(on).not.toMatch(/\n\s+(push|pull_request|schedule):/)
  expect(delivery).toMatch(/environment:\n\s+name: github-pages/)
 })
})
