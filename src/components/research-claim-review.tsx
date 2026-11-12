import { ResearchSourceCapture } from './research-source-capture'
import { useState } from 'react'
import { useMutation,useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Doc,Id } from '../../convex/_generated/dataModel'
import { safeCitation,type ResearchRecord } from '../lib/research-dossier'
export function ResearchClaimReview({missionId,records}:{missionId:Id<'missions'>;records:ResearchRecord[]}) {
 const [sourceCapture,setSourceCapture]=useState<Doc<'researchSourceCaptures'>|null>(null)
 const reviews=useQuery(api.researchClaims.list,{missionId})
 const save=useMutation(api.researchClaims.record)
 const [researchId,setResearchId]=useState(''),[citation,setCitation]=useState(''),[claim,setClaim]=useState(''),[excerpt,setExcerpt]=useState(''),[rationale,setRationale]=useState('')
 const [finding,setFinding]=useState<'supporting'|'contradicting'|'unresolved'>('unresolved')
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const selected=records.find(row=>row._id===researchId)
 const submit=async()=>{setBusy(true);setMessage('');try{
  await save({missionId,researchId:researchId as Id<'research'>,claim,finding,citation,excerpt,rationale,...(sourceCapture?{sourceCaptureId:sourceCapture._id}:{})})
  setMessage('Evidence review saved.');setClaim('');setExcerpt('');setRationale('')
 }catch(e){setMessage(e instanceof Error?e.message:'Could not save evidence review.')}finally{setBusy(false)}}
 return <div className="glass-card research-card" data-testid="research-claim-review" data-state={reviews===undefined?"loading":"ready"}>
  <div className="panel-title"><span>CLAIM EVIDENCE REVIEW</span><span className="status-chip">{reviews===undefined?'LOADING':reviews.length+'/100 REVIEWS'}</span></div>
  <p>State one claim, select saved research and classify how it bears on the claim. Findings are your assessments. Saved research may be an AI synthesis; summary excerpts are not verified quotations from the linked web page. Select a retrieved source snapshot below to pin an excerpt to captured source text.</p>
  <label htmlFor="claim-text">Claim to assess</label><textarea id="claim-text" maxLength={1500} value={claim} onChange={e=>setClaim(e.target.value)}/>
  <label htmlFor="claim-research">Saved research</label><select id="claim-research" value={researchId} onChange={e=>{setResearchId(e.target.value);setCitation('');setExcerpt('');setSourceCapture(null)}}><option value="">Select research</option>{records.map(row=><option key={row._id} value={row._id}>{row.query}</option>)}</select>
  {selected&&<details><summary>Read saved research for the excerpt</summary><p>{selected.result}</p></details>}
  <label htmlFor="claim-citation">Exact saved citation</label><select id="claim-citation" value={citation} onChange={e=>{setCitation(e.target.value);setExcerpt('');setSourceCapture(null)}}><option value="">Select citation</option>{[...new Set(selected?.citations??[])].filter(url=>safeCitation(url)).map(url=><option key={url} value={url}>{url}</option>)}</select>
  {selected&&citation&&<ResearchSourceCapture key={researchId+":"+citation} researchId={researchId as Id<"research">} citation={citation} selected={sourceCapture} onSelect={row=>{setSourceCapture(row);setExcerpt("")}}/>}
  <label htmlFor="claim-excerpt">{sourceCapture?"Exact excerpt from retrieved source":"Exact excerpt from saved research"}</label><textarea id="claim-excerpt" maxLength={2000} value={excerpt} onChange={e=>setExcerpt(e.target.value)}/>
  <label htmlFor="claim-finding">Evidence finding</label><select id="claim-finding" value={finding} onChange={e=>setFinding(e.target.value as typeof finding)}><option value="unresolved">Unresolved</option><option value="supporting">Supporting</option><option value="contradicting">Contradicting</option></select>
  <label htmlFor="claim-rationale">Why does this evidence affect the claim?</label><textarea id="claim-rationale" maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)}/>
  <button className="primary-button" disabled={busy||reviews===undefined||reviews.length>=100||!selected||!citation||claim.trim().length<8||excerpt.trim().length<8||rationale.trim().length<8} onClick={()=>void submit()}>{busy?'Saving…':'Save evidence review'}</button>
  {message&&<p role="status">{message}</p>}
  <p>Reviews are retained unchanged. Add another review to preserve a changed assessment. Conflicting findings remain visible and do not automatically approve a claim or mission.</p>
  {reviews?.map(row=><article className="evidence-item" key={row._id}><div><strong>{row.claim}</strong><p>{row.finding} · {new Date(row.createdAt).toLocaleString()}</p><p><strong>Excerpt basis:</strong> {row.sourceCaptureId?'Retrieved source snapshot':'Saved research summary'}</p><blockquote>{row.excerpt}</blockquote>{row.sourceTextSha256&&<p className="muted-copy" style={{overflowWrap:'anywhere'}}>Source text SHA-256: {row.sourceTextSha256} · Captured {new Date(row.sourceCapturedAt!).toLocaleString()}</p>}<p>{row.rationale}</p><a href={row.citation} target="_blank" rel="noreferrer">{row.citation}</a><p className="muted-copy">Saved research: {row.researchQuery} · {row.researchId}</p></div></article>)}
 </div>
}
