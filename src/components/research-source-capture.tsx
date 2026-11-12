import {useState} from 'react'
import {useAction,useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Doc,Id} from '../../convex/_generated/dataModel'
export function ResearchSourceCapture({researchId,citation,selected,onSelect}:{researchId:Id<'research'>;citation:string;selected:Doc<'researchSourceCaptures'>|null;onSelect:(row:Doc<'researchSourceCaptures'>|null)=>void}){
 const attempts=useQuery(api.researchSources.list,{researchId}),capture=useAction(api.researchSources.capture)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const relevant=(attempts??[]).filter(row=>row.citation===citation),captured=relevant.filter(row=>row.status==='captured'&&row.snapshot)
 const retrieve=async()=>{setBusy(true);setMessage('');try{await capture({researchId,citation});setMessage('Source captured. Select the retrieved snapshot as the excerpt basis below.')}catch(e){setMessage(e instanceof Error?e.message:'Source retrieval failed. Inspect the saved attempt before retrying.')}finally{setBusy(false)}}
 const snapshot=selected?.snapshot
 return <section data-testid="research-source-capture" data-state={attempts===undefined?'loading':'ready'}>
  <h3>Source provenance</h3><p>Retrieve this exact citation through the protected gateway. Retrieval checks where text came from; it does not establish that a claim is true. No AI call is made.</p>
  <button className="secondary-button" disabled={busy||attempts===undefined||attempts.length>=10} onClick={()=>void retrieve()}>{busy?'Retrieving source…':'Retrieve selected source'}</button>
  <p>{attempts===undefined?'Loading retrieval history…':attempts.length+'/10 retrieval attempts for this research record'}</p>
  {message&&<p role="status">{message}</p>}
  {relevant.filter(row=>row.status!=='captured').map(row=><p className="warning" key={row._id}>{row.status==='pending'?'Retrieval awaiting confirmation. Review status before starting another attempt.':'Retrieval failed: '+row.failureReason}</p>)}
  <label htmlFor="claim-excerpt-basis">Excerpt basis</label><select id="claim-excerpt-basis" value={selected?._id??''} onChange={e=>onSelect(captured.find(row=>row._id===e.target.value)??null)}>
   <option value="">Saved research summary (may be AI-generated)</option>
   {captured.map(row=><option key={row._id} value={row._id}>Retrieved source · {new Date(row.snapshot!.capturedAt).toLocaleString()}</option>)}
  </select>
  {snapshot&&<div>
   <p><strong>{snapshot.title||'Retrieved source'}</strong> · <a href={snapshot.finalUrl} target="_blank" rel="noreferrer">{snapshot.finalUrl}</a></p>
   <p>Captured {new Date(snapshot.capturedAt).toLocaleString()} · Publication date: {snapshot.publicationStatus}{snapshot.publicationDate?' · '+snapshot.publicationDate:''}</p>
   <p>Dates are page declarations, not independently verified publication times. Unknown, invalid, future and conflicting dates remain explicit.</p>
   {(snapshot.textTruncated||snapshot.bodyLimitReached)&&<p className="warning">This bounded source capture may be partial. Review missing context before assessing a claim.</p>}
   <details><summary>Captured source text for exact excerpts</summary><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{snapshot.extractedText}</p></details>
   <p className="muted-copy" style={{overflowWrap:'anywhere'}}>Text SHA-256: {snapshot.textSha256} · Response bytes: {snapshot.bodyBytes}. Capture is a bounded text extraction, not a full page archive.</p>
  </div>}
 </section>
}
