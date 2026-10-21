// @vitest-environment node
import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'

const backup=readFileSync(resolve('.github/workflows/nexus-forge-backup-capture.yml'),'utf8')
const artifact=readFileSync(resolve('.github/workflows/nexus-forge-artifact-checks.yml'),'utf8')
const delivery=readFileSync(resolve('.github/workflows/nexus-forge-delivery.yml'),'utf8')

function section(text:string,start:string,end?:string){
 const i=text.indexOf(start);expect(i).toBeGreaterThan(-1)
 const j=end?text.indexOf(end,i+start.length):-1
 return text.slice(i,j>-1?j:undefined)
}

describe('verified backup workflow gating',()=>{
 it('is manual-only with a boolean confirmation that defaults to false',()=>{
  const on=section(backup,'on:','permissions:')
  expect(on).toMatch(/workflow_dispatch:/);expect(on).not.toMatch(/\n\s+(push|pull_request|schedule):/)
  expect(on).toMatch(/confirm_live_export:[\s\S]*type: boolean[\s\S]*default: false/)
 })
 it('runs the live capture job only when confirmation is true',()=>{
  expect(section(backup,'  capture:','runs-on:')).toContain('if: ${{ inputs.confirm_live_export == true }}')
 })
 it('makes an unconfirmed dispatch fail visibly instead of looking like a backup',()=>{
  const guard=section(backup,'  confirmation-required:','  capture:')
  expect(guard).toContain('if: ${{ inputs.confirm_live_export != true }}')
  expect(guard).toContain('No backup was taken');expect(guard).toMatch(/exit 1/)
  expect(guard).not.toMatch(/CONVEX|BACKUP_S3|aws /)
 })
 it('never weakens failure handling',()=>{
  expect(backup).not.toMatch(/continue-on-error/)
  expect(backup).not.toMatch(/\|\|\s*true/)
  expect(backup).toMatch(/permissions:\n  contents: read\n/)
 })
 it('detects missing configuration (regression: escaped indirect expansion never fired)',()=>{
  expect(backup).not.toContain('\\${!name')
  const check=section(backup,'- name: Validate explicit authorization and configuration','- name: Install pinned Convex CLI')
  const body=check.split('run: |')[1].split('\n').map(l=>l.replace(/^ {10}/,'')).join('\n')
  const env={PATH:process.env.PATH??'',CONFIRM_LIVE_EXPORT:'true',BACKUP_S3_ACCESS_KEY_ID:'x',BACKUP_S3_SECRET_ACCESS_KEY:'x',BACKUP_S3_BUCKET:'bucket',BACKUP_S3_REGION:'r'}
  const missing=spawnSync('bash',['-c',body],{env,encoding:'utf8'})
  expect(missing.status).toBe(1);expect(missing.stdout).toContain('missing: CONVEX_DEPLOY_KEY')
  const ok=spawnSync('bash',['-c',body],{env:{...env,CONVEX_DEPLOY_KEY:'fixture-not-a-secret'},encoding:'utf8'})
  expect(ok.status).toBe(0);expect(ok.stdout).not.toContain('fixture-not-a-secret')
  const unconfirmed=spawnSync('bash',['-c',body],{env:{...env,CONVEX_DEPLOY_KEY:'k',CONFIRM_LIVE_EXPORT:'false'},encoding:'utf8'})
  expect(unconfirmed.status).toBe(1)
  const path=spawnSync('bash',['-c',body],{env:{...env,CONVEX_DEPLOY_KEY:'k',BACKUP_S3_BUCKET:'bucket/sub'},encoding:'utf8'})
  expect(path.status).toBe(1)
 })
 it('retrieves independently and compares against values fixed before upload',()=>{
  const upload=section(backup,'- name: Upload archive to private S3-compatible storage','- name: Independently retrieve saved archive')
  expect(upload.indexOf('SOURCE_SHA=')).toBeLessThan(upload.indexOf('put-object'))
  expect(upload).toMatch(/head-object[\s\S]*already exists/)
  const retrieve=section(backup,'- name: Independently retrieve saved archive','- name: Verify archive structure')
  expect(retrieve).toContain('mktemp -d');expect(retrieve).toContain('get-object');expect(retrieve).toContain('backup-receipt.py compare')
  expect(retrieve).toContain('--remote-bytes')
 })
 it('validates the stored receipt and report after upload',()=>{
  const last=section(backup,'- name: Independently retrieve and validate stored receipt and report')
  expect(last).toContain('backup-receipt.py validate');expect(last).toMatch(/get-object[\s\S]*receipt\.json/)
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
