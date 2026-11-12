import {beforeEach,describe,it,expect,vi} from 'vitest'
import {renderHook} from '@testing-library/react'
const state=vi.hoisted(()=>({missionId:'fixture',mission:{status:'running',approved:true},agents:[] as any[],research:[] as any[],artifacts:[] as any[],deliveries:[] as any[],measurements:[] as any[]}))
vi.mock('../src/hooks/use-active-mission',()=>({useActiveMission:()=>state}))
import {useMissionGuide} from '../src/lib/use-mission-guide'
beforeEach(()=>{state.mission.status='running';state.agents=[];state.research=[];state.artifacts=[];state.deliveries=[];state.measurements=[]})
describe('mission status navigation',()=>{
 it.each([['review','/portfolio','Resolve portfolio review'],['cancelled','/mission','Define a new mission contract'],['complete','/learning','Review recorded outcome']])('directs %s missions away from execution', (status,path,title)=>{
  state.mission.status=status
  const {result}=renderHook(()=>useMissionGuide())
  expect(result.current.nextStage).toMatchObject({path,title})
  expect(result.current.stages).toHaveLength(9)
  expect(result.current.completed).toBe(2)
 })
 it('continues an active mission at its next unrecorded prerequisite',()=>{
  const {result}=renderHook(()=>useMissionGuide())
  expect(result.current.nextStage).toMatchObject({path:'/council',title:'Complete AI Council planning'})
 })
 it('allows post-delivery measurement on a complete mission without resuming execution',()=>{
  state.mission.status='complete'
  state.deliveries=[{stage:'verified',readinessStatus:'pass',readinessTotalCount:6,readinessPassedCount:6,workflowRunUrl:'https://example.com/run',workflowCommitSha:'a',deploymentRunUrl:'https://example.com/run',deploymentCommitSha:'a',deploymentUrl:'https://example.com'}]
  const {result}=renderHook(()=>useMissionGuide())
  expect(result.current.nextStage).toMatchObject({path:'/workflow',title:'Measure outcome and capture learning'})
 })
 it('does not recommend blocked delivery execution for closed or held missions',()=>{
  state.agents=[{status:'complete'}];state.research=[{citations:['https://example.com']}];state.artifacts=[{status:'ready'}]
  state.deliveries=[{stage:'blocked',status:'Controlled blocked delivery'}]
  state.mission.status='running'
  const {result,rerender}=renderHook(()=>useMissionGuide())
  expect(result.current.recovery?.path).toBe('/delivery')
  for(const status of ['review','complete','cancelled']){
   state.mission.status=status;rerender()
   expect(result.current.recovery).toBeUndefined()
   expect(result.current.nextStage?.path).not.toBe('/delivery')
  }
 })
})
