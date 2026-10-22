import {describe,it,expect} from 'vitest'
import {ConvexError} from 'convex/values'
import {operatorError} from '../src/lib/operator-error'
describe('operator-facing action errors',()=>{
 it('shows intentional structured rejection data',()=>{expect(operatorError(new ConvexError('Mission record limit reached (1). Review Record capacity.'),'fallback')).toBe('Mission record limit reached (1). Review Record capacity.')})
 it('preserves bounded local validation but hides generic Convex request details',()=>{
  expect(operatorError(new Error('Mission title is too long'),'fallback')).toBe('Mission title is too long')
  expect(operatorError(new Error('[CONVEX M(missions:create)] [Request ID: private-id] Server Error Called by client'),'Review history first')).toBe('Review history first')
  expect(operatorError(new Error('x'.repeat(1000)),'fallback')).toHaveLength(800)
 })
 it('uses review guidance for unknown or non-text structured data',()=>{
  for(const error of [null,undefined,{},new ConvexError({internal:'not an operator message'})])expect(operatorError(error,'Review saved state')).toBe('Review saved state')
 })
})
