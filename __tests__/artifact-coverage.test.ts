import {describe,it,expect} from 'vitest'
import {JSDOM,VirtualConsole} from 'jsdom'
import {artifactCoverage} from '../scripts/fixtures/artifact-coverage'
import {verifyArtifactContent} from '../convex/artifactQuality'
import {buildArtifactTestDocument} from '../src/lib/artifact-test-runner'
import type {StepResult} from '../convex/artifactTestPlan'
import {artifactFilename} from '../src/lib/artifact-download'
describe('representative complete artifact snapshots',()=>{
 it.each(artifactCoverage)('$id passes structural checks and exact local acceptance',async fixture=>{
  expect(verifyArtifactContent(fixture.content,fixture.mission).passed).toBe(true)
  const dom=new JSDOM(buildArtifactTestDocument(fixture.content,fixture.plan,'coverage'),{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole()})
  try{
   const results=await new Promise<StepResult[][]>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('No result')),3000)
    dom.window.addEventListener('message',e=>{if(e.data?.nonce==='coverage'){clearTimeout(timer);resolve(e.data.results)}})
   })
   expect(results.flat().every(step=>step.status==='pass')).toBe(true)
  }finally{dom.window.close()}
 })
 it('uses a bounded identifier filename and cannot create a traversal path',()=>{
  expect(artifactFilename('../a/é:b')).toBe('nexus-forge-ab.html')
  expect(()=>artifactFilename('../')).toThrow()
  expect(artifactFilename('a'.repeat(200)).length).toBeLessThan(130)
 })
})
