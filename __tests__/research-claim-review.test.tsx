import {beforeEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import {ResearchClaimReview} from '../src/components/research-claim-review'
const state=vi.hoisted(()=>({rows:[] as any[],save:vi.fn()}))
vi.mock('convex/react',()=>({useQuery:()=>state.rows,useMutation:()=>state.save,useAction:()=>vi.fn()}))
const records=[{_id:'r1',query:'Demand evidence',result:'The survey included forty respondents.',citations:['https://example.com','javascript:alert(1)'],createdAt:100}]
beforeEach(()=>{cleanup();state.rows=[];state.save.mockReset();state.save.mockResolvedValue('review1')})
function fill(){
 fireEvent.change(screen.getByLabelText('Claim to assess'),{target:{value:'Customers need this product'}})
 fireEvent.change(screen.getByLabelText('Saved research'),{target:{value:'r1'}})
 fireEvent.change(screen.getByLabelText('Exact saved citation'),{target:{value:'https://example.com'}})
 fireEvent.change(screen.getByLabelText('Exact excerpt from saved research'),{target:{value:records[0].result}})
 fireEvent.change(screen.getByLabelText('Why does this evidence affect the claim?'),{target:{value:'Sample size leaves adoption unresolved.'}})
}
describe('claim review form',()=>{
 it('requires evidence inputs and offers only usable saved citation options',()=>{
  render(<ResearchClaimReview missionId={'m1' as any} records={records}/>)
  expect(screen.getByRole('button',{name:'Save evidence review'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Saved research'),{target:{value:'r1'}})
  expect(screen.queryByRole('option',{name:'javascript:alert(1)'})).toBeNull()
  expect(screen.getByText(/excerpts are not verified quotations/)).toBeInTheDocument()
 })
 it('saves explicit unresolved evidence and clears completed draft text',async()=>{
  render(<ResearchClaimReview missionId={'m1' as any} records={records}/>);fill()
  fireEvent.click(screen.getByRole('button',{name:'Save evidence review'}))
  await screen.findByText('Evidence review saved.')
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({missionId:'m1',researchId:'r1',finding:'unresolved',excerpt:records[0].result}))
  expect(screen.getByLabelText('Claim to assess')).toHaveValue('')
 })
 it('keeps a failed draft available for correction',async()=>{
  state.save.mockRejectedValue(Error('Excerpt must match saved research'))
  render(<ResearchClaimReview missionId={'m1' as any} records={records}/>);fill()
  fireEvent.click(screen.getByRole('button',{name:'Save evidence review'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Excerpt must match'))
  expect(screen.getByLabelText('Claim to assess')).toHaveValue('Customers need this product')
  expect(screen.getByLabelText('Exact excerpt from saved research')).toHaveValue(records[0].result)
 })
})
