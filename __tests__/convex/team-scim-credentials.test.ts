// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api, internal } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')

describe('team-scoped SCIM credentials', () => {
  it('requires team-admin authority to inspect, create, rotate and revoke credentials', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: 'scim-owner' })
    const stranger = t.withIdentity({ subject: 'scim-stranger' })
    const teamId = await owner.mutation(api.forgeTeams.create, { name: 'SCIM credential tests' })

    await expect(stranger.query(api.teamScim.status, { teamId })).rejects.toThrow(/admin/)
    await expect(stranger.action(api.teamScim.createOrRotate, { teamId })).rejects.toThrow(/admin/)

    const first = await owner.action(api.teamScim.createOrRotate, { teamId })
    expect(first.token).toMatch(/^nxf_scim_[a-f0-9]{64}$/)
    expect(first.generation).toBe(1)
    expect(await owner.query(api.teamScim.status, { teamId })).toMatchObject({ configured: true, generation: 1 })
    const stored = await t.run(ctx => ctx.db.query('teamScimCredentials').withIndex('by_team', q => q.eq('teamId', teamId)).unique())
    expect(stored?.tokenHash).not.toBe(first.token)
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/)

    const second = await owner.action(api.teamScim.createOrRotate, { teamId })
    expect(second.token).not.toBe(first.token)
    expect(second.generation).toBe(2)
    expect(await owner.query(api.teamScim.status, { teamId })).toMatchObject({ configured: true, generation: 2 })

    await expect(stranger.mutation(api.teamScim.revoke, { teamId })).rejects.toThrow(/admin/)
    expect(await owner.mutation(api.teamScim.revoke, { teamId })).toEqual({ revoked: true })
    expect(await owner.query(api.teamScim.status, { teamId })).toMatchObject({ configured: false, generation: 3 })
    expect(await owner.mutation(api.teamScim.revoke, { teamId })).toEqual({ revoked: false })
  })

  it('enforces the 20-entry SCIM directory quota', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: 'scim-quota-owner' })
    const teamId = await owner.mutation(api.forgeTeams.create, { name: 'SCIM quota team' })
    const { token } = await owner.action(api.teamScim.createOrRotate, { teamId })
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')

    await t.run(async ctx => {
      for (let i = 0; i < 20; i++) {
        await ctx.db.insert('teamDirectory', {
          teamId,
          email: `quota-${i}@example.com`,
          role: 'viewer',
          status: 'active',
          createdBy: 'test',
          updatedAt: Date.now(),
        })
      }
    })

    await expect(t.mutation(internal.teamScim.mutateScimUser, {
      tokenHash, email: 'over-quota@example.com', active: true, role: 'viewer',
    })).rejects.toThrow(/quota reached/)
  })

  it('refuses to deactivate the team owner through SCIM', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: 'scim-protected-owner' })
    const teamId = await owner.mutation(api.forgeTeams.create, { name: 'SCIM owner protection team' })
    const { token } = await owner.action(api.teamScim.createOrRotate, { teamId })
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
    await t.run(async ctx => {
      await ctx.db.insert('teamDirectory', {
        teamId,
        email: 'owner@example.com',
        operatorId: 'scim-protected-owner',
        role: 'contributor',
        status: 'active',
        createdBy: 'test',
        updatedAt: Date.now(),
      })
    })

    await expect(t.mutation(internal.teamScim.mutateScimUser, {
      tokenHash, email: 'owner@example.com', active: false, role: 'viewer',
    })).rejects.toThrow(/cannot deactivate the team owner/)
    const grant = await t.run(ctx => ctx.db.query('teamDirectory').withIndex('by_team_email', q => q.eq('teamId', teamId).eq('email', 'owner@example.com')).unique())
    expect(grant?.status).toBe('active')
  })

  it('enforces the team membership quota for SCIM provisioning', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: 'scim-membership-quota-owner' })
    const teamId = await owner.mutation(api.forgeTeams.create, { name: 'SCIM membership quota team' })
    const { token } = await owner.action(api.teamScim.createOrRotate, { teamId })
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
    const operatorIds = await t.run(async ctx => {
      const ids: string[] = []
      for (let i = 0; i < 21; i++) {
        ids.push(await ctx.db.insert('users', { email: `membership-quota-${i}@example.com`, emailVerificationTime: 10 }))
      }
      for (let i = 0; i < 20; i++) {
        await ctx.db.insert('forgeMemberships', { teamId, operatorId: ids[i], role: 'viewer', status: 'active', createdAt: Date.now() })
      }
      return ids
    })
    await t.run(ctx => ctx.db.insert('teamDirectory', {
      teamId,
      email: 'membership-quota-20@example.com',
      role: 'viewer',
      status: 'active',
      createdBy: 'test',
      updatedAt: Date.now(),
    }))

    await expect(t.mutation(internal.teamScim.mutateScimUser, {
      tokenHash, email: 'membership-quota-20@example.com', active: true, role: 'viewer',
    })).rejects.toThrow(/membership quota reached/)
    expect(operatorIds).toHaveLength(21)
  })

  it('enforces the per-operator membership quota for SCIM provisioning', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: 'scim-operator-quota-owner' })
    const teamId = await owner.mutation(api.forgeTeams.create, { name: 'SCIM operator quota target' })
    const { token } = await owner.action(api.teamScim.createOrRotate, { teamId })
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
    const userId = await t.run(ctx => ctx.db.insert('users', { email: 'operator-over-quota@example.com', emailVerificationTime: 10 }))

    await t.run(async ctx => {
      for (let i = 0; i < 20; i++) {
        const otherTeamId = await ctx.db.insert('forgeTeams', {
          ownerKey: 'operator-quota-team-' + i,
          name: 'Operator quota team ' + i,
          createdAt: Date.now(),
        })
        await ctx.db.insert('forgeMemberships', {
          teamId: otherTeamId,
          operatorId: userId,
          role: 'viewer',
          status: 'active',
          createdAt: Date.now(),
        })
      }
      await ctx.db.insert('teamDirectory', {
        teamId,
        email: 'operator-over-quota@example.com',
        role: 'viewer',
        status: 'active',
        createdBy: 'test',
        updatedAt: Date.now(),
      })
    })

    await expect(t.mutation(internal.teamScim.mutateScimUser, {
      tokenHash, email: 'operator-over-quota@example.com', active: true, role: 'viewer',
    })).rejects.toThrow(/membership quota reached/)
    const targetMembership = await t.run(ctx => ctx.db.query('forgeMemberships').withIndex('by_team_operator', q => q.eq('teamId', teamId).eq('operatorId', userId)).unique())
    expect(targetMembership).toBeNull()
  })

  it('requires explicit admin review before reactivating a revoked directory entry', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: 'scim-reactivation-owner' })
    const teamId = await owner.mutation(api.forgeTeams.create, { name: 'SCIM reactivation team' })
    const { token } = await owner.action(api.teamScim.createOrRotate, { teamId })
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
    await t.run(ctx => ctx.db.insert('teamDirectory', {
      teamId,
      email: 'previously-revoked@example.com',
      role: 'contributor',
      status: 'revoked',
      createdBy: 'test',
      updatedAt: Date.now(),
    }))

    await expect(t.mutation(internal.teamScim.mutateScimUser, {
      tokenHash,
      email: 'previously-revoked@example.com',
      active: true,
      role: 'viewer',
    })).rejects.toThrow(/explicit admin review/)
    const grant = await t.run(ctx => ctx.db.query('teamDirectory').withIndex('by_team_email', q => q.eq('teamId', teamId).eq('email', 'previously-revoked@example.com')).unique())
    expect(grant?.status).toBe('revoked')
    expect(grant?.role).toBe('contributor')
  })

  it('provisions only into the credential team and deactivates the linked membership', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: 'scim-lifecycle-owner' })
    const teamId = await owner.mutation(api.forgeTeams.create, { name: 'SCIM lifecycle team' })
    const { token } = await owner.action(api.teamScim.createOrRotate, { teamId })
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('')
    const userId = await t.run(ctx => ctx.db.insert('users', { email: 'provisioned@example.com', emailVerificationTime: 10 }))

    const created = await t.mutation(internal.teamScim.mutateScimUser, { tokenHash, email: 'provisioned@example.com', active: true, role: 'contributor' })
    expect(created).toMatchObject({ userName: 'provisioned@example.com', active: true, role: 'contributor' })
    expect((await t.withIdentity({ subject: userId }).query(api.forgeTeams.detail, { teamId })).role).toBe('contributor')

    const deactivated = await t.mutation(internal.teamScim.mutateScimUser, { tokenHash, email: 'provisioned@example.com', active: false })
    expect(deactivated).toMatchObject({ userName: 'provisioned@example.com', active: false })
    await expect(t.withIdentity({ subject: userId }).query(api.forgeTeams.detail, { teamId })).rejects.toThrow(/permission denied/)
    const revoked = await t.run(ctx => ctx.db.query('forgeMemberships').withIndex('by_team_operator', q => q.eq('teamId', teamId).eq('operatorId', userId)).unique())
    expect(revoked?.status).toBe('revoked')

    const inactive = await t.mutation(internal.teamScim.mutateScimUser, { tokenHash, email: 'future-user@example.com', active: false, role: 'viewer' })
    expect(inactive).toMatchObject({ userName: 'future-user@example.com', active: false, role: 'viewer' })
    const inactiveGrant = await t.run(ctx => ctx.db.query('teamDirectory').withIndex('by_team_email', q => q.eq('teamId', teamId).eq('email', 'future-user@example.com')).unique())
    expect(inactiveGrant?.status).toBe('revoked')

    await owner.mutation(api.teamScim.revoke, { teamId })
    await expect(t.mutation(internal.teamScim.mutateScimUser, { tokenHash, email: 'another@example.com', active: true })).rejects.toThrow(/authorization denied/)
  })
})
