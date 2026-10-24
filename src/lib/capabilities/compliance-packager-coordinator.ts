import type { ConvexReactClient } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '../scope-e-api'

type EvidenceArgs = FunctionArgs<typeof api.scopeEFunctions.aggregateComplianceEvidence>
type SealArgs = FunctionArgs<typeof api.scopeEFunctions.recordComplianceDossierSeal>
type ExportArgs = FunctionArgs<typeof api.scopeEFunctions.generateComplianceExportBundle>

export type CompliancePackagerInput = {
  missionKey: EvidenceArgs['missionKey']
  requestKey: SealArgs['requestKey']
  dossierKey: SealArgs['dossierKey']
  provenance: Record<string, unknown>
  generateExport?: boolean
}

export async function coordinateCompliancePackager(client: ConvexReactClient, input: CompliancePackagerInput) {
  const blockers: string[] = []
  if (!input.missionKey.trim() || !input.requestKey.trim() || !input.dossierKey.trim()) blockers.push('Mission, request, and dossier keys are required.')
  if (!input.provenance || typeof input.provenance !== 'object' || Array.isArray(input.provenance)) blockers.push('Provenance must be a JSON object.')
  if (blockers.length) return { status: 'blocked' as const, blockers, evidence: null, seal: null, bundle: null }

  const evidence = await client.query(api.scopeEFunctions.aggregateComplianceEvidence, { missionKey: input.missionKey })
  if (!/^[a-f0-9]{64}$/i.test(evidence.evidenceDigest)) {
    return { status: 'blocked' as const, blockers: ['Evidence aggregation did not return a valid SHA-256 digest.'], evidence, seal: null, bundle: null }
  }
  const evidenceCount = evidence.verificationSeals.length + evidence.auditReceipts.length + evidence.auditLogs.length + evidence.verifiedOutcomes.length
  const payload = { schema: 'nexus-forge-compliance-dossier-v1', missionKey: input.missionKey, dossierKey: input.dossierKey, evidenceDigest: evidence.evidenceDigest, evidence }
  const sealArgs: SealArgs = {
    requestKey: input.requestKey,
    missionKey: input.missionKey,
    dossierKey: input.dossierKey,
    payloadJson: JSON.stringify(payload),
    evidenceCount,
    riskCount: evidence.riskRegister.length,
    provenanceJson: JSON.stringify(input.provenance),
  }
  const seal = await client.mutation(api.scopeEFunctions.recordComplianceDossierSeal, sealArgs)
  if (!input.generateExport) return { status: 'completed' as const, blockers, evidence, seal, bundle: null }

  const exportArgs: ExportArgs = {
    missionKey: input.missionKey,
    dossierKey: input.dossierKey,
    manifest: JSON.stringify({ schema: 'nexus-forge-compliance-manifest-v1', missionKey: input.missionKey, dossierKey: input.dossierKey, evidenceDigest: evidence.evidenceDigest, generatedBy: 'NEXUS FORGE operator' }),
    provenanceJson: JSON.stringify(input.provenance),
  }
  const bundle = await client.action(api.scopeEFunctions.generateComplianceExportBundle, exportArgs)
  if (!/^[a-f0-9]{64}$/i.test(bundle.bundleDigest) || !bundle.bundleJson.trim()) {
    return { status: 'blocked' as const, blockers: ['Export bundle is empty or its SHA-256 digest is invalid.'], evidence, seal, bundle: null }
  }
  return { status: 'completed' as const, blockers, evidence, seal, bundle }
}
