import {defineTable} from 'convex/server'
import {v} from 'convex/values'
export const issueEntry=v.object({note:v.string(),createdAt:v.number(),resolved:v.boolean()})
export const businessTables={
 demandHypotheses:defineTable({ownerKey:v.string(),segment:v.string(),hypothesis:v.string(),evidence:v.array(v.string()),status:v.union(v.literal('proposed'),v.literal('validated'),v.literal('rejected')),decision:v.union(v.literal('pending'),v.literal('go'),v.literal('no-go')),decisionNote:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 monetizationQuotes:defineTable({ownerKey:v.string(),label:v.string(),scope:v.string(),priceUsd:v.number(),entitlement:v.string(),status:v.union(v.literal('draft'),v.literal('quoted'),v.literal('accepted'),v.literal('held'),v.literal('settled'),v.literal('refunded')),holdReason:v.string(),settlement:v.union(v.literal('unsettled'),v.literal('settled'),v.literal('refunded')),settlementNote:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 customerRecords:defineTable({ownerKey:v.string(),name:v.string(),stage:v.union(v.literal('onboarding'),v.literal('active'),v.literal('support'),v.literal('cancelled')),issues:v.array(issueEntry),createdAt:v.number()}).index('by_owner',['ownerKey']),
 growthCampaigns:defineTable({ownerKey:v.string(),audience:v.string(),offer:v.string(),channels:v.array(v.string()),status:v.union(v.literal('draft'),v.literal('review'),v.literal('published'),v.literal('measured')),reviewNote:v.string(),measurement:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 readinessSections:defineTable({ownerKey:v.string(),product:v.string(),section:v.union(v.literal('payments'),v.literal('operations'),v.literal('economics'),v.literal('privacy'),v.literal('ownership')),evidence:v.string(),status:v.union(v.literal('open'),v.literal('evidence-linked')),createdAt:v.number(),updatedAt:v.number()}).index('by_owner_product',['ownerKey','product']),
}
export const readinessSections=['payments','operations','economics','privacy','ownership'] as const
export type ReadinessSection=typeof readinessSections[number]
