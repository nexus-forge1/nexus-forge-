import {beforeEach,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
vi.mock('convex/react',()=>({useQuery:vi.fn()}))
import {useQuery} from 'convex/react'
import {RuntimeHistory} from '../src/components/runtime-history'
beforeEach(()=>{cleanup();vi.mocked(useQuery).mockReset()})
it('shows incomplete inspection and browses retained history with server cursors',()=>{
 vi.mocked(useQuery).mockImplementation((ref:any,args?:any)=>{
  if(getFunctionName(ref)==='runtimeReceipts:activeSummary')return{rows:[],readLimited:true,complete:false,scope:'History inspection reached its safety limit.'}as any
  if(args==='skip')return undefined
  return{page:[{_id:args.paginationOpts.cursor?'old':'new',kind:'media-chain',status:'complete',requestKey:args.paginationOpts.cursor?'older-receipt':'recent-receipt',result:'Retained result'}],isDone:!!args.paginationOpts.cursor,continueCursor:'server-cursor'}as any
 })
 render(<RuntimeHistory/>)
 fireEvent.click(screen.getByText('Runtime receipts'))
 expect(screen.getByRole('status')).toHaveTextContent('safety limit')
 fireEvent.click(screen.getByText('Browse retained history'))
 expect(screen.getByText(/recent-receipt/)).toBeInTheDocument()
 expect(screen.getByText('Previous history page')).toBeDisabled()
 fireEvent.click(screen.getByText('Next history page'))
 expect(screen.getByText(/older-receipt/)).toBeInTheDocument()
 expect(screen.getByText('Next history page')).toBeDisabled()
 fireEvent.click(screen.getByText('Previous history page'))
 expect(screen.getByText(/recent-receipt/)).toBeInTheDocument()
})
it('does not claim empty history while queries are loading',()=>{
 render(<RuntimeHistory/>)
 fireEvent.click(screen.getByText('Runtime receipts'))
 expect(screen.getByText('Loading receipts…')).toBeInTheDocument()
 fireEvent.click(screen.getByText('Browse retained history'))
 expect(screen.getByText('Loading history page…')).toBeInTheDocument()
 expect(screen.queryByText('No receipts on this page.')).toBeNull()
})
