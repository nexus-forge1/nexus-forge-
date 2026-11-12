import { describe, expect, it } from 'vitest'
import { parseInvoiceCsv, sumInvoiceCsvColumn } from '../src/lib/invoice-csv'

describe('local invoice CSV preview', () => {
  it('parses quoted commas, escaped quotes, CRLF and a final row without newline', () => {
    const parsed = parseInvoiceCsv('Description,Amount,Note\r\n"Model, premium",1.25,"said ""ok"""\r\nCredit,-0.25,adjustment')
    expect(parsed.headers).toEqual(['Description', 'Amount', 'Note'])
    expect(parsed.rowCount).toBe(2)
    expect(parsed.rows[0]).toEqual(['Model, premium', '1.25', 'said "ok"'])
    expect(sumInvoiceCsvColumn(parsed.rows, 1)).toBe(1)
  })
  it('sums currency-formatted values and accounting-style negatives', () => {
    expect(sumInvoiceCsvColumn([['$1,250.50'], ['(250.25)'], ['0']], 0)).toBe(1000.25)
  })
  it('rejects malformed, ragged, oversized, blank and nonnumeric exports', () => {
    expect(() => parseInvoiceCsv('a,b\n1')).toThrow(/inconsistent/)
    expect(() => parseInvoiceCsv('a\n"unfinished')).toThrow(/unclosed/)
    expect(() => parseInvoiceCsv('x'.repeat(2_000_001))).toThrow(/2 MB/)
    expect(() => sumInvoiceCsvColumn([['1'], ['']], 0)).toThrow(/blank/)
    expect(() => sumInvoiceCsvColumn([['amount'], ['one']], 0)).toThrow(/non-numeric/)
  })
  it('rejects absent columns and totals outside the supported bound', () => {
    expect(() => sumInvoiceCsvColumn([['1']], -1)).toThrow()
    expect(() => sumInvoiceCsvColumn([['1000001']], 0)).toThrow(/between/)
  })
})
