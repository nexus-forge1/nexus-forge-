// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')

async function setup() {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ subject: 'scim-http-owner' })
  const teamId = await owner.mutation(api.forgeTeams.create, { name: 'SCIM HTTP contract team' })
  const credential = await owner.action(api.teamScim.createOrRotate, { teamId })
  await t.run(ctx => ctx.db.insert('users', {
    email: 'http-provisioned@example.com',
    emailVerificationTime: 10,
  }))
  const headers = {
    Authorization: `Bearer ${credential.token}`,
    'Content-Type': 'application/scim+json',
  }
  return { t, owner, teamId, credential, headers }
}

describe('SCIM HTTP endpoints', () => {
  it('rejects invalid tokens and supports create, list, pathless PATCH and deprovision', async () => {
    const { t, headers } = await setup()

    const unauthorized = await t.fetch('/scim/v2/Users', { headers: { Authorization: 'Bearer invalid' } })
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.headers.get('cache-control')).toBe('no-store')

    const createdResponse = await t.fetch('/scim/v2/Users', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'http-provisioned@example.com',
        active: true,
        roles: [{ value: 'contributor' }],
      }),
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json()
    expect(created).toMatchObject({ userName: 'http-provisioned@example.com', active: true, roles: [{ value: 'contributor' }] })
    expect(created.id).toBeTruthy()

    const listResponse = await t.fetch('/scim/v2/Users', { headers })
    expect(listResponse.status).toBe(200)
    const list = await listResponse.json()
    expect(list).toMatchObject({ totalResults: 1, itemsPerPage: 1 })
    expect(list.Resources[0]).toMatchObject({ id: created.id, userName: 'http-provisioned@example.com', active: true })

    const patchResponse = await t.fetch(`/scim/v2/Users/${created.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'replace', value: { active: true, roles: [{ value: 'viewer' }] } }],
      }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ id: created.id, active: true, roles: [{ value: 'viewer' }] })

    const deleteResponse = await t.fetch(`/scim/v2/Users/${created.id}`, { method: 'DELETE', headers })
    expect(deleteResponse.status).toBe(204)

    const detailResponse = await t.fetch(`/scim/v2/Users/${created.id}`, { headers })
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toMatchObject({ id: created.id, active: false })
  })

  it('rejects unsupported PATCH values and invalid SCIM roles', async () => {
    const { t, headers } = await setup()
    const badRole = await t.fetch('/scim/v2/Users', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userName: 'http-provisioned@example.com', roles: [{ value: 'admin' }] }),
    })
    expect(badRole.status).toBe(400)

    const createdResponse = await t.fetch('/scim/v2/Users', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userName: 'http-provisioned@example.com', active: true }),
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json()

    const invalidPatch = await t.fetch(`/scim/v2/Users/${created.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ Operations: [{ op: 'replace', value: { active: true, isAdmin: true } }] }),
    })
    expect(invalidPatch.status).toBe(400)
  })

  it('supports explicit-path PATCH and returns SCIM 404 for missing users', async () => {
    const { t, headers } = await setup()
    const createdResponse = await t.fetch('/scim/v2/Users', {
      method: 'POST', headers,
      body: JSON.stringify({ userName: 'http-provisioned@example.com', active: true }),
    })
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json()

    const patchResponse = await t.fetch(`/scim/v2/Users/${created.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ Operations: [{ op: 'replace', path: 'active', value: false }] }),
    })
    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toMatchObject({ id: created.id, active: false })

    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const response = await t.fetch('/scim/v2/Users/nonexistent-user-id', {
        method, headers,
        ...(method === 'PATCH' ? { body: JSON.stringify({ Operations: [{ op: 'replace', path: 'active', value: true }] }) } : {}),
      })
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('application/scim+json')
      expect(await response.json()).toMatchObject({ status: '404' })
    }
  })

  it('applies SCIM pagination and bounds oversized page counts to the available directory', async () => {
    const { t, headers } = await setup()
    const createdResponse = await t.fetch('/scim/v2/Users', {
      method: 'POST', headers,
      body: JSON.stringify({ userName: 'http-provisioned@example.com', active: true }),
    })
    expect(createdResponse.status).toBe(201)

    const page = await t.fetch('/scim/v2/Users?startIndex=2&count=1', { headers })
    expect(page.status).toBe(200)
    expect(await page.json()).toMatchObject({ totalResults: 1, startIndex: 2, itemsPerPage: 0, Resources: [] })

    const oversized = await t.fetch('/scim/v2/Users?startIndex=1&count=999999', { headers })
    expect(oversized.status).toBe(200)
    expect(await oversized.json()).toMatchObject({ totalResults: 1, startIndex: 1, itemsPerPage: 1 })
  })

  it('invalidates the old bearer token after credential rotation', async () => {
    const { t, owner, teamId, headers } = await setup()
    await owner.action(api.teamScim.createOrRotate, { teamId })
    const response = await t.fetch('/scim/v2/Users', { headers })
    expect(response.status).toBe(401)
  })
})
