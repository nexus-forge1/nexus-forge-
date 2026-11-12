import { v, ConvexError } from 'convex/values'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { api } from './_generated/api'
import { admin, directoryIdentity, email } from './teamProvisioning'
import { audit } from './frontierSupport'

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return 'nxf_scim_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export const authorizeToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const credential = await ctx.db.query('teamScimCredentials').withIndex('by_token_hash', q => q.eq('tokenHash', args.tokenHash)).unique()
    if (!credential?.active || !(await ctx.db.get(credential.teamId))) return null
    return { teamId: credential.teamId, generation: credential.generation }
  },
})

export const listScimUsers = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const credential = await ctx.db.query('teamScimCredentials').withIndex('by_token_hash', q => q.eq('tokenHash', args.tokenHash)).unique()
    if (!credential?.active || !(await ctx.db.get(credential.teamId))) throw new ConvexError('SCIM authorization denied')
    await ctx.db.patch(credential._id, { lastUsedAt: Date.now() })
    return (await ctx.db.query('teamDirectory').withIndex('by_team', q => q.eq('teamId', credential.teamId)).take(20)).map(g => ({ id: g._id, userName: g.email, active: g.status === 'active', role: g.role, updatedAt: g.updatedAt }))
  },
})

export const mutateScimUser = internalMutation({
  args: { tokenHash: v.string(), email: v.string(), active: v.boolean(), role: v.optional(v.union(v.literal('viewer'), v.literal('contributor'))) },
  handler: async (ctx, args) => {
    const credential = await ctx.db.query('teamScimCredentials').withIndex('by_token_hash', q => q.eq('tokenHash', args.tokenHash)).unique()
    if (!credential?.active || !(await ctx.db.get(credential.teamId))) throw new ConvexError('SCIM authorization denied')
    const normalized = email(args.email)
    const existing = await ctx.db.query('teamDirectory').withIndex('by_team_email', q => q.eq('teamId', credential.teamId).eq('email', normalized)).unique()
    if (!args.active) {
      if (!existing) { const grants = await ctx.db.query('teamDirectory').withIndex('by_team', q => q.eq('teamId', credential.teamId)).take(20); if (grants.length >= 20) throw new ConvexError('SCIM team directory quota reached'); const id = await ctx.db.insert('teamDirectory', { teamId: credential.teamId, email: normalized, role: args.role ?? 'viewer', status: 'revoked', createdBy: 'scim:' + String(credential.teamId), updatedAt: Date.now() }); await ctx.db.patch(credential._id, { lastUsedAt: Date.now() }); await audit(ctx, 'scim:' + String(credential.teamId), 'teams', 'scim-user-created-inactive', JSON.stringify({ email: normalized })); return { id, userName: normalized, active: false, role: args.role ?? 'viewer' } }
      if (existing.status === 'revoked') return { id: existing._id, userName: normalized, active: false, role: existing.role }
      const team = await ctx.db.get(credential.teamId)
      if (existing.operatorId && team?.ownerKey === existing.operatorId) throw new ConvexError('SCIM cannot deactivate the team owner')
      await ctx.db.patch(existing._id, { status: 'revoked', updatedAt: Date.now() })
      if (existing.operatorId) {
        const member = await ctx.db.query('forgeMemberships').withIndex('by_team_operator', q => q.eq('teamId', credential.teamId).eq('operatorId', existing.operatorId!)).unique()
        if (member) await ctx.db.patch(member._id, { status: 'revoked' })
      }
      await ctx.db.patch(credential._id, { lastUsedAt: Date.now() })
      await audit(ctx, 'scim:' + String(credential.teamId), 'teams', 'scim-user-deactivated', JSON.stringify({ email: normalized }))
      return { id: existing._id, userName: normalized, active: false }
    }
    const role = args.role ?? existing?.role ?? 'viewer'
    if (existing) {
      if (existing.status === 'revoked') throw new ConvexError('Previously revoked member requires explicit admin review')
      await ctx.db.patch(existing._id, { role, status: 'active', updatedAt: Date.now() })
    } else {
      const grants = await ctx.db.query('teamDirectory').withIndex('by_team', q => q.eq('teamId', credential.teamId)).take(20)
      if (grants.length >= 20) throw new ConvexError('SCIM team directory quota reached')
      await ctx.db.insert('teamDirectory', { teamId: credential.teamId, email: normalized, role, status: 'active', createdBy: 'scim:' + String(credential.teamId), updatedAt: Date.now() })
    }
    const verified = await directoryIdentity(ctx, normalized)
    if (verified) {
      const grant = await ctx.db.query('teamDirectory').withIndex('by_team_email', q => q.eq('teamId', credential.teamId).eq('email', normalized)).unique()
      const member = await ctx.db.query('forgeMemberships').withIndex('by_team_operator', q => q.eq('teamId', credential.teamId).eq('operatorId', verified._id)).unique()
      if (member?.status === 'revoked') throw new ConvexError('Previously revoked member requires explicit admin review')
      if (member) await ctx.db.patch(member._id, { role, status: 'active' })
      else {
        if ((await ctx.db.query('forgeMemberships').withIndex('by_team', q => q.eq('teamId', credential.teamId)).take(20)).length >= 20 || (await ctx.db.query('forgeMemberships').withIndex('by_operator', q => q.eq('operatorId', verified._id)).take(20)).length >= 20) throw new ConvexError('SCIM membership quota reached')
        await ctx.db.insert('forgeMemberships', { teamId: credential.teamId, operatorId: verified._id, role, status: 'active', createdAt: Date.now() })
      }
      if (grant) await ctx.db.patch(grant._id, { operatorId: verified._id, role, status: 'active', updatedAt: Date.now() })
    }
    await ctx.db.patch(credential._id, { lastUsedAt: Date.now() })
    await audit(ctx, 'scim:' + String(credential.teamId), 'teams', existing ? 'scim-user-updated' : 'scim-user-created', JSON.stringify({ email: normalized, role, verified: Boolean(verified) }))
    const grant = await ctx.db.query('teamDirectory').withIndex('by_team_email', q => q.eq('teamId', credential.teamId).eq('email', normalized)).unique()
    return { id: grant?._id ?? null, userName: normalized, active: true, role }
  },
})

