import { haveDistinctStrategyIdentities } from '../../convex/strategyDiversity'
const requiredStrategyFields = ['name', 'mechanism', 'prerequisites', 'timeToEvidence', 'expectedValue', 'reversibility', 'failureMode', 'unverifiedAssumptions'] as const

export function hasCompleteStrategyShape(value: string): boolean {
  try {
    const item = JSON.parse(value) as Record<string, unknown>
    return requiredStrategyFields.every(field => typeof item[field] === 'string' && (item[field] as string).trim().length > 0)
  } catch {
    return false
  }
}

export type StrategyReceiptRow = { _id: string; key: string; value: string }

export function getReceiptStrategyRows<T extends StrategyReceiptRow>(rows: T[], blueprintKey: string): T[] {
  return rows.filter(row => [1, 2, 3].some(index => row.key === `${blueprintKey}:strategy:${index}`))
}

export function getCompleteReceiptStrategies<T extends StrategyReceiptRow>(rows: T[], blueprintKey: string): T[] {
  const matched = getReceiptStrategyRows(rows, blueprintKey)
  if (new Set(matched.map(row => row.key)).size !== matched.length) return []
  const complete = matched.filter(row => hasCompleteStrategyShape(row.value))
  return haveDistinctStrategyIdentities(complete.map(row => JSON.parse(row.value))) ? complete : []
}
