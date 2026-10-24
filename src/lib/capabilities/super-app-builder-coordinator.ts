import type { ConvexReactClient } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '../scope-e-api'

type IntakeArgs = FunctionArgs<typeof api.scopeEFunctions.intakeAppBuilderSpec>
type CompileArgs = FunctionArgs<typeof api.scopeEFunctions.compileAppScaffold>
type TransitionArgs = FunctionArgs<typeof api.scopeEFunctions.transitionBuildLane>

export type SuperAppBuildInput = {
  intake: IntakeArgs
  compile?: Omit<CompileArgs, 'specDigest'>
  advanceToReady?: boolean
}

export async function coordinateSuperAppBuild(client: ConvexReactClient, input: SuperAppBuildInput) {
  const blockers: string[] = []
  if (!input.intake.requestKey.trim() || !input.intake.specKey.trim()) blockers.push('Request and specification keys are required.')
  if (!input.intake.title.trim() || !input.intake.description.trim()) blockers.push('Title and description are required.')
  if (!input.intake.requirements.length || input.intake.requirements.some(item => !item.trim())) blockers.push('Requirements must be non-empty and individually populated.')
  if (blockers.length) return { status: 'blocked' as const, blockers, intake: null, scaffold: null, lane: null }

  // Intake is the first durable operation. The backend enforces operator identity,
  // immutable spec keys, and D17/D19 JSON validation independently.
  const intake = await client.mutation(api.scopeEFunctions.intakeAppBuilderSpec, input.intake)
  if (!/^[a-f0-9]{64}$/i.test(intake.specDigest)) {
    return { status: 'blocked' as const, blockers: ['Server returned an invalid specification digest.'], intake, scaffold: null, lane: null }
  }
  const compileArgs: CompileArgs = {
    title: input.compile?.title ?? input.intake.title,
    description: input.compile?.description ?? input.intake.description,
    requirements: input.compile?.requirements ?? input.intake.requirements,
    specDigest: intake.specDigest,
  }
  if (!compileArgs.requirements.length || compileArgs.requirements.some(item => !item.trim())) {
    return { status: 'blocked' as const, blockers: ['Scaffold requirements failed precondition validation.'], intake, scaffold: null, lane: null }
  }
  const scaffold = await client.action(api.scopeEFunctions.compileAppScaffold, compileArgs)
  if (!scaffold.files.length || !/^[a-f0-9]{64}$/i.test(scaffold.scaffoldDigest)) {
    return { status: 'blocked' as const, blockers: ['Scaffold is empty or its digest is invalid; lane was not advanced.'], intake, scaffold, lane: null }
  }
  const scaffoldTransition: TransitionArgs = {
    specKey: input.intake.specKey,
    nextLane: 'Scaffolded',
    scaffoldFiles: scaffold.files,
    scaffoldDigest: scaffold.scaffoldDigest,
  }
  let lane = await client.mutation(api.scopeEFunctions.transitionBuildLane, scaffoldTransition)
  if (input.advanceToReady) {
    lane = await client.mutation(api.scopeEFunctions.transitionBuildLane, {
      specKey: input.intake.specKey,
      nextLane: 'Ready to Synthesize',
    })
  }
  return { status: 'completed' as const, blockers, intake, scaffold, lane }
}
