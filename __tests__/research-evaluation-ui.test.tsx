import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
import {summarize} from '../convex/frontierSupport'
import {ExperimentLab} from '../src/components/experiment-lab'
import {LiveModelComparison} from '../src/components/live-model-comparison'
const state=vi.hoisted(()=>({run:vi.fn(),summary:{} as any,history:[] as any[]}))
vi.mock('convex/react',()=>({
 useAction:()=>state.run,useMutation:()=>vi.fn(),
 useQuery:(ref:any,args:any)=>{
  const name=getFunctionName(ref)
  if(name==='runtimeReceipts:list')return state.history
  if(name==='frontierLab:list')return [{_id:'protocol',title:'Controlled transfer'}]
  if(name==='frontierLab:detail'&&args!=='skip')return {record:{_id:'protocol',title:'Controlled transfer',hypothesis:'Controlled fixture',metric:'points',unit:'points',direction:'higher',target:1,minimumSamples:3,domains:['training','held'],heldOutDomains:['held'],status:'closed'},summary:state.summary,trials:[]}
  return undefined
 }
}))
vi.mock('../src/components/runtime-workbench',()=>({RuntimeWorkbench:()=>null}))
beforeEach(()=>{
 vi.clearAllMocks();state.history=[];state.run.mockResolvedValue('saved report')
 state.summary=summarize([{baseline:0,candidate:10,domain:'training'},{baseline:0,candidate:10,domain:'training'},{baseline:0,candidate:-1,domain:'held'}],'higher',1,3,['training','held'],['held'])
})
afterEach(cleanup)
it('shows a held-out miss and a paired regression beside an aggregate target pass',()=>{
 render(<ExperimentLab kind="generality"/>)
 fireEvent.click(screen.getByRole('button',{name:/^Controlled transfer/}))
 expect(screen.getByText('Recorded sample meets target')).toBeInTheDocument()
 expect(screen.getByTestId('held-out-result')).toHaveTextContent('At least one recorded held-out domain mean misses')
 expect(screen.getByText(/2 improved · 1 regressed/)).toBeInTheDocument()
})
it('reuses an explicit comparison key and creates another only on a separate action',async()=>{
 render(<LiveModelComparison/>)
 const key=(screen.getByLabelText('Comparison request key') as HTMLInputElement).value
 fireEvent.click(screen.getByRole('button',{name:'Run or retrieve matched comparisons'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Run or retrieve matched comparisons'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'Run or retrieve matched comparisons'}))
 await waitFor(()=>expect(state.run).toHaveBeenCalledTimes(2))
 expect(state.run.mock.calls.map(call=>call[0].requestKey)).toEqual([key,key])
 await waitFor(()=>expect(screen.getByRole('button',{name:'Start a new comparison key'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'Start a new comparison key'}))
 expect((screen.getByLabelText('Comparison request key') as HTMLInputElement).value).not.toBe(key)
 expect(state.run).toHaveBeenCalledTimes(2)
})
it('renders unstarted cases separately from zero-scored attempted answers',()=>{
 state.history=[{_id:'job',kind:'provider-comparison',status:'failed',requestKey:'partial-key',result:JSON.stringify({version:'matched-provider-comparison-v2',status:'partial',rows:[{provider:'cloudflare',style:'candidate',status:'not_run',passed:0,total:3,latencyMs:0}],scope:'Controlled partial result'})}]
 render(<LiveModelComparison/>)
 expect(screen.getByText('Not run')).toBeInTheDocument()
 expect(screen.queryByText('0/3')).not.toBeInTheDocument()
 expect(screen.getByText(/matched-provider-comparison-v2 · partial/)).toBeInTheDocument()
})
