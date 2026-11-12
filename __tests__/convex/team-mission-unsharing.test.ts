// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')

describe('team mission unsharing authorization', () => {
  it('requires current team-admin membership even when the caller owns the mission', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: 'owner' })
    const missionOwner = t.withIdentity({ subject: 'mission-owner' })
    const teamId = await owner.mutation(api.forgeTeams.create, { name: 'Admin-only unsharing' })
    const membershipId = await missionOwner.mutation(api.forgeTeams.requestJoin, { teamId })
    const missionId = await t.run(ctx => ctx.db.insert('missions', {
      ownerKey: 'mission-owner',
      title: 'Owned by contributor',
      mission: 'Shared mission permission fixture',
      autonomy: 'governed',
      budget: 0,
      status: 'draft',
      completion: 0,
      approved: true,
    }))

    await owner.mutation(api.forgeTeams.setMember, {
      teamId, membershipId, role: 'admin', status: 'active',
    })
    await missionOwner.mutation(api.forgeTeams.shareMission, {
      teamId, missionId, allowExecute: false,
    })
    await owner.mutation(api.forgeTeams.setMember, {
      teamId, membershipId, role: 'contributor', status: 'active',
    })

    await expect(missionOwner.mutation(api.forgeTeams.unshareMission, {
      teamId, missionId,
    })).rejects.toThrow(/permission denied/)

    expect((await owner.query(api.forgeTeams.sharedMissions, { teamId }))
      .map(mission => mission?.missionId)).toContain(missionId)
  })
})
