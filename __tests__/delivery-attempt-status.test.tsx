import {beforeEach,it,expect,vi} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
vi.mock('convex/react',()=>({useQuery:vi.fn()}))
import {useQuery} from 'convex/react'
import {DeliveryAttemptStatus} from '../src/components/delivery-attempt-status'
import type {Id} from '../convex/_generated/dataModel'
beforeEach(()=>{cleanup();vi.mocked(useQuery).mockReset()})
it('shows review-required uncertainty and retained commit rather than offering a retry',()=>{
 vi.mocked(useQuery).mockReturnValue({status:'uncertain',generation:1,phase:'dispatch',message:'Review the retained GitHub evidence.',commitSha:'a'.repeat(40),updatedAt:1})
 render(<DeliveryAttemptStatus id={'fixture' as Id<'deliveries'>}/>)
 expect(screen.getByRole('alert')).toHaveTextContent('A remote write may have completed')
 expect(screen.getByText(/Commit aaaa/)).toBeInTheDocument()
 expect(screen.queryByRole('button')).toBeNull()
})
it('preserves legacy records without inventing a new attempt',()=>{
 vi.mocked(useQuery).mockReturnValue(null)
 const{container}=render(<DeliveryAttemptStatus id={'fixture' as Id<'deliveries'>}/>)
 expect(container).toBeEmptyDOMElement()
})
