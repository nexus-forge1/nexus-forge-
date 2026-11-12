import {beforeEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react'
import {ResearchClaimReview} from '../src/components/research-claim-review'
import {ResearchSourceCapture} from '../src/components/research-source-capture'
const state=vi.hoisted(()=>({captures:[] as any[],save:vi.fn(),retrieve:vi.fn()}))
vi.mock('convex/react',()=>({useQuery:(_ref:any,args:any)=>args?.researchId?state.captures:[],useMutation:()=>state.save,useAction:()=>state.retrieve}))
const url='https://example.com/report'
const captured={_id:'capture1',citation:url,status:'captured',snapshot:{title:'Source title',finalUrl:url,extractedText:'The source reports ten completed observations.',capturedAt:100,publicationStatus:'unknown',textSha256:'a'.repeat(64),bodyBytes:120,textTruncated:false,bodyLimitReached:false}}
beforeEach(()=>{cleanup();state.captures=[captured];state.save.mockReset();state.save.mockResolvedValue('review1');state.retrieve.mockReset()})
describe('source-backed claim review',()=>{
 it('uses a selected capture ID and source excerpt instead of silently treating it as summary text',async()=>{
  render(<ResearchClaimReview missionId={'m1' as any} records={[{_id:'r1',query:'Source evidence',result:'An AI summary, not the source quotation.',citations:[url],createdAt:100}]}/>)
  fireEvent.change(screen.getByLabelText('Claim to assess'),{target:{value:'The source reports completed observations'}})
  fireEvent.change(screen.getByLabelText('Saved research'),{target:{value:'r1'}})
  fireEvent.change(screen.getByLabelText('Exact saved citation'),{target:{value:url}})
  fireEvent.change(screen.getByLabelText('Excerpt basis'),{target:{value:'capture1'}})
  fireEvent.change(screen.getByLabelText('Exact excerpt from retrieved source'),{target:{value:captured.snapshot.extractedText}})
  fireEvent.change(screen.getByLabelText('Why does this evidence affect the claim?'),{target:{value:'The retrieved text explicitly reports a count.'}})
  fireEvent.click(screen.getByRole('button',{name:'Save evidence review'}))
  await waitFor(()=>expect(state.save).toHaveBeenCalledWith(expect.objectContaining({sourceCaptureId:'capture1',excerpt:captured.snapshot.extractedText})))
  expect(screen.getByText(/Publication date: unknown/)).toBeInTheDocument()
 })
 it('keeps summary basis explicit until the operator selects a retrieved snapshot',()=>{
  const onSelect=vi.fn()
  render(<ResearchSourceCapture researchId={'r1' as any} citation={url} selected={null} onSelect={onSelect}/>)
  expect(screen.getByLabelText('Excerpt basis')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('Excerpt basis'),{target:{value:'capture1'}})
  expect(onSelect).toHaveBeenCalledWith(captured)
 })
 it('retains pending/failed retrieval guidance and reports action failures',async()=>{
  state.captures=[{_id:'pending',citation:url,status:'pending'},{_id:'failed',citation:url,status:'failed',failureReason:'Protected gateway rejected source'}]
  state.retrieve.mockRejectedValue(Error('Source capture failed; attempt recorded'))
  render(<ResearchSourceCapture researchId={'r1' as any} citation={url} selected={null} onSelect={vi.fn()}/>)
  fireEvent.click(screen.getByRole('button',{name:'Retrieve selected source'}))
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('attempt recorded'))
  expect(screen.getByText(/awaiting confirmation/)).toBeInTheDocument()
  expect(screen.getByText(/gateway rejected/)).toBeInTheDocument()
 })
})
