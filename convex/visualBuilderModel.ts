import {defineTable} from 'convex/server'
import {v} from 'convex/values'
import {bounded} from './studioModel'
import type {VisualConfig} from '../src/lib/visual-task-contract'
export const visualConfig=v.object({heading:v.string(),buttonLabel:v.string(),headingSize:v.union(v.literal('small'),v.literal('standard'),v.literal('large')),buttonStyle:v.union(v.literal('primary'),v.literal('secondary')),density:v.union(v.literal('compact'),v.literal('comfortable'),v.literal('roomy')),width:v.union(v.literal('narrow'),v.literal('standard'),v.literal('wide')),columns:v.union(v.literal('single'),v.literal('two-desktop'))})
export const visualBuilderTables={
 visualRevisions:defineTable({ownerKey:v.string(),featureId:v.id('featurePackages'),requestKey:v.string(),revision:v.number(),parentRevision:v.number(),sourceDigest:v.string(),config:visualConfig,operation:v.union(v.literal('edit'),v.literal('restore')),restoredFrom:v.optional(v.id('visualRevisions')),packageSnapshot:v.string(),packageDigest:v.string(),diff:v.string(),createdAt:v.number()}).index('by_feature',['featureId']),
 visualArtifactReceipts:defineTable({ownerKey:v.string(),visualId:v.id('visualRevisions'),artifactId:v.id('artifacts'),packageDigest:v.string(),createdAt:v.number()}).index('by_visual',['visualId']),
}
export function normalizeVisual(c:VisualConfig):VisualConfig{return{...c,heading:bounded(c.heading,'Heading',160),buttonLabel:bounded(c.buttonLabel,'Button label',80)}}