export const status = query({
  args: { teamId: v.id('forgeTeams') },
  handler: async (ctx, args) => {
    await admin(ctx, args.teamId)
    const credential = await ctx.db.query('teamScimCredentials').withIndex('by_team', q => q.eq('teamId', args.teamId)).unique()
    return credential ? {
      configured: credential.active,
      generation: credential.generation,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      lastUsedAt: credential.lastUsedAt,
    } : { configured: false, generation: 0, createdAt: null, updatedAt: null, lastUsedAt: null }
  },
})

export const install = mutation({
  args: { teamId: v.id('forgeTeams'), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const { operatorId } = await admin(ctx, args.teamId)
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) throw new ConvexError('Invalid SCIM credential digest')
    const now = Date.now()
    const old = await ctx.db.query('teamScimCredentials').withIndex('by_team', q => q.eq('teamId', args.teamId)).unique()
    const generation = (old?.generation ?? 0) + 1
    if (old) await ctx.db.patch(old._id, { tokenHash: args.tokenHash, generation, active: true, createdBy: operatorId, updatedAt: now })
    else await ctx.db.insert('teamScimCredentials', { teamId: args.teamId, tokenHash: args.tokenHash, generation, active: true, createdBy: operatorId, createdAt: now, updatedAt: now })
    await audit(ctx, operatorId, 'teams', old ? 'scim-token-rotated' : 'scim-token-created', JSON.stringify({ teamId: args.teamId, generation }))
    return { generation }
  },
})

export const createOrRotate = action({
  args: { teamId: v.id('forgeTeams') },
  handler: async (ctx, args): Promise<{ token: string; generation: number }> => {
    const token = newToken()
    const result = await ctx.runMutation(api.teamScim.install, { teamId: args.teamId, tokenHash: await digest(token) })
    return { token, generation: result.generation }
  },
})

export const revoke = mutation({
  args: { teamId: v.id('forgeTeams') },
  handler: async (ctx, args) => {
    const { operatorId } = await admin(ctx, args.teamId)
    const credential = await ctx.db.query('teamScimCredentials').withIndex('by_team', q => q.eq('teamId', args.teamId)).unique()
    if (!credential || !credential.active) return { revoked: false }
    await ctx.db.patch(credential._id, { active: false, generation: credential.generation + 1, updatedAt: Date.now() })
    await audit(ctx, operatorId, 'teams', 'scim-token-revoked', JSON.stringify({ teamId: args.teamId, generation: credential.generation + 1 }))
    return { revoked: true }
  },
})
