import {beforeEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
vi.mock('convex/react',()=>({useQuery:vi.fn()}))
import {useQuery} from 'convex/react'
import {ResourceCapacity} from '../src/components/resource-capacity'
beforeEach(()=>{cleanup();vi.mocked(useQuery).mockReset()})
describe('record capacity view',()=>{
 it('labels unestablished capacity as review required rather than a full quota',()=>{
  vi.mocked(useQuery).mockImplementation((ref:any,_args?:any)=>getFunctionName(ref)==='resourceCapacity:catalog'
   ?{scope:'Bounded private counts',collections:[{id:'benchmarks',label:'Evaluation reports'}],scopedLimits:[]}as any
   :{id:'benchmarks',count:0,complete:false,readLimited:true,limit:100,remaining:0,blocked:true,scope:'Read budget stopped before capacity was established.'}as any)
  render(<ResourceCapacity/>)
  expect(screen.getByText('Review required')).toBeInTheDocument()
  expect(screen.getAllByText('Not established')).toHaveLength(2)
  expect(screen.queryByText('Limit reached')).toBeNull()
  expect(screen.queryByText('Available')).toBeNull()
 })
 it('still identifies a known reached quota when a read limit prevents a full count',()=>{
  vi.mocked(useQuery).mockImplementation((ref:any,_args?:any)=>getFunctionName(ref)==='resourceCapacity:catalog'
   ?{scope:'Bounded private counts',collections:[{id:'benchmarks',label:'Evaluation reports'}],scopedLimits:[]}as any
   :{id:'benchmarks',count:100,complete:false,readLimited:true,limit:100,remaining:0,blocked:true,scope:'At least the quota is confirmed.'}as any)
  render(<ResourceCapacity/>)
  expect(screen.getByText('At least 100')).toBeInTheDocument()
  expect(screen.getByText('Limit reached')).toBeInTheDocument()
  expect(screen.queryByText('Review required')).toBeNull()
 })
 it('waits for private catalog evidence before showing counts',()=>{
  render(<ResourceCapacity/>)
  expect(screen.getByTestId('resource-capacity')).toHaveAttribute('data-state','loading')
  expect(screen.getByRole('status')).toHaveTextContent('Loading private admission counts')
  expect(screen.queryByRole('table')).toBeNull()
 })
 it('loads counts independently and keeps parent limits separate from account availability',()=>{
  const rows:any={packages:{id:'packages',label:'Integration packages',count:3,complete:false,limit:2,remaining:0,blocked:true,scope:'Retired versions count.'}}
  vi.mocked(useQuery).mockImplementation((ref:any,args?:any)=>{
   if(getFunctionName(ref)==='resourceCapacity:catalog')return {scope:'Private record admission only. Not billing evidence.',collections:[{id:'packages',label:'Integration packages'},{id:'manual-memory',label:'Manual memory saves'}],scopedLimits:[{id:'captures',label:'Source retrieval attempts',parent:'Each research record',limit:10,note:'Failed attempts count.'}]} as any
   return rows[args.id]
  })
  const view=render(<ResourceCapacity/>)
  expect(screen.getByText('At least 3')).toBeInTheDocument()
  expect(screen.getByText('Limit reached')).toBeInTheDocument()
  expect(screen.getByText('Loading count…')).toBeInTheDocument()
  expect(screen.getByRole('table',{name:'Parent-specific admission limits'})).toHaveTextContent('Each research record')
  expect(screen.getByText(/They are not account-wide counts/)).toBeInTheDocument()
  rows['manual-memory']={id:'manual-memory',count:0,complete:true,limit:2,remaining:2,blocked:false,scope:'Older notes are retained and excluded.'}
  view.rerender(<ResourceCapacity/>)
  expect(screen.queryByText('Loading count…')).toBeNull()
  expect(screen.getByText('Available')).toBeInTheDocument()
  expect(screen.queryByRole('button')).toBeNull()
 })
})
