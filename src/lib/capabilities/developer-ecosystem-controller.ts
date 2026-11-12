import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type TokenArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.generateScopedApiTokenDraft>;
type SimulateArgs = FunctionArgs<typeof api.scopeCFunctions.simulateIntegrationEventTrigger>;
type WebhookArgs = FunctionArgs<typeof api.scopeCFunctions.persistWebhookEndpoint>;
type ListenerArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.updateListenerStatus>;

export async function coordinateDeveloperIntegrationLifecycle(
  client: ConvexReactClient,
  input: {
    token: TokenArgs;
    simulation: SimulateArgs;
    webhook: WebhookArgs;
    listener?: ListenerArgs;
  },
) {
  if (input.webhook.status === "enabled" && !input.webhook.signingSecretConfigured) {
    return { tokenDraft: null, simulation: null, webhook: null, listener: null, enabled: false, blockers: ["Webhook cannot be enabled without a configured signing secret."] };
  }

  const tokenDraft = await client.mutation(api.scopeBFunctionsBatchTwo.generateScopedApiTokenDraft, input.token);
  const simulation = await client.action(api.scopeCFunctions.simulateIntegrationEventTrigger, input.simulation);

  if (!simulation.valid || simulation.sideEffectsPerformed) {
    return { tokenDraft, simulation, webhook: null, listener: null, enabled: false, blockers: [...simulation.issues, ...(simulation.sideEffectsPerformed ? ["Simulation unexpectedly reports side effects; fail closed."] : [])] };
  }

  const webhook = await client.mutation(api.scopeCFunctions.persistWebhookEndpoint, input.webhook);
  const listener = input.listener
    ? await client.mutation(api.scopeBFunctionsBatchTwo.updateListenerStatus, input.listener)
    : null;

  return { tokenDraft, simulation, webhook, listener, enabled: input.webhook.status === "enabled", blockers: [] as string[] };
}
