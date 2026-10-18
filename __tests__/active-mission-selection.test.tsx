import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {renderHook,act,cleanup} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
const state=vi.hoisted(()=>({selection:undefined as any,calls:[] as {name:string,args:any}[]}))
vi.mock('convex/react',()=>({useQuery:(reference:any,args:any)=>{
 const name=getFunctionName(reference);state.calls.push({name,args})
 if(args==='skip')return undefined
 if(name==='missions:selection')return state.selection
 return []
}}))
import {useActiveMission} from '../src/hooks/use-active-mission'
beforeEach(()=>{sessionStorage.clear();state.selection=undefined;state.calls=[]})
afterEach(cleanup)
describe('mission selection query gating',()=>{
 it('waits for matching owned selection before fetching evidence and isolates switches',()=>{
  sessionStorage.setItem('nexus-forge-active-mission','first')
  const {result,rerender}=renderHook(()=>useActiveMission())
  expect(result.current.missionId).toBeNull()
  expect(result.current.evidenceLoading).toBe(true)
  expect(state.calls.filter(c=>c.name!=='missions:selection').every(c=>c.args==='skip')).toBe(true)
  state.selection={_id:'first',status:'draft'};rerender()
  expect(result.current.missionId).toBe('first')
  expect(state.calls.some(c=>c.name==='research:list'&&c.args.missionId==='first')).toBe(true)
  state.calls=[]
  act(()=>{sessionStorage.setItem('nexus-forge-active-mission','second');window.dispatchEvent(new Event('nexus-active-mission-changed'))})
  expect(result.current.missionId).toBeNull()
  expect(result.current.mission).toBeUndefined()
  expect(state.calls.filter(c=>c.name!=='missions:selection').every(c=>c.args==='skip')).toBe(true)
  state.selection={_id:'second',status:'draft'};rerender()
  expect(result.current.missionId).toBe('second')
 })
 it('clears an unavailable selection without launching protected evidence queries',()=>{
  sessionStorage.setItem('nexus-forge-active-mission','malformed')
  state.selection=null
  const {result}=renderHook(()=>useActiveMission())
  expect(sessionStorage.getItem('nexus-forge-active-mission')).toBeNull()
  expect(result.current.missionId).toBeNull()
  expect(result.current.evidenceLoading).toBe(false)
  expect(state.calls.filter(c=>c.name!=='missions:selection').every(c=>c.args==='skip')).toBe(true)
 })
})
