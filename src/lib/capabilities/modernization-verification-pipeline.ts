import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type ParseArgs = FunctionArgs<typeof api.scopeDFunctionsBatchOne.parseRequirementAst>;
type PersistArgs = FunctionArgs<typeof api.scopeDFunctionsBatchOne.persistSpecificationBundle>;
type RuleArgs = FunctionArgs<typeof api.scopeDFunctionsBatchOne.validateMigrationRules>;
type PlanArgs = FunctionArgs<typeof api.scopeDFunctionsBatchOne.compileModernizationPlan>;

export async function coordinateModernizationVerification(
  client: ConvexReactClient,
  input: {
    parse: ParseArgs;
    bundle: Omit<PersistArgs, "requirements"> & {
      bundleKey: PersistArgs["bundleKey"];
    };
    rules: RuleArgs;
    plan: PlanArgs;
  },
) {
  const ast = await client.action(api.scopeDFunctionsBatchOne.parseRequirementAst, input.parse);
  if (!ast.valid || ast.errors.length > 0 || ast.requirements.length === 0) {
    return { ast, migration: null, bundleId: null, planId: null, eligible: false, blockers: ast.errors.length ? ast.errors : ["Requirement AST is invalid or empty."] };
  }

  const migration = await client.query(api.scopeDFunctionsBatchOne.validateMigrationRules, input.rules);
  if (!migration.valid || migration.errors.length > 0) {
    return { ast, migration, bundleId: null, planId: null, eligible: false, blockers: migration.errors.length ? migration.errors : ["Migration rules failed validation."] };
  }
  if (input.plan.rules.length !== input.rules.rules.length ||
      input.plan.rules.some((rule, index) => {
        const validated = input.rules.rules[index];
        return !validated || rule.key !== validated.key ||
          rule.fromPattern !== validated.fromPattern ||
          rule.toPattern !== validated.toPattern ||
          rule.destructive !== validated.destructive ||
          rule.reversible !== validated.reversible;
      })) {
    return { ast, migration, bundleId: null, planId: null, eligible: false, blockers: ["Plan migration rules do not exactly match the validated rule set."] };
  }

  const requirements: PersistArgs["requirements"] = ast.requirements.map((requirement) => ({
    requirementKey: requirement.id,
    title: requirement.text,
    acceptance: requirement.acceptance,
    status: "draft",
  }));
  const bundleId = await client.mutation(api.scopeDFunctionsBatchOne.persistSpecificationBundle, {
    ...input.bundle,
    requirements,
  });
  const planId = await client.mutation(api.scopeDFunctionsBatchOne.compileModernizationPlan, input.plan);
  return { ast, migration, bundleId, planId, eligible: true, blockers: [] as string[] };
}
