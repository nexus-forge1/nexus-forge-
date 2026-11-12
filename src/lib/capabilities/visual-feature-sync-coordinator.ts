import type { ConvexReactClient } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export type VisualSyncDiff = { path: string; kind: 'add' | 'remove' | 'change'; summary: string }
export type FeatureFile = { path: string; content: string; language: string }

/**
 * Computes canvas/AST differences, persists the visual revision bridge, compiles a
 * feature scaffold, and hands the artifact to the existing feature workflow.
 * All writes are owner-scoped by their existing Convex handlers; no deployment occurs.
 */
export async function coordinateVisualFeatureSync(
  client: ConvexReactClient,
  input: {
    requestKey: string
    projectKey: string
    revision: number
    state: string[]
    ast: string[]
    featureKey: string
    dependencies: string[]
    files: FeatureFile[]
    language: string
    handoffState: 'draft' | 'ready' | 'accepted' | 'blocked'
  },
) {
  const diff = await client.query(api.scopeDFunctionsBatchTwo.diffVisualStateToAst, {
    state: input.state,
    ast: input.ast,
  })
  const changes: VisualSyncDiff[] = [
    ...diff.additions.map(path => ({ path, kind: 'add' as const, summary: 'Present in visual state but absent from AST' })),
    ...diff.removals.map(path => ({ path, kind: 'remove' as const, summary: 'Present in AST but absent from visual state' })),
  ]
  const syncId = await client.mutation(api.scopeDFunctionsBatchTwo.syncVisualCodeRevision, {
    requestKey: input.requestKey,
    projectKey: input.projectKey,
    revision: input.revision,
    stateDigest: diff.stateDigest,
    astDigest: diff.astDigest,
    diff: changes,
  })
  const scaffold = await client.action(api.scopeDFunctionsBatchTwo.compileFeatureScaffold, {
    featureKey: input.featureKey,
    dependencies: input.dependencies,
    files: input.files,
    language: input.language,
  })
  const handoffId = await client.mutation(api.scopeDFunctionsBatchTwo.handoffFeatureArtifact, {
    requestKey: input.requestKey + '-handoff',
    featureKey: input.featureKey,
    artifactKey: scaffold.artifactDigest,
    dependencies: input.dependencies,
    files: scaffold.files,
    handoffState: diff.equal ? input.handoffState : 'blocked',
  })
  return {
    synchronized: diff.equal,
    diff,
    syncId,
    scaffold,
    handoffId,
    blockedReason: diff.equal ? null : 'Visual canvas and AST differ; artifact handoff was forced to blocked state.',
  }
}
