import type { ConvexReactClient } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '../scope-e-api'

type CapacityArgs = FunctionArgs<typeof api.scopeEFunctions.evaluateSwarmCapacity>
type AgentArgs = FunctionArgs<typeof api.scopeEFunctions.instantiateSwarmAgent>
type RebalanceArgs = FunctionArgs<typeof api.scopeEFunctions.rebalanceSwarmTasks>
type TaskArgs = FunctionArgs<typeof api.scopeEFunctions.registerSwarmTask>

export type SwarmOrchestrationInput = {
  capacity: CapacityArgs
  agent: AgentArgs
  tasks?: TaskArgs[]
  rebalance: RebalanceArgs
}

export async function coordinateSwarmOrchestration(client: ConvexReactClient, input: SwarmOrchestrationInput) {
  const blockers: string[] = []
  if (!input.capacity.missionKey.trim() || !input.agent.agentKey.trim()) blockers.push('Mission and agent keys are required.')
  if (input.agent.capacity < 1 || !input.agent.role.trim() || !input.agent.capabilities.length) blockers.push('Agent role, capabilities, and positive capacity are required.')
  if (input.rebalance.missionKey !== input.capacity.missionKey) blockers.push('Capacity and rebalance mission keys must match.')
  if (input.rebalance.taskKeys.some(key => !key.trim()) || new Set(input.rebalance.taskKeys).size !== input.rebalance.taskKeys.length) blockers.push('Rebalance task keys must be non-empty and unique.')
  if (input.capacity.queueDepth < 0 || !Number.isInteger(input.capacity.queueDepth) || input.capacity.bottleneckThreshold < 1 || !Number.isInteger(input.capacity.bottleneckThreshold)) blockers.push('Queue depth and bottleneck threshold are outside their allowed bounds.')
  if (input.capacity.desiredCapabilities.some(capability => !capability.trim()) || new Set(input.capacity.desiredCapabilities).size !== input.capacity.desiredCapabilities.length) blockers.push('Desired capabilities must be non-empty and unique.')
  if (input.tasks?.some(task => task.missionKey !== input.capacity.missionKey)) blockers.push('Every newly registered task must belong to the evaluated mission.')
  if (input.tasks?.some(task => !task.requestKey.trim() || !task.taskKey.trim() || !Number.isInteger(task.priority) || task.priority < 0 || task.priority > 1000 || task.requiredCapabilities.some(capability => !capability.trim()))) blockers.push('Task keys, capabilities, request keys, and priorities must satisfy registration bounds.')
  if (input.tasks && input.tasks.some(task => !input.rebalance.taskKeys.includes(task.taskKey))) blockers.push('Every newly registered task must be included in the rebalance set.')
  if (blockers.length) return { status: 'blocked' as const, blockers, capacity: null, registeredTasks: [], agent: null, rebalance: null }

  const capacity = await client.query(api.scopeEFunctions.evaluateSwarmCapacity, input.capacity)
  if (!capacity || typeof capacity !== 'object') {
    return { status: 'blocked' as const, blockers: ['Capacity evaluation returned no usable result.'], capacity: null, registeredTasks: [], agent: null, rebalance: null }
  }
  const registeredTasks: unknown[] = []
  for (const task of input.tasks ?? []) {
    registeredTasks.push(await client.mutation(api.scopeEFunctions.registerSwarmTask, task))
  }
  const agent = await client.mutation(api.scopeEFunctions.instantiateSwarmAgent, input.agent)
  const rebalance = await client.mutation(api.scopeEFunctions.rebalanceSwarmTasks, input.rebalance)
  return { status: 'completed' as const, blockers, capacity, registeredTasks, agent, rebalance }
}
