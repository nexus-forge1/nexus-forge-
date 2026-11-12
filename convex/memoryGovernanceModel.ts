import {defineTable} from 'convex/server'
import {v} from 'convex/values'
import type {Infer} from 'convex/values'
export const memoryKind=v.union(...(['mission','venture','operator-preference','evidence','procedure','failure'] as const).map(v.literal))
export const memoryStatus=v.union(v.literal('active'),v.literal('quarantined'),v.literal('archived'),v.literal('retired'),v.literal('purged'))
export const memoryScope=v.union(v.literal('mission'),v.literal('venture'),v.literal('operator'))
export const governanceInput={status:memoryStatus,kind:memoryKind,scope:memoryScope,projectId:v.optional(v.id('studioProjects')),conditions:v.string(),exceptions:v.string(),reason:v.string(),evidenceReferences:v.array(v.string()),reviewAt:v.number(),expiresAt:v.number(),contradicts:v.array(v.id('memories')),supersedes:v.optional(v.id('memories'))}
export const governanceFields={...governanceInput,ownerKey:v.string(),memoryId:v.id('memories'),revision:v.number(),sourceDigest:v.string(),createdAt:v.number()}
export const memoryGovernanceTables={memoryGovernanceReviews:defineTable(governanceFields).index('by_memory',['memoryId']).index('by_owner',['ownerKey'])}
export type GovernanceInput=Infer<typeof governanceInputValidator>
export const governanceInputValidator=v.object(governanceInput)
export function quarantineFlags(text:string){
 const flags:string[]=[]
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk_live_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}/.test(text))flags.push('credential-like content')
 if(/(?:ignore|override|bypass)\s+(?:(?:all|previous|prior|system|human|the)\s+)*(?:instructions|approval|permissions|budget|authorization)|(?:reveal|print|exfiltrate)\s+(?:secrets|credentials|api keys)/i.test(text))flags.push('instruction-boundary content')
 return flags
}
