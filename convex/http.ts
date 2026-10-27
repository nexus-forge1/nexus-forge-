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

// HTTP actions run in the Convex runtime: use Web Crypto, not node:crypto/Buffer.
// Native HMAC verification avoids a JavaScript comparison of secret bytes.
async function compareSecrets(provided: string | null, expected: string): Promise<boolean> {
  if (!provided) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(expected))
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(provided))
}

async function authorized(request: Request): Promise<boolean> {
  const header = request.headers.get("Authorization")
  if (!header?.startsWith("Bearer ")) return false
  return compareSecrets(header.slice(7), requiredEnv("NEXUS_FORGE_DELIVERY_SECRET"))
}

function callbackConflict(error: string) {
  return Response.json({ error }, { status: 409 })
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
    if (!await authorized(request)) return unauthorized()
    let body: { deliveryId?: string; conclusion?: string; runUrl?: string; commitSha?: string; summary?: string }
    try { body = await request.json() } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } }) }
    if (!validBody(body, ['deliveryId', 'conclusion', 'runUrl', 'commitSha'])) return new Response(JSON.stringify({ error: "Missing required fields: deliveryId, conclusion, runUrl, commitSha" }), { status: 400, headers: { "Content-Type": "application/json" } })
    if (!isGitHubRunUrl(body.runUrl) || !isCommitSha(body.commitSha) || !["success", "failure", "cancelled", "timed_out", "action_required", "stale", "startup_failure", "neutral", "skipped"].includes(body.conclusion)) return new Response(JSON.stringify({ error: "Invalid workflow evidence fields" }), { status: 400, headers: { "Content-Type": "application/json" } })
    try {
      // The mutation validates approval, stage, provenance and replay identity atomically.
      await ctx.runMutation(internal.delivery.recordWorkflowResult, { id: body.deliveryId as Id<"deliveries">, conclusion: body.conclusion, runUrl: body.runUrl, commitSha: body.commitSha, summary: (body.summary ?? "").slice(0, 2000) })
    } catch {
      return callbackConflict("Workflow callback conflicts with delivery approval, stage or recorded evidence")
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } })
  }),
})

http.route({
  path: "/github-actions/deployment-result",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!await authorized(request)) return unauthorized()
    let body: { deliveryId?: string; runUrl?: string; commitSha?: string; deploymentUrl?: string; summary?: string }
    try { body = await request.json() } catch { return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } }) }
    if (!validBody(body, ['deliveryId', 'runUrl', 'commitSha', 'deploymentUrl'])) return new Response(JSON.stringify({ error: "Missing required fields: deliveryId, runUrl, commitSha, deploymentUrl" }), { status: 400, headers: { "Content-Type": "application/json" } })
    if (!isGitHubRunUrl(body.runUrl) || !isCommitSha(body.commitSha) || !isHttpsUrl(body.deploymentUrl)) return new Response(JSON.stringify({ error: "Invalid deployment evidence fields" }), { status: 400, headers: { "Content-Type": "application/json" } })
    // Reject unapproved, unrelated and conflicting evidence before any network probe.
    try {
      const delivery = await ctx.runQuery(internal.delivery.getInternal, { id: body.deliveryId as Id<"deliveries"> })
      if (!delivery?.approved || !["test", "verified"].includes(delivery.stage) ||
        delivery.workflowConclusion !== "success" || delivery.workflowRunUrl !== body.runUrl ||
        delivery.workflowCommitSha?.toLowerCase() !== body.commitSha.toLowerCase() ||
        (delivery.deploymentUrl && delivery.deploymentUrl !== new URL(body.deploymentUrl).toString())) {
        return callbackConflict("Deployment callback conflicts with delivery approval, stage or recorded evidence")
      }
    } catch {
      return callbackConflict("Delivery could not be validated")
    }
    let readiness
    try {
      readiness = await ctx.runAction(internal.readiness.runForDelivery, { siteUrl: body.deploymentUrl, deliveryId: body.deliveryId as Id<"deliveries"> })
    } catch {
      return new Response(JSON.stringify({ error: "Deployment readiness check could not be completed" }), { status: 409, headers: { "Content-Type": "application/json" } })
    }
    if (readiness.status !== "pass") return new Response(JSON.stringify({ error: "Deployment failed the canonical readiness gate", readiness }), { status: 409, headers: { "Content-Type": "application/json" } })
    try {
      await ctx.runMutation(internal.delivery.recordDeploymentResult, { id: body.deliveryId as Id<"deliveries">, runUrl: body.runUrl, commitSha: body.commitSha, deploymentUrl: body.deploymentUrl, readinessPassedCount: readiness.passedCount, readinessTotalCount: readiness.totalCount, summary: `${body.summary ?? ""}\nReadiness: ${readiness.passedCount}/${readiness.totalCount} checks passed (run ${readiness.runId}).` })
    } catch {
      return callbackConflict("Deployment callback conflicts with recorded delivery evidence")
    }
    return new Response(JSON.stringify({ ok: true, verified: true, runId: readiness.runId, passedCount: readiness.passedCount, totalCount: readiness.totalCount }), { status: 200, headers: { "Content-Type": "application/json" } })
  }),
})

http.route({path:'/product-events',method:'POST',handler:httpAction(async(ctx,request)=>{const header=request.headers.get('Authorization')??'',secret=header.startsWith('Bearer ')?header.slice(7):'';if(!/^[a-f0-9]{64}$/.test(secret))return unauthorized();let body;try{body=JSON.parse(await boundedText(request,8000))}catch{return new Response(JSON.stringify({error:'Invalid bounded JSON'}),{status:400})}if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='eventKey,sourceId,success'||typeof body.sourceId!=='string'||typeof body.eventKey!=='string'||typeof body.success!=='boolean')return new Response(JSON.stringify({error:'Expected sourceId, eventKey and success'}),{status:400});try{const result=await ctx.runMutation(internal.productTelemetry.ingest,{...body,tokenHash:await tokenDigest(secret),digest:await tokenDigest(JSON.stringify([body.eventKey,body.success]))});return Response.json(result)}catch{return new Response(JSON.stringify({error:'Event authorization, quota or immutable identity check failed'}),{status:409,headers:{'Content-Type':'application/json'}})}})})
http.route({path:'/stripe/webhook',method:'POST',handler:httpAction(async(ctx,request)=>{
 const mode=request.headers.get('x-stripe-mode')
 if(mode!=='test'&&mode!=='live')return new Response('Invalid payment mode',{status:400})
 try{
  const result=await ctx.runAction(internal.payments.webhook,{payload:await boundedText(request,1000000),signature:request.headers.get('stripe-signature')??'',mode})
  return Response.json({received:result.success},{status:result.success?200:400})
 }catch{return new Response('Payment processing requires retry',{status:500})}
})})
export default http

