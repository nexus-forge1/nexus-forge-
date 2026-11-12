import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { auth } from "./auth"
import { internal } from "./_generated/api"
import {boundedText} from './boundedResponse'
import {tokenDigest} from './productTelemetry'
import type { Id } from "./_generated/dataModel"

const http = httpRouter()
auth.addHttpRoutes(http)

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } })
}

function validBody<T extends string>(value: unknown, fields: T[]): value is Record<T, string> & { summary?: string } {
  if (!value || typeof value !== "object") return false
  const body = value as Record<string, unknown>
  return fields.every(field => typeof body[field] === "string" && (body[field] as string).length > 0) &&
    (body.summary === undefined || typeof body.summary === "string")
}

function isGitHubRunUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "github.com" &&
      /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+\/?$/.test(url.pathname)
  } catch {
    return false
  }
}

function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value)
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

http.route({
  path: "/github-actions/delivery-result",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = requiredEnv("NEXUS_FORGE_DELIVERY_SECRET")
    if (request.headers.get("Authorization") !== `Bearer ${expected}`) return unauthorized()
    let body: { deliveryId?: string; conclusion?: string; runUrl?: string; commitSha?: string; summary?: string }
    try { body = JSON.parse(await boundedText(request, 16384)) } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } }) }
    if (!validBody(body, ['deliveryId', 'conclusion', 'runUrl', 'commitSha'])) return new Response(JSON.stringify({ error: "Missing required fields: deliveryId, conclusion, runUrl, commitSha" }), { status: 400, headers: { "Content-Type": "application/json" } })
    if (!isGitHubRunUrl(body.runUrl) || !isCommitSha(body.commitSha) || !["success", "failure", "cancelled", "timed_out", "action_required", "stale", "startup_failure", "neutral", "skipped"].includes(body.conclusion)) return new Response(JSON.stringify({ error: "Invalid workflow evidence fields" }), { status: 400, headers: { "Content-Type": "application/json" } })
    await ctx.runMutation(internal.delivery.recordWorkflowResult, { id: body.deliveryId as Id<"deliveries">, conclusion: body.conclusion, runUrl: body.runUrl, commitSha: body.commitSha, summary: (body.summary ?? "").slice(0, 2000) })
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  }),
})

http.route({
  path: "/github-actions/deployment-result",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = requiredEnv("NEXUS_FORGE_DELIVERY_SECRET")
    if (request.headers.get("Authorization") !== `Bearer ${expected}`) return unauthorized()
    let body: { deliveryId?: string; runUrl?: string; commitSha?: string; deploymentUrl?: string; summary?: string }
    try { body = JSON.parse(await boundedText(request, 16384)) } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } }) }
    if (!validBody(body, ['deliveryId', 'runUrl', 'commitSha', 'deploymentUrl'])) return new Response(JSON.stringify({ error: "Missing required fields: deliveryId, runUrl, commitSha, deploymentUrl" }), { status: 400, headers: { "Content-Type": "application/json" } })
    if (!isGitHubRunUrl(body.runUrl) || !isCommitSha(body.commitSha) || !isHttpsUrl(body.deploymentUrl)) return new Response(JSON.stringify({ error: "Invalid deployment evidence fields" }), { status: 400, headers: { "Content-Type": "application/json" } })
    let readiness
    try {
      readiness = await ctx.runAction(internal.readiness.runForDelivery, { siteUrl: body.deploymentUrl, deliveryId: body.deliveryId as Id<"deliveries"> })
    } catch {
      return new Response(JSON.stringify({ error: "Deployment readiness check could not be completed" }), { status: 409, headers: { "Content-Type": "application/json" } })
    }
    if (readiness.status !== "pass") return new Response(JSON.stringify({ error: "Deployment failed the canonical readiness gate", readiness }), { status: 409, headers: { "Content-Type": "application/json" } })
    await ctx.runMutation(internal.delivery.recordDeploymentResult, { id: body.deliveryId as Id<"deliveries">, runUrl: body.runUrl, commitSha: body.commitSha, deploymentUrl: body.deploymentUrl, readinessPassedCount: readiness.passedCount, readinessTotalCount: readiness.totalCount, summary: `${body.summary ?? ""}\nReadiness: ${readiness.passedCount}/${readiness.totalCount} checks passed (run ${readiness.runId}).` })
    return new Response(JSON.stringify({ ok: true, verified: true, runId: readiness.runId, passedCount: readiness.passedCount, totalCount: readiness.totalCount }), { status: 200, headers: { "Content-Type": "application/json" } })
  }),
})

