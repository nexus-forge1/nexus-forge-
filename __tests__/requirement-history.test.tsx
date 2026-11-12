import{render,screen,fireEvent,cleanup,waitFor}from'@testing-library/react'
import{describe,it,expect,vi,beforeEach}from'vitest'
import{getFunctionName}from'convex/server'
import type{Id}from'../convex/_generated/dataModel'
import{RequirementHistory}from'../src/components/requirement-history'
const state=vi.hoisted(()=>({status:null as any,request:vi.fn(),queries:[]as any[]}))
vi.mock('convex/react',()=>({
 useMutation:()=>state.request,
 useQuery:(ref:any,args:any)=>{
  const name=getFunctionName(ref);state.queries.push({name,args})
  if(name==='orchestration:releaseStatus')return state.status
  const second=args.paginationOpts.cursor==='next'
  if(name==='orchestration:listResourcesPage')return{page:[{_id:second?'r2':'r1',resourceKey:second?'older resource':'newer resource',mode:'shared',status:'released'}],isDone:second,continueCursor:second?'end':'next'}
  if(name==='orchestration:listDependenciesPage')return{page:[{_id:'d1',kind:'informs',dependsOnMissionId:'owned-prerequisite',note:'Retained note'}],isDone:true,continueCursor:'end'}
 }
}))
const missionId='mission-test'as Id<'missions'>
beforeEach(()=>{cleanup();state.status=null;state.queries=[];state.request.mockReset()})
describe('requirement history and cleanup controls',()=>{
 it('waits for saved status and keeps pending cleanup disabled',()=>{
  state.status=undefined
  const view=render(<RequirementHistory missionId={missionId}/>)
  expect(screen.getByRole('button',{name:'Release held resources'})).toBeDisabled()
  state.status={status:'pending',released:20,generation:1};view.rerender(<RequirementHistory missionId={missionId}/>)
  expect(screen.getByRole('button',{name:'Cleanup in progress'})).toBeDisabled()
  expect(screen.getByText(/20 reservation\(s\) released/)).toBeInTheDocument()
  expect(state.request).not.toHaveBeenCalled()
 })
 it('reports pending work without claiming completion or replaying the request',async()=>{
  state.request.mockResolvedValue({releasedInBatch:20,totalReleased:20,pending:true,generation:1})
  render(<RequirementHistory missionId={missionId}/>)
  fireEvent.click(screen.getByRole('button',{name:'Release held resources'}))
  await screen.findByText(/remaining batches continue automatically/)
  expect(screen.queryByText(/^Cleanup complete\./)).toBeNull()
  expect(state.request).toHaveBeenCalledTimes(1)
  expect(state.request).toHaveBeenCalledWith({missionId})
 })
 it('navigates history cursors and resets the page when history type changes',()=>{
  render(<RequirementHistory missionId={missionId}/>)
  expect(state.queries.some(q=>q.name.endsWith('Page'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'Inspect requirement history'}))
  expect(screen.getByText('newer resource')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Previous history page'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Next history page'}))
  expect(screen.getByText('older resource')).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Next history page'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Previous history page'}))
  expect(screen.getByText('newer resource')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('History type'),{target:{value:'dependencies'}})
  expect(screen.getByText('owned-prerequisite')).toBeInTheDocument()
  expect(state.queries.filter(q=>q.name==='orchestration:listDependenciesPage').at(-1).args.paginationOpts).toEqual({numItems:20,cursor:null})
  expect(state.request).not.toHaveBeenCalled()
 })
 it('preserves an uncertain write message without an automatic second cleanup request',async()=>{
  state.request.mockRejectedValue(new Error('[CONVEX M(orchestration:requestRelease)] Server Error'))
  render(<RequirementHistory missionId={missionId}/>)
  fireEvent.click(screen.getByRole('button',{name:'Release held resources'}))
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Review its saved status before another request'))
  expect(state.request).toHaveBeenCalledTimes(1)
 })
})
