import {beforeEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import {OpportunityContext} from '../src/components/opportunity-context'
const state=vi.hoisted(()=>({plans:[] as any[],save:vi.fn()}))
vi.mock('convex/react',()=>({useQuery:()=>state.plans,useMutation:()=>state.save}))
const strategies=[{_id:'s1',key:'b:strategy:1',value:JSON.stringify({name:'Pilot product',prerequisites:'Consenting testers',unverifiedAssumptions:'Users will finish the task',expectedValue:'Proposed adoption',timeToEvidence:'Seven days',failureMode:'No adoption',reversibility:'Stop pilot',outcomeStatus:'not_measured'})}]
beforeEach(()=>{cleanup();state.plans=[];state.save.mockReset();state.save.mockResolvedValue('p1')})
function fill(){
 fireEvent.change(screen.getByLabelText('Strategy to validate'),{target:{value:'s1'}})
 fireEvent.change(screen.getByLabelText('Validation action'),{target:{value:'Observe a consenting user pilot'}})
 fireEvent.change(screen.getByLabelText('Metric'),{target:{value:'Completed tasks'}})
 fireEvent.change(screen.getByLabelText('Unit'),{target:{value:'tasks'}})
 fireEvent.change(screen.getByLabelText('Target value'),{target:{value:'5'}})
 fireEvent.change(screen.getByLabelText('Stop condition'),{target:{value:'Stop for any privacy issue'}})
}
describe('opportunity context',()=>{
 it('shows only provided blueprint strategies and requires a selection for planning',()=>{
  render(<OpportunityContext strategies={strategies}/>)
  expect(screen.getByRole('table')).toHaveTextContent('Consenting testers')
  expect(screen.getByRole('table')).toHaveTextContent('not_measured')
  expect(screen.queryByRole('button',{name:'Save validation plan'})).toBeNull()
 })
 it('saves measurable criteria without starting execution',async()=>{
  render(<OpportunityContext strategies={strategies}/>);fill()
  fireEvent.click(screen.getByRole('button',{name:'Save validation plan'}))
  await screen.findByText('Validation plan saved. No experiment was started.')
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({strategyId:'s1',target:5,unit:'tasks',reviewWithinDays:7,direction:'at_least'}))
 })
 it('keeps rejected drafts and resets selection for a different blueprint',async()=>{
  state.save.mockRejectedValue(Error('Please review the target'))
  const {rerender}=render(<OpportunityContext strategies={strategies}/>);fill()
  fireEvent.click(screen.getByRole('button',{name:'Save validation plan'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Please review'))
  expect(screen.getByLabelText('Validation action')).toHaveValue('Observe a consenting user pilot')
  rerender(<OpportunityContext strategies={[]}/>)
  expect(screen.queryByLabelText('Validation action')).toBeNull()
 })
})