http.route({path:'/product-events',method:'POST',handler:httpAction(async(ctx,request)=>{const startedAt=Date.now();const header=request.headers.get('Authorization')??'',secret=header.startsWith('Bearer ')?header.slice(7):'';if(!/^[a-f0-9]{64}$/.test(secret))return unauthorized();let body,rawBody='';try{rawBody=await boundedText(request,8000);body=JSON.parse(rawBody)}catch{return new Response(JSON.stringify({error:'Invalid bounded JSON'}),{status:400})}if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='eventKey,sourceId,success'||typeof body.sourceId!=='string'||typeof body.eventKey!=='string'||typeof body.success!=='boolean'){const responseBody=JSON.stringify({error:'Expected sourceId, eventKey and success'});if(typeof body?.sourceId==='string'){try{await ctx.runMutation(internal.productTelemetry.recordTransportFailure,{sourceId:body.sourceId as Id<'productSources'>,tokenHash:await tokenDigest(secret),requestKey:crypto.randomUUID(),requestBytes:new TextEncoder().encode(rawBody).byteLength,responseBytes:new TextEncoder().encode(responseBody).byteLength,elapsedMs:Date.now()-startedAt,statusCode:400,category:'authenticated-request-invalid'})}catch{/* Do not change the validation response if telemetry fails. */}}return new Response(responseBody,{status:400,headers:{'Content-Type':'application/json'}})}try{const result=await ctx.runMutation(internal.productTelemetry.ingest,{...body,tokenHash:await tokenDigest(secret),digest:await tokenDigest(JSON.stringify([body.eventKey,body.success]))});const responseBody=JSON.stringify(result);if(result.eventId){try{await ctx.runMutation(internal.productTelemetry.recordTransport,{sourceId:body.sourceId as Id<'productSources'>,eventId:result.eventId as Id<'productEvents'>,requestKey:crypto.randomUUID(),requestBytes:new TextEncoder().encode(rawBody).byteLength,responseBytes:new TextEncoder().encode(responseBody).byteLength,ingestElapsedMs:Date.now()-startedAt})}catch{}}return new Response(responseBody,{status:200,headers:{'Content-Type':'application/json'}})}catch{const responseBody=JSON.stringify({error:'Event authorization, quota or immutable identity check failed'});if(typeof body?.sourceId==='string'){try{await ctx.runMutation(internal.productTelemetry.recordTransportFailure,{sourceId:body.sourceId as Id<'productSources'>,tokenHash:await tokenDigest(secret),requestKey:crypto.randomUUID(),requestBytes:new TextEncoder().encode(rawBody).byteLength,responseBytes:new TextEncoder().encode(responseBody).byteLength,elapsedMs:Date.now()-startedAt,statusCode:409,category:'authenticated-event-rejected'})}catch{/* Preserve the original generic rejection response if telemetry cannot be written. */}}return new Response(responseBody,{status:409,headers:{'Content-Type':'application/json'}})}})})
http.route({path:'/stripe/webhook',method:'POST',handler:httpAction(async(ctx,request)=>{
 const mode=request.headers.get('x-stripe-mode')
 if(mode!=='test'&&mode!=='live')return new Response('Invalid payment mode',{status:400})
 try{
  const result=await ctx.runAction(internal.payments.webhook,{payload:await boundedText(request,1000000),signature:request.headers.get('stripe-signature')??'',mode})
  return Response.json({received:result.success},{status:result.success?200:400})
 }catch{return new Response('Payment processing requires retry',{status:500})}
})})
async function scimDigest(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
function scimError(status: number, detail: string) {
  return new Response(JSON.stringify({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: String(status), detail }), {
    status, headers: { 'Content-Type': 'application/scim+json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
async function scimAuth(ctx: any, request: Request) {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!/^nxf_scim_[a-f0-9]{64}$/.test(token)) return null
  const tokenHash = await scimDigest(token)
  const credential = await ctx.runQuery(internal.teamScim.authorizeToken, { tokenHash })
  return credential ? { tokenHash, credential } : null
}

http.route({ path: '/scim/v2/Users', method: 'GET', handler: httpAction(async (ctx, request) => {
  const auth = await scimAuth(ctx, request)
  if (!auth) return scimError(401, 'Valid active SCIM bearer token required')
  try {
    const rows = await ctx.runMutation(internal.teamScim.listScimUsers, { tokenHash: auth.tokenHash })
    const startIndex = Math.max(1, Number(new URL(request.url).searchParams.get('startIndex') ?? '1') || 1)
    const count = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get('count') ?? '20') || 20))
    const resources = rows.slice(startIndex - 1, startIndex - 1 + count).map((row: any) => ({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: row.id, userName: row.userName, active: row.active,
      roles: [{ value: row.role }], meta: { resourceType: 'User', lastModified: new Date(row.updatedAt).toISOString() },
    }))
    return Response.json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'], totalResults: rows.length, startIndex, itemsPerPage: resources.length, Resources: resources }, { headers: { 'Content-Type': 'application/scim+json; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch { return scimError(503, 'SCIM directory operation could not be completed') }
}) })
http.route({ path: '/scim/v2/Users', method: 'POST', handler: httpAction(async (ctx, request) => {
  const auth = await scimAuth(ctx, request)
  if (!auth) return scimError(401, 'Valid active SCIM bearer token required')
  let body: any
  try { body = JSON.parse(await boundedText(request, 16384)) } catch { return scimError(400, 'Invalid JSON body') }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.userName !== 'string') return scimError(400, 'SCIM User requires userName')
  const active = body.active === undefined ? true : body.active
  if (typeof active !== 'boolean') return scimError(400, 'active must be a boolean')
  const roleValue = Array.isArray(body.roles) ? body.roles.find((r: any) => r && typeof r.value === 'string')?.value : undefined
  if (roleValue !== undefined && roleValue !== 'viewer' && roleValue !== 'contributor') return scimError(400, 'Supported roles are viewer and contributor')
  const role = roleValue === 'contributor' ? 'contributor' : 'viewer'
  try {
    const result = await ctx.runMutation(internal.teamScim.mutateScimUser, { tokenHash: auth.tokenHash, email: body.userName, active, role })
    if (!result.id) return scimError(400, 'SCIM user could not be resolved')
    return Response.json({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: result.id, userName: result.userName, active: result.active, roles: [{ value: result.role ?? role }] }, { status: 201, headers: { 'Content-Type': 'application/scim+json; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (error) { return scimError(400, error instanceof Error ? error.message.slice(0, 200) : 'SCIM user operation failed') }
}) })
http.route({ pathPrefix: '/scim/v2/Users/', method: 'GET', handler: httpAction(async (ctx, request) => {
  const auth = await scimAuth(ctx, request)
  if (!auth) return scimError(401, 'Valid active SCIM bearer token required')
  try {
    const rows = await ctx.runMutation(internal.teamScim.listScimUsers, { tokenHash: auth.tokenHash })
    const row = rows.find((candidate: any) => String(candidate.id) === new URL(request.url).pathname.split('/').pop())
    if (!row) return scimError(404, 'SCIM user not found')
    return Response.json({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: row.id, userName: row.userName, active: row.active, roles: [{ value: row.role }] }, { headers: { 'Content-Type': 'application/scim+json; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch { return scimError(503, 'SCIM directory operation could not be completed') }
}) })
http.route({ pathPrefix: '/scim/v2/Users/', method: 'PATCH', handler: httpAction(async (ctx, request) => {
  const auth = await scimAuth(ctx, request)
  if (!auth) return scimError(401, 'Valid active SCIM bearer token required')
  let body: any
  try { body = JSON.parse(await boundedText(request, 16384)) } catch { return scimError(400, 'Invalid JSON body') }
  if (!body || !Array.isArray(body.Operations) || body.Operations.length < 1 || body.Operations.length > 10) return scimError(400, 'SCIM PATCH requires 1–10 operations')
  try {
    const rows = await ctx.runMutation(internal.teamScim.listScimUsers, { tokenHash: auth.tokenHash })
    const row = rows.find((candidate: any) => String(candidate.id) === new URL(request.url).pathname.split('/').pop())
    if (!row) return scimError(404, 'SCIM user not found')
    let active = row.active, role = row.role
    for (const operation of body.Operations) {
      if (!operation || typeof operation !== 'object' || !['replace', 'add'].includes(String(operation.op).toLowerCase())) return scimError(400, 'Unsupported SCIM PATCH operation')
      const path = typeof operation.path === 'string' ? operation.path.toLowerCase() : ''
      if (path === 'active' && typeof operation.value === 'boolean') {
        active = operation.value
      } else if ((path === 'roles' || path === 'roles.value') && (Array.isArray(operation.value) || (operation.value && typeof operation.value === 'object'))) {
        const values = Array.isArray(operation.value) ? operation.value : [operation.value]
        const value = values.find((entry: any) => entry && typeof entry.value === 'string')?.value
        if (value === 'viewer' || value === 'contributor') role = value
        else return scimError(400, 'Supported roles are viewer and contributor')
      } else if (!path && operation.value && typeof operation.value === 'object' && !Array.isArray(operation.value)) {
        const value = operation.value as Record<string, unknown>
        const keys = Object.keys(value)
        if (!keys.length || keys.some(key => !['active', 'roles'].includes(key))) return scimError(400, 'Unsupported SCIM PATCH value')
        if ('active' in value) {
          if (typeof value.active !== 'boolean') return scimError(400, 'active must be a boolean')
          active = value.active
        }
        if ('roles' in value) {
          if (!Array.isArray(value.roles)) return scimError(400, 'roles must be an array')
          const roleValue = value.roles.find((entry: any) => entry && typeof entry.value === 'string')?.value
          if (roleValue !== 'viewer' && roleValue !== 'contributor') return scimError(400, 'Supported roles are viewer and contributor')
          role = roleValue
        }
      } else return scimError(400, 'Unsupported SCIM PATCH path or value')
    }
    const result = await ctx.runMutation(internal.teamScim.mutateScimUser, { tokenHash: auth.tokenHash, email: row.userName, active, role })
    return Response.json({ schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], id: result.id, userName: result.userName, active: result.active, roles: [{ value: role }] }, { headers: { 'Content-Type': 'application/scim+json; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch { return scimError(400, 'SCIM user update failed') }
}) })
http.route({ pathPrefix: '/scim/v2/Users/', method: 'DELETE', handler: httpAction(async (ctx, request) => {
  const auth = await scimAuth(ctx, request)
  if (!auth) return scimError(401, 'Valid active SCIM bearer token required')
  try {
    const rows = await ctx.runMutation(internal.teamScim.listScimUsers, { tokenHash: auth.tokenHash })
    const row = rows.find((candidate: any) => String(candidate.id) === new URL(request.url).pathname.split('/').pop())
    if (!row) return scimError(404, 'SCIM user not found')
    await ctx.runMutation(internal.teamScim.mutateScimUser, { tokenHash: auth.tokenHash, email: row.userName, active: false })
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch { return scimError(400, 'SCIM deprovisioning failed') }
}) })

export default http
