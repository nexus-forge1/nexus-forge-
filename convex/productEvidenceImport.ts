"use node"
import { createHash } from "node:crypto"
import { Buffer } from "node:buffer"
import { ConvexError, v } from "convex/values"
import type { Infer } from "convex/values"
import { action, internalAction } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { api, internal } from "./_generated/api"
import { productOutcomeInput } from "./productOutcomeModel"

const repository = "nexus-forge1/nexus-forge-"
const inputValidator = v.object(productOutcomeInput)
async function fetchReport(args:{missionId:Id<"missions">;commitSha:string;reportId:string}) {    const commitSha = args.commitSha.toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^[A-Za-z0-9_-]{1,64}$/.test(args.reportId)) throw new ConvexError("Use a full 40-character commit SHA and a report ID with letters, numbers, underscore or hyphen.")
    const token = process.env.GITHUB_ACCESS_TOKEN
    if (!token) throw new ConvexError("Server GitHub access is not configured for report import.")
    const path = "nexus-forge-outcomes/" + args.missionId + "/" + args.reportId + ".json"
    let response: Response
    try {
      response = await fetch("https://api.github.com/repos/" + repository + "/contents/" + path + "?ref=" + commitSha, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, redirect: "error", signal: AbortSignal.timeout(15000) })
    } catch { throw new ConvexError("GitHub report lookup failed. Check access and retry.") }
    if (!response.ok) throw new ConvexError("GitHub report lookup failed (HTTP " + response.status + "). Check the exact commit, report path and repository access.")
    const reader = response.body?.getReader()
    if (!reader) throw new ConvexError("GitHub returned no report response.")
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 131072) { await reader.cancel(); throw new Error("size") }
        chunks.push(value)
      }
    } catch { throw new ConvexError("GitHub report response was incomplete or exceeded 128 KiB.") }
    let file: { type?: string; path?: string; encoding?: string; sha?: string; size?: number; content?: string }
    try { file = JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { throw new ConvexError("GitHub returned malformed report metadata.") }
    if (!file || file.type !== "file" || file.path !== path || file.encoding !== "base64" || typeof file.content !== "string" || typeof file.sha !== "string") throw new ConvexError("GitHub did not return the requested regular report file.")
    const encoded = file.content.replace(/\s/g, "")
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new ConvexError("Report encoding is invalid.")
    const bytes = Buffer.from(encoded, "base64")
    if (bytes.byteLength > 65536 || file.size !== bytes.byteLength) throw new ConvexError("Report must be at most 64 KiB with matching size metadata.")
    const blobSha = createHash("sha1").update("blob " + bytes.byteLength + "\0").update(bytes).digest("hex")
    if (blobSha !== file.sha) throw new ConvexError("Report bytes do not match GitHub's blob identity.")
    let report: Record<string, unknown>
    try { report = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) } catch { throw new ConvexError("Report must contain valid UTF-8 JSON.") }
    const allowed = new Set(["version", ...Object.keys(productOutcomeInput)])
    if (!report || typeof report !== "object" || Array.isArray(report) || report.version !== "product-outcome-v1" || report.missionId !== args.missionId || Object.keys(report).some(key => !allowed.has(key))) throw new ConvexError("Report version, mission or fields do not match the product-outcome-v1 contract.")
    const { version: _version, ...input } = report
    const receipt = { repository, path, commitSha, blobSha, reportSha256: createHash("sha256").update(bytes).digest("hex"), importedAt: Date.now() }
    return { input: input as Infer<typeof inputValidator>, receipt }
}
export const importReport=action({args:{missionId:v.id("missions"),commitSha:v.string(),reportId:v.string()},returns:v.id("productOutcomes"),handler:async(ctx,args):Promise<Id<"productOutcomes">>=>{await ctx.runQuery(api.missions.getById,{id:args.missionId});const report=await fetchReport(args);return ctx.runMutation(internal.verification.importProductOutcomeInternal,{...report.input,receipt:report.receipt})}})
export const pollFeed=internalAction({args:{feedId:v.id("outcomeFeeds"),generation:v.number(),sequence:v.optional(v.number())},handler:async(ctx,a)=>{
 const feed=await ctx.runMutation(internal.outcomeFeeds.claimPoll,a);if(!feed)return;
 try{const token=process.env.GITHUB_ACCESS_TOKEN;if(!token)throw Error('GitHub access not configured');const response=await fetch("https://api.github.com/repos/"+repository+"/commits/main",{headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json"},redirect:"error",signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('GitHub branch lookup failed');const {boundedText}=await import('./boundedResponse');const data=JSON.parse(await boundedText(response,100000));if(!/^[a-f0-9]{40}$/.test(data.sha))throw Error('Invalid GitHub commit');const report=await fetchReport({missionId:feed.missionId,reportId:feed.reportId,commitSha:data.sha});await ctx.runMutation(internal.outcomeFeeds.ingest,{...a,...report.input,receipt:report.receipt});await ctx.runMutation(internal.outcomeFeeds.reschedule,{...a,lastCommit:data.sha,error:""})}
 catch{await ctx.runMutation(internal.outcomeFeeds.reschedule,{...a,error:"Report unavailable or invalid; previous evidence retained."})}
}})
