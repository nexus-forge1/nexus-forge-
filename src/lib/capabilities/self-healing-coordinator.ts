import type { ConvexReactClient } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '../scope-e-api'

type IngestArgs = FunctionArgs<typeof api.scopeEFunctions.ingestDiagnosticTrace>
type ProposalArgs = FunctionArgs<typeof api.scopeEFunctions.proposeSelfRepairPatch>
type ReceiptArgs = FunctionArgs<typeof api.scopeEFunctions.recordRepairSandboxReceipt>

export type SelfHealingInput = {
  trace: IngestArgs
  proposal: Omit<ProposalArgs, 'incidentKey'>
  receipt: Omit<ReceiptArgs, 'incidentKey' | 'patchFiles' | 'rollbackDigest'>
}

export async function coordinateSelfHealing(client: ConvexReactClient, input: SelfHealingInput) {
  const blockers: string[] = []
  if (!input.trace.incidentKey.trim() || !input.trace.requestKey.trim()) blockers.push('Incident and request keys are required.')
  if (!input.trace.trace.length || input.trace.trace.length > 500) blockers.push('Diagnostic trace must contain 1–500 entries.')
  if (input.proposal.maxFiles < 1 || input.proposal.maxFiles > 20) blockers.push('Patch blast-radius bound must be between 1 and 20 files.')
  if (input.proposal.patchFiles.length > input.proposal.maxFiles) blockers.push('Patch exceeds the configured blast-radius bound.')
  if (!/^[a-f0-9]{64}$/i.test(input.proposal.rollbackDigest)) blockers.push('A SHA-256 rollback digest is required.')
  if (input.receipt.sandboxPassed && input.receipt.containmentState !== 'contained') blockers.push('A passing sandbox receipt must prove containment.')
  if (blockers.length) return { status: 'blocked' as const, blockers, trace: null, proposal: null, receipt: null }

  const trace = await client.mutation(api.scopeEFunctions.ingestDiagnosticTrace, input.trace)
  const proposalArgs: ProposalArgs = { ...input.proposal, incidentKey: input.trace.incidentKey }
  const proposal = await client.query(api.scopeEFunctions.proposeSelfRepairPatch, proposalArgs)
  if (!proposal.valid || !proposal.reversible || proposal.fileCount < 1) {
    return {
      status: 'blocked' as const,
      blockers: proposal.blockers.length ? proposal.blockers : ['Repair proposal is not valid and reversible.'],
      trace,
      proposal,
      receipt: null,
    }
  }
  const receiptArgs: ReceiptArgs = {
    ...input.receipt,
    incidentKey: input.trace.incidentKey,
    patchFiles: input.proposal.patchFiles,
    rollbackDigest: input.proposal.rollbackDigest,
  }
  const receipt = await client.mutation(api.scopeEFunctions.recordRepairSandboxReceipt, receiptArgs)
  const safe = receipt.sandboxStatus === 'passed' && receipt.containmentState === 'contained'
  return {
    status: safe ? 'completed' as const : 'blocked' as const,
    blockers: safe ? [] : ['Sandbox verification or containment did not pass; repair remains blocked.'],
    trace,
    proposal,
    receipt,
  }
}
