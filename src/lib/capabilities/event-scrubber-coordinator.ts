import type { ConvexReactClient } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '../scope-e-api'

type SnapshotArgs = FunctionArgs<typeof api.scopeEFunctions.fetchMissionHistoricalStates>
type DiffArgs = FunctionArgs<typeof api.scopeEFunctions.diffHistoricalStateSnapshots>
type ReceiptArgs = FunctionArgs<typeof api.scopeEFunctions.exportEventScrubberReceipt>

export type EventScrubberInput = {
  history: SnapshotArgs
  fromSnapshotKey: string
  toSnapshotKey: string
  requestKey: string
}

export async function coordinateEventScrubber(client: ConvexReactClient, input: EventScrubberInput) {
  const blockers: string[] = []
  if (!input.history.missionKey.trim() || !input.requestKey.trim()) blockers.push('Mission and request keys are required.')
  if (!input.fromSnapshotKey.trim() || !input.toSnapshotKey.trim() || input.fromSnapshotKey === input.toSnapshotKey) blockers.push('Select two distinct checkpoint keys.')
  if (input.history.limit !== undefined && (!Number.isInteger(input.history.limit) || input.history.limit < 1 || input.history.limit > 200)) blockers.push('History limit must be between 1 and 200.')
  if (blockers.length) return { status: 'blocked' as const, blockers, history: null, diff: null, reverseDiff: null, receipt: null }

  const history = await client.query(api.scopeEFunctions.fetchMissionHistoricalStates, input.history)
  const from = history.find(snapshot => snapshot.snapshotKey === input.fromSnapshotKey)
  const to = history.find(snapshot => snapshot.snapshotKey === input.toSnapshotKey)
  if (!from || !to) {
    return { status: 'blocked' as const, blockers: ['Both selected checkpoints must exist in the operator-owned mission history.'], history, diff: null, reverseDiff: null, receipt: null }
  }
  const diffArgs: DiffArgs = {
    fromStateJson: from.stateJson,
    toStateJson: to.stateJson,
    fromAstJson: from.astJson,
    toAstJson: to.astJson,
  }
  const reverseDiffArgs: DiffArgs = {
    fromStateJson: to.stateJson,
    toStateJson: from.stateJson,
    fromAstJson: to.astJson,
    toAstJson: from.astJson,
  }
  const diff = await client.action(api.scopeEFunctions.diffHistoricalStateSnapshots, diffArgs)
  const reverseDiff = await client.action(api.scopeEFunctions.diffHistoricalStateSnapshots, reverseDiffArgs)
  if (!/^[a-f0-9]{64}$/i.test(diff.diffDigest) || !/^[a-f0-9]{64}$/i.test(reverseDiff.diffDigest)) {
    return { status: 'blocked' as const, blockers: ['Forward or reverse diff returned an invalid SHA-256 digest; no receipt was recorded.'], history, diff, reverseDiff, receipt: null }
  }
  const receiptArgs: ReceiptArgs = {
    requestKey: input.requestKey,
    missionKey: input.history.missionKey,
    fromSnapshotKey: from.snapshotKey,
    toSnapshotKey: to.snapshotKey,
    diffDigest: diff.diffDigest,
  }
  const receipt = await client.mutation(api.scopeEFunctions.exportEventScrubberReceipt, receiptArgs)
  return { status: 'completed' as const, blockers, history, diff, reverseDiff, receipt }
}
