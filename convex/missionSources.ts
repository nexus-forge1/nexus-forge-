import { v } from 'convex/values'
import { query, internalMutation } from './_generated/server'
import { requireOwnedMission } from './permissions'

function sourcePath(source: { category: string; source: string; value: string }) {
  const category = source.category
  if (category === 'intent-specification') return '/orchestrator'
  if (category === 'manifest-blueprint') return '/manifest'
  if (category === 'learning-lesson' && source.source === 'operator-reviewed-manifest-learning') {
    try { const value = JSON.parse(source.value); if (value.reviewStatus === 'operator-reviewed' && typeof value.lesson === 'string' && typeof value.applicability === 'string' && Array.isArray(value.evidenceReferences) && value.evidenceReferences.length >= 2) return '/learning' } catch { /* Not a reviewed lesson. */ }
  }
  return null
}

export const attach = internalMutation({
  args: { missionId: v.id('missions'), sourceMemoryId: v.id('memories') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const mission = await ctx.db.get(args.missionId)
    const source = await ctx.db.get(args.sourceMemoryId)
    const path = source && sourcePath(source)
    if (!mission || !source || source.ownerKey !== mission.ownerKey || !path) throw new Error('Mission source not found or access denied')
    await ctx.db.insert('memories', { missionId: mission._id, ownerKey: mission.ownerKey, category: 'mission-source', key: 'source:' + source._id, value: JSON.stringify({ sourceMemoryId: source._id }), confidence: 1, source: 'mission-source-link' })
    return null
  },
})

export const list = query({
  args: { missionId: v.id('missions') },
  returns: v.array(v.object({ sourceMemoryId: v.id('memories'), path: v.string(), key: v.string() })),
  handler: async (ctx, args) => {
    const mission = await requireOwnedMission(ctx, args.missionId)
    const links = await ctx.db.query('memories').withIndex('by_owner_mission_category', q => q.eq('ownerKey', mission.ownerKey).eq('missionId', args.missionId).eq('category', 'mission-source')).take(20)
    const result: { sourceMemoryId: typeof links[number]['_id']; path: string; key: string }[] = []
    for (const link of links) {
      try {
        const value = JSON.parse(link.value)
        const id = ctx.db.normalizeId('memories', value.sourceMemoryId)
        if (!id) continue
        const source = await ctx.db.get(id)
        const path = source && sourcePath(source)
        if (source && source.ownerKey === mission.ownerKey && path) result.push({ sourceMemoryId: source._id, path, key: source.key })
      } catch { /* Ignore malformed historical links. */ }
    }
    return result
  },
})
