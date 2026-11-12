import {defineTable} from 'convex/server'
import {v,ConvexError} from 'convex/values'
import {bounded} from './studioModel'
export const featureBuilderTables={
 featurePackages:defineTable({ownerKey:v.string(),projectId:v.id('studioProjects'),specificationId:v.id('studioSpecifications'),specificationDigest:v.string(),requestKey:v.string(),featureKey:v.string(),title:v.string(),revision:v.number(),requirementKeys:v.array(v.string()),packageSnapshot:v.string(),packageDigest:v.string(),createdAt:v.number()}).index('by_project',['projectId']),
 featurePreviewItems:defineTable({ownerKey:v.string(),featureId:v.id('featurePackages'),requestKey:v.string(),initialTitle:v.string(),title:v.string(),status:v.union(v.literal('open'),v.literal('done')),archived:v.boolean(),createdAt:v.number(),updatedAt:v.number()}).index('by_feature_owner',['featureId','ownerKey']),
 featureArtifactReceipts:defineTable({ownerKey:v.string(),featureId:v.id('featurePackages'),artifactId:v.id('artifacts'),packageDigest:v.string(),createdAt:v.number()}).index('by_feature',['featureId']),
}
export function featureKey(value:string){const key=bounded(value,'Feature key',32);if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(key)||key.length<3)throw new ConvexError('Use a 3–32 character lowercase feature key');return key}
export function taskTitle(value:string){return bounded(value,'Task title',160)}
export const featureContract={version:'private-task-pack-v1',stack:'TanStack React + Convex',actor:'authenticated owner',operations:['list own records','create keyed task','rename and set open/done','archive without deleting'],itemLimit:25,productionReady:false,targetIntegrationVerified:false,permissions:'Existing target requireOperator must return the authenticated owner identity. No permission grants are included.'} as const
