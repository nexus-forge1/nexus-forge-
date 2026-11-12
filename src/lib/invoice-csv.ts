export type ParsedInvoiceCsv = { headers: string[]; rows: string[][]; rowCount: number }

export function parseInvoiceCsv(source: string): ParsedInvoiceCsv {
  if (source.length > 2_000_000) throw new Error('CSV is larger than the 2 MB local preview limit.')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"' && cell.length === 0) quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []
      if (rows.length > 10_001) throw new Error('CSV exceeds the 10,000-row preview limit.')
    } else cell += char
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.')
  row.push(cell)
  if (row.some(value => value.trim() !== '')) rows.push(row)
  if (rows.length < 2) throw new Error('CSV must contain a header row and at least one data row.')
  const headers = rows[0].map((value, index) => (value.trim() || 'Column ' + (index + 1)).slice(0, 120))
  if (headers.length > 100) throw new Error('CSV has more than 100 columns.')
  if (rows.slice(1).some(item => item.length !== headers.length)) throw new Error('CSV rows have inconsistent column counts; check the export format.')
  return { headers, rows: rows.slice(1), rowCount: rows.length - 1 }
}

export function sumInvoiceCsvColumn(rows: string[][], columnIndex: number): number {
  if (!Number.isInteger(columnIndex) || columnIndex < 0 || !rows.length) throw new Error('Choose a populated numeric amount column.')
  let total = 0
  for (const row of rows) {
    const raw = (row[columnIndex] ?? '').trim()
    if (!raw) throw new Error('The selected amount column has blank values. Choose a complete numeric column or clean the export first.')
    const normalized = raw.replace(/[,$£€¥\s]/g, '').replace(/^\((.*)\)$/, '-$1')
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) throw new Error('The selected column contains a non-numeric amount: ' + raw.slice(0, 40))
    const value = Number(normalized)
    if (!Number.isFinite(value)) throw new Error('The selected column contains an invalid number.')
    total += value
  }
  const rounded = Math.round((total + Number.EPSILON) * 1e6) / 1e6
  if (!Number.isFinite(rounded) || Math.abs(rounded) > 1_000_000) throw new Error('Imported total must be between -1,000,000 and 1,000,000 USD.')
  return rounded
}
