import {beforeEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
import {LearningEffectivenessReview} from '../src/components/learning-effectiveness-review'
const state=vi.hoisted(()=>({sources:[] as any[],history:[] as any[],save:vi.fn()}))
vi.mock('convex/react',()=>({useQuery:(ref:any)=>getFunctionName(ref).endsWith(':sources')?state.sources:state.history,useMutation:()=>state.save}))
beforeEach(()=>{cleanup();state.sources=[{id:'r1',category:'retrieval-evaluation',value:'{"search":"First task"}'},{id:'r2',category:'retrieval-evaluation',value:'{"search":"Second task"}'}];state.history=[];state.save.mockReset();state.save.mockResolvedValue('review')})
function fill(){
 fireEvent.click(screen.getByRole('checkbox',{name:/First task/}))
 fireEvent.click(screen.getByRole('checkbox',{name:/Second task/}))
 fireEvent.change(screen.getByLabelText('Comparable conditions and evidence limitations'),{target:{value:'Same controlled scope; reviewed relevance labels.'}})
 fireEvent.click(screen.getByRole('checkbox',{name:/I reviewed comparability/}))
}
describe('learning effectiveness review UI',()=>{
 it('submits source references and notes without client-provided scores',async()=>{
  render(<LearningEffectivenessReview/>);fill()
  fireEvent.click(screen.getByRole('button',{name:'Save effectiveness review'}))
  await screen.findByText('Effectiveness review saved. No policy or strategy was promoted.')
  expect(state.save).toHaveBeenCalledWith({kind:'retrieval',sourceIds:['r1','r2'],notes:'Same controlled scope; reviewed relevance labels.',comparabilityReviewed:true})
 })
 it('keeps selection and notes after a rejected comparison',async()=>{
  state.save.mockRejectedValue(Error('Selected sources are incompatible'))
  render(<LearningEffectivenessReview/>);fill()
  fireEvent.click(screen.getByRole('button',{name:'Save effectiveness review'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('incompatible'))
  expect(screen.getByRole('checkbox',{name:/First task/})).toBeChecked()
  expect(screen.getByLabelText('Comparable conditions and evidence limitations')).toHaveValue('Same controlled scope; reviewed relevance labels.')
 })
 it('shows regressions alongside positive means and retained source IDs',()=>{
  state.history=[{_id:'review',createdAt:100,notes:'Controlled evidence',sourceIds:['r1','r2'],summary:JSON.stringify({status:'regression-observed',units:2,metrics:[{metric:'cost',unit:'USD',baselineMean:10,candidateMean:8,benefitMean:2,improved:1,regressed:1,unchanged:0}],recommendation:'Review regressions before reuse.',limitation:'Not causal proof.'})}]
  render(<LearningEffectivenessReview/>)
  expect(screen.getByText('regression-observed')).toBeInTheDocument()
  expect(screen.getByRole('table')).toHaveTextContent('1 / 1 / 0')
  expect(screen.getByText('Source receipts: r1, r2')).toBeInTheDocument()
 })
})
