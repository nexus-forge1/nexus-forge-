import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type MembershipArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.assignWorkspaceMembership>;
type RbacArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.validateRbacRolePermission>;
type QuorumArgs = FunctionArgs<typeof api.scopeCFunctions.evaluateMultiSigQuorum>;
type AuditArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.queryScopedAuditTrail>;

export async function coordinateEnterpriseGovernance(
  client: ConvexReactClient,
  input: {
    membership: MembershipArgs;
    permission: Omit<RbacArgs, "workspaceKey" | "memberKey">;
    quorum: QuorumArgs;
    audit: AuditArgs;
  },
) {
  const membershipId = await client.mutation(api.scopeBFunctionsBatchTwo.assignWorkspaceMembership, input.membership);
  const [permission, quorum] = await Promise.all([
    client.query(api.scopeBFunctionsBatchTwo.validateRbacRolePermission, {
      workspaceKey: input.membership.workspaceKey,
      memberKey: input.membership.memberKey,
      permission: input.permission.permission,
    }),
    client.query(api.scopeCFunctions.evaluateMultiSigQuorum, input.quorum),
  ]);

  const audit = await client.query(api.scopeBFunctionsBatchTwo.queryScopedAuditTrail, {
    ...input.audit,
    workspaceKey: input.membership.workspaceKey,
    limit: Math.min(input.audit.limit ?? 50, 100),
  });

  const blockers: string[] = [];
  if (!permission.allowed) blockers.push(permission.reason || "RBAC permission denied.");
  if (!quorum.quorumMet) blockers.push("Multi-signature approval quorum has not been met.");
  return {
    membershipId,
    permission,
    quorum,
    audit,
    authorizedForRequestedOperation: permission.allowed && quorum.quorumMet,
    blockers,
  };
}
