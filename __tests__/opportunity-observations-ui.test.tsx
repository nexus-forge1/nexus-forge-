import {beforeEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import {ObservationForm} from '../src/components/opportunity-observations'
const state=vi.hoisted(()=>({rows:[] as any[],save:vi.fn()}))
vi.mock('convex/react',()=>({useQuery:()=>state.rows,useMutation:()=>state.save}))
const plan={_id:'p1' as any,metric:'Completed tasks',unit:'tasks',target:5,direction:'at_least' as const,createdAt:100}
beforeEach(()=>{cleanup();state.rows=[];state.save.mockReset();state.save.mockResolvedValue('o1')})
function fill(){
 fireEvent.change(screen.getByLabelText('Observed value (optional for partial data)'),{target:{value:'6'}})
 fireEvent.change(screen.getByLabelText('Sample size'),{target:{value:'10'}})
 fireEvent.change(screen.getByLabelText('Measurement period start'),{target:{value:'2026-10-18T00:51:00.000'}})
 fireEvent.change(screen.getByLabelText('Measurement period end'),{target:{value:'2026-10-18T00:52:00.000'}})
 fireEvent.click(screen.getByLabelText('Complete comparable measurement'))
 fireEvent.change(screen.getByLabelText('Measurement method'),{target:{value:'Count completed task receipts'}})
 fireEvent.change(screen.getByLabelText('Evidence reference or reproducible notes'),{target:{value:'Controlled QA log, ten observations'}})
}
describe('opportunity observation form',()=>{
 it('records a numeric observation against the plan ID and clears successful inputs',async()=>{
  render(<ObservationForm plan={plan}/>);fill()
  fireEvent.click(screen.getByRole('button',{name:'Save measured observation'}))
  await screen.findByText('Observation saved against the original target.')
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({planId:'p1',actual:6,sampleSize:10,complete:true,stopTriggered:false}))
  expect(screen.getByLabelText('Sample size')).toHaveValue(null)
 })
 it('preserves a rejected observation draft',async()=>{
  state.save.mockRejectedValue(Error('Measurement period requires review'))
  render(<ObservationForm plan={plan}/>);fill()
  fireEvent.click(screen.getByRole('button',{name:'Save measured observation'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('requires review'))
  expect(screen.getByLabelText('Sample size')).toHaveValue(10)
 })
 it('shows failures and uncertainty alongside next decisions',()=>{
  const base={_id:'o1',actual:6,unit:'tasks',direction:'at_least',target:5,sampleSize:10,periodStart:100,periodEnd:200,method:'Controlled method',evidence:'Controlled evidence',late:false,stopTriggered:false}
  state.rows=[{...base,status:'failed',stopTriggered:true,nextAction:'Stop and review this condition'},{...base,_id:'o2',status:'inconclusive',actual:undefined,late:true,nextAction:'Collect comparable observations'}]
  render(<ObservationForm plan={plan}/>)
  expect(screen.getByText('Target not accepted')).toBeInTheDocument()
  expect(screen.getByText('Inconclusive')).toBeInTheDocument()
  expect(screen.getByText(/Stop and review/)).toBeInTheDocument()
  expect(screen.getByText(/Outside review window/)).toBeInTheDocument()
 })
})
