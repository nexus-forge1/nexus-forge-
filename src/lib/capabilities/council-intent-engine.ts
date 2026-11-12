import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type IntentArgs = FunctionArgs<typeof api.scopeAFunctions.compileIntentContract>;
type AstArgs = FunctionArgs<typeof api.scopeBFunctionsBatchOne.validateStructuredAst>;

export type CouncilDispatchResult = {
  ast: Awaited<ReturnType<ConvexReactClient["query"]>>;
  artifact: unknown | null;
  consensus: unknown | null;
  dispatched: boolean;
  blockers: string[];
};

/**
 * Validates structured AST before persisting the intent contract, then requires
 * persisted council quorum before a caller-supplied provider dispatcher may run.
 * The dispatcher is injected so credentials and provider execution remain in
 * the application's existing secured action layer.
 */
export async function compileIntentAndEvaluateCouncil(
  client: ConvexReactClient,
  input: {
    ast: AstArgs;
    intent: IntentArgs;
    dispatch?: (artifact: Awaited<ReturnType<ConvexReactClient["mutation"]>>) => Promise<unknown>;
  },
) {
  const ast = await client.query(api.scopeBFunctionsBatchOne.validateStructuredAst, input.ast);
  const blockers: string[] = [];
  if (!ast.valid) {
    return { ast, artifact: null, consensus: null, dispatched: false, blockers: ast.errors };
  }

  const artifact = await client.mutation(api.scopeAFunctions.compileIntentContract, input.intent);
  const consensus = await client.query(api.scopeAFunctions.evaluateCouncilConsensus, {
    missionId: input.intent.missionId,
  });

  if (!consensus.quorumReached) blockers.push("Council quorum is not supported by sufficient persisted evidence.");
  if (consensus.consensus !== "converged") blockers.push("Council consensus has not converged.");
  if (!input.dispatch) blockers.push("No secured provider-dispatch adapter was supplied.");

  let dispatched = false;
  if (blockers.length === 0 && input.dispatch) {
    await input.dispatch(artifact);
    dispatched = true;
  }

  return { ast, artifact, consensus, dispatched, blockers };
}
