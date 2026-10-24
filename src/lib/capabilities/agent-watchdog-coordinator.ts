import type { ConvexReactClient } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '../scope-e-api'

type HeartbeatArgs = FunctionArgs<typeof api.scopeEFunctions.recordAgentHeartbeat>
type EvaluateArgs = FunctionArgs<typeof api.scopeEFunctions.evaluateDeadManSwitch>
type RerouteArgs = FunctionArgs<typeof api.scopeEFunctions.triggerFailoverReroute>

export type AgentWatchdogInput = {
  heartbeat: HeartbeatArgs
  evaluateAt?: EvaluateArgs['at']
  rerouteIfRequired?: boolean
}

export async function coordinateAgentWatchdog(client: ConvexReactClient, input: AgentWatchdogInput) {
  const blockers: string[] = []
  if (!input.heartbeat.agentKey.trim() || !input.heartbeat.requestKey.trim()) blockers.push('Agent and request keys are required.')
  if (!Number.isFinite(input.heartbeat.pulseAt) || input.heartbeat.pulseAt <= 0) blockers.push('Heartbeat timestamp must be a positive finite value.')
  if (!Number.isFinite(input.heartbeat.currentLoad) || input.heartbeat.currentLoad < 0) blockers.push('Agent load must be non-negative and finite.')
  if (!Number.isFinite(input.heartbeat.deadManTimeoutMs) || input.heartbeat.deadManTimeoutMs < 1) blockers.push('Dead-man timeout must be positive.')
  if (input.heartbeat.status === 'offline' && input.rerouteIfRequired && !input.heartbeat.failoverTargetKey?.trim()) blockers.push('Offline-agent rerouting requires a failover target.')
  if (blockers.length) return { status: 'blocked' as const, blockers, heartbeat: null, evaluation: null, reroute: null }

  const heartbeat = await client.mutation(api.scopeEFunctions.recordAgentHeartbeat, input.heartbeat)
  const evaluateArgs: EvaluateArgs = {
    agentKey: input.heartbeat.agentKey,
    ...(input.evaluateAt === undefined ? {} : { at: input.evaluateAt }),
  }
  const evaluation = await client.query(api.scopeEFunctions.evaluateDeadManSwitch, evaluateArgs)
  const dead = Boolean(evaluation && typeof evaluation === 'object' && 'timedOut' in evaluation && evaluation.timedOut)
  if (!input.rerouteIfRequired || !dead) {
    return { status: 'completed' as const, blockers, heartbeat, evaluation, reroute: null }
  }
  const rerouteArgs: RerouteArgs = { requestKey: input.heartbeat.requestKey, agentKey: input.heartbeat.agentKey }
  const reroute = await client.mutation(api.scopeEFunctions.triggerFailoverReroute, rerouteArgs)
  return { status: 'completed' as const, blockers, heartbeat, evaluation, reroute }
}
