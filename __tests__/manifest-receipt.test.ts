import { describe, expect, it } from 'vitest'
import { getCompleteReceiptStrategies, getReceiptStrategyRows, hasCompleteStrategyShape } from '../src/lib/manifest-receipt'

const complete = {
  name: 'Small pilot',
  mechanism: 'Test one narrow segment',
  prerequisites: 'A reachable audience',
  timeToEvidence: 'One week',
  expectedValue: 'Activation evidence',
  reversibility: 'Easy to stop',
  failureMode: 'Too few participants',
  unverifiedAssumptions: 'The audience matches the target',
}

const row = (key: string, value: unknown, _id = key) => ({ _id, key, value: typeof value === 'string' ? value : JSON.stringify(value) })

describe('Manifest exact synthesis receipt validation', () => {
  it('rejects ambiguous duplicate slots and cosmetic strategy copies', () => {
    const repeated=[row('b:strategy:1',complete),row('b:strategy:2',complete),row('b:strategy:3',complete)]
    expect(getCompleteReceiptStrategies(repeated,'b')).toEqual([])
    expect(getCompleteReceiptStrategies([row('b:strategy:1',complete),row('b:strategy:1',{...complete,name:'Other',mechanism:'Other approach'})],'b')).toEqual([])
  })
  it('accepts a complete candidate and rejects malformed or incomplete candidate data', () => {
    expect(hasCompleteStrategyShape(JSON.stringify(complete))).toBe(true)
    expect(hasCompleteStrategyShape('not json')).toBe(false)
    expect(hasCompleteStrategyShape(JSON.stringify({ ...complete, failureMode: '  ' }))).toBe(false)
    expect(hasCompleteStrategyShape(JSON.stringify({ ...complete, expectedValue: 42 }))).toBe(false)
  })

  it('matches only the exact three strategy slots for a blueprint', () => {
    const rows = [
      row('manifest:abc:strategy:1', complete),
      row('manifest:abc:strategy:2', {...complete,name:'Prototype',mechanism:'Build a prototype'}),
      row('manifest:abc:strategy:3', {...complete,name:'Concierge',mechanism:'Deliver a manual service'}),
      row('manifest:abc:strategy:4', complete),
      row('manifest:abc:strategy:2:extra', complete),
      row('manifest:other:strategy:1', complete),
    ]
    expect(getReceiptStrategyRows(rows, 'manifest:abc')).toHaveLength(3)
    expect(getCompleteReceiptStrategies(rows, 'manifest:abc')).toHaveLength(3)
  })

  it('never calls a partial or malformed ledger a complete receipt', () => {
    const rows = [
      row('manifest:partial:strategy:1', complete),
      row('manifest:partial:strategy:2', { ...complete, unverifiedAssumptions: '' }),
      row('manifest:partial:strategy:3', {...complete,name:'Concierge',mechanism:'Deliver a manual service'}),
    ]
    expect(getReceiptStrategyRows(rows, 'manifest:partial')).toHaveLength(3)
    expect(getCompleteReceiptStrategies(rows, 'manifest:partial')).toHaveLength(2)
    expect(getCompleteReceiptStrategies(rows.slice(0, 2), 'manifest:partial')).toHaveLength(1)
  })
})
