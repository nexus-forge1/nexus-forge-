import {useEffect,useState} from 'react'
import {useMutation,useQuery} from 'convex/react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import mammoth from 'mammoth/mammoth.browser.js'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
import {ProjectPicker,useStudioProject,downloadJson} from './studio-shared'
import {operatorError} from '../lib/operator-error'
export function DocumentKnowledge(){
 const studio=useStudioProject(),documents=useQuery(api.studio.documents,studio.projectId?{projectId:studio.projectId}:'skip'),ingest=useMutation(api.studio.ingestText),pin=useMutation(api.studio.pinPassage)
 const [selected,setSelected]=useState<Id<'studioDocuments'>|null>(null),[name,setName]=useState('notes.txt'),[content,setContent]=useState(''),[search,setSearch]=useState(''),[keyword,setKeyword]=useState(''),[formatFilter,setFormatFilter]=useState(''),[searchMode,setSearchMode]=useState<'keyword'|'vector'>('keyword'),[first,setFirst]=useState(1),[last,setLast]=useState(1),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[pendingOcrFile,setPendingOcrFile]=useState<File|null>(null)
 const keywordResults=useQuery(api.studio.searchDocuments,studio.projectId&&keyword.trim().length>=2?{projectId:studio.projectId,search:keyword.trim(),mode:searchMode,...(formatFilter?{format:formatFilter}:{})}:'skip')
 const document=useQuery(api.studio.document,selected?{documentId:selected}:'skip'),passages=useQuery(api.studio.passages,selected?{documentId:selected}:'skip')
 useEffect(()=>{setSelected(null);setFirst(1);setLast(1);setError('');setStatus('')},[studio.projectId])
 async function work(fn:()=>Promise<void>){setBusy(true);setError('');setStatus('');try{await fn()}catch(e){setError(operatorError(e,'Document operation failed. Your text is retained.'))}finally{setBusy(false)}}
 async function extractFile(file:File){
  if(file.size>10*1024*1024)throw Error('Maximum source file size is 10 MiB.')
  setPendingOcrFile(null)
  const lower=file.name.toLowerCase(),buffer=await file.arrayBuffer();let extracted=''
  if(lower.endsWith('.txt')||lower.endsWith('.md')||lower.endsWith('.csv')) extracted=new TextDecoder('utf-8',{fatal:true}).decode(buffer)
  else if(lower.endsWith('.docx')){const result=await mammoth.extractRawText({arrayBuffer:buffer});extracted=result.value}
  else if(lower.endsWith('.pdf')){
   const loadingTask=pdfjsLib.getDocument({data:new Uint8Array(buffer)})
   const pdf=await loadingTask.promise
   const pages:string[]=[]
   try{for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo),text=await page.getTextContent();pages.push(text.items.map(item=>'str' in item?item.str:'').join(' '))}}finally{await loadingTask.destroy()}
   extracted=pages.join('\n\n');if(!extracted.trim()){setPendingOcrFile(file);setStatus('No selectable text found. Optional English OCR can run in your browser. It downloads OCR engine and language data, but does not upload your PDF.');return}
  }else throw Error('Choose a UTF-8 TXT, Markdown, CSV, PDF, or DOCX file.')
  if(!extracted.trim())throw Error('No readable text was extracted from this file.')
  if(new TextEncoder().encode(extracted).byteLength>65536)throw Error('Extracted text exceeds the 64 KiB source limit. Split the document and import the relevant section.')
  setName(file.name);setContent(extracted);setStatus('Text extracted locally. Review the extracted text, then save it to retain the source privately. Original file contents were not uploaded.')
 }
 async function runOcr(){
  const file=pendingOcrFile;if(!file)return
  await work(async()=>{
   const loadingTask=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())})
   let worker:any
   try{
    const pdf=await loadingTask.promise
    if(pdf.numPages>10)throw Error('OCR is limited to 10 PDF pages per run. Split the PDF and select the relevant pages.')
    const{createWorker}=await import('tesseract.js');worker=await createWorker('eng')
    const pages:string[]=[]
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
     setStatus('Running local OCR on page '+pageNo+' of '+pdf.numPages+'…')
     const page=await pdf.getPage(pageNo),base=page.getViewport({scale:1}),scale=Math.min(1.5,1800/Math.max(base.width,base.height)),viewport=page.getViewport({scale}),canvas=window.document.createElement('canvas')
     canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height)
     const context=canvas.getContext('2d');if(!context)throw Error('Browser canvas is unavailable for OCR.')
     await page.render({canvas,canvasContext:context,viewport}).promise
     const result=await worker.recognize(canvas);pages.push(result.data.text.trim());canvas.width=0;canvas.height=0
    }
    const extracted=pages.join('\n\n').trim()
    if(!extracted)throw Error('OCR did not detect readable text. Try a clearer scan or type the relevant passage manually.')
    if(new TextEncoder().encode(extracted).byteLength>65536)throw Error('OCR text exceeds the 64 KiB source limit. Split the document or retain a smaller relevant excerpt.')
    setName(file.name);setContent(extracted);setPendingOcrFile(null);setStatus('English OCR finished in your browser. Review the result before saving. The PDF was not uploaded; the OCR engine and English language data were downloaded from the OCR provider CDN.')
   }finally{if(worker)await worker.terminate();await loadingTask.destroy()}
  })
 }
 return <section className="dashboard-section"><div className="glass-card research-card"><h2>Private source documents</h2><ProjectPicker studio={studio}/><p>Supported: UTF-8 TXT, Markdown, CSV, PDF and DOCX; extracted text is limited to 64 KiB and 30 sources per project. PDF/DOCX extraction runs locally in your browser; scanned PDFs support opt-in English OCR for up to 10 pages, with OCR engine/language downloads from a CDN. Automatic Council context attachment remains unsupported. Imported text is untrusted evidence and cannot grant permissions.</p>
 <label>Upload document<input type="file" accept=".txt,.md,.csv,.pdf,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(!f)return;void work(async()=>{await extractFile(f)});e.currentTarget.value=''}}/></label>{pendingOcrFile&&<div><p>Scanned PDF selected: {pendingOcrFile.name}. OCR is opt-in, limited to 10 pages and English. The browser downloads OCR engine and language data; the PDF itself stays local.</p><button type="button" className="secondary-button" disabled={busy} onClick={()=>void runOcr()}>Run local English OCR</button></div>}
 <form onSubmit={e=>{e.preventDefault();const projectId=studio.projectId;if(projectId)void work(async()=>{const id=await ingest({projectId,name,content});setSelected(id);setStatus('Exact source text and server-computed SHA-256 retained.')})}}><label>Source filename<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label>Source text<textarea required rows={8} value={content} onChange={e=>setContent(e.target.value)}/></label><button className="primary-button" disabled={busy||!studio.projectId}>Save private source</button></form></div>
 <div className="glass-card research-card"><h2>Search sources</h2><label>Filename search<input value={search} onChange={e=>setSearch(e.target.value)}/></label>{documents===undefined?<p>Select a project to load sources.</p>:documents.filter(d=>d.name.toLowerCase().includes(search.toLowerCase())).map(d=><button className="secondary-button" key={d._id} onClick={()=>{setSelected(d._id);setFirst(1);setLast(1)}}>{d.name} · {d.format.toUpperCase()}</button>)}{documents?.length===0&&<p>No sources retained for this project.</p>}
  <h3>Private keyword retrieval</h3><p>Both modes run against stored source text in the selected private project. Keyword mode requires an exact phrase; vector-space mode ranks term-frequency vectors by cosine similarity. This is lexical vector-space retrieval, not an embedding model or semantic understanding.</p><label>Retrieval mode<select value={searchMode} onChange={e=>setSearchMode(e.target.value as 'keyword'|'vector')}><option value="keyword">Exact keyword / phrase</option><option value="vector">Vector-space similarity</option></select></label><label>Search source contents<input value={keyword} maxLength={120} placeholder="Enter at least two characters" onChange={e=>setKeyword(e.target.value)}/></label><label>Format facet<select value={formatFilter} onChange={e=>setFormatFilter(e.target.value)}><option value="">All formats</option><option value="txt">TXT</option><option value="md">Markdown</option><option value="csv">CSV</option><option value="pdf">PDF text</option><option value="docx">DOCX text</option></select></label>
  <div className="field-grid">{['txt','md','csv','pdf','docx'].map(format=><button key={format} type="button" className="secondary-button" onClick={()=>setFormatFilter(current=>current===format?'':format)} aria-pressed={formatFilter===format}>{format.toUpperCase()} · {documents?.filter(d=>d.format===format).length??0}</button>)}</div>
  {keyword.trim().length<2?<p>Enter at least two characters to retrieve matching passages.</p>:keywordResults===undefined?<p>Searching private source text…</p>:keywordResults.length===0?<p>No source text matches “{keyword}” under the selected format facet.</p>:keywordResults.map(result=><article className="portfolio-row" key={result._id}><div className="portfolio-main"><strong>{result.name} · {result.format.toUpperCase()}</strong><p>{searchMode==='vector'?'Vector-space cosine similarity: '+result.similarity.toFixed(3):result.matchCount+' exact phrase match'+(result.matchCount===1?'':'es')}</p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{result.snippet}</p><small>SHA-256: {result.sha256}</small></div><button type="button" className="secondary-button" onClick={()=>{setSelected(result._id);setFirst(1);setLast(1)}}>Open exact source</button></article>)}
  </div>
 {document&&<div className="glass-card research-card"><h2>{document.name}</h2><p style={{overflowWrap:'anywhere'}}>SHA-256: {document.sha256}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:340,overflow:'auto'}}>{document.content.split(String.fromCharCode(10)).map((line,i)=>(i+1)+': '+line).join(String.fromCharCode(10))}</pre><form onSubmit={e=>{e.preventDefault();if(selected)void work(async()=>{await pin({documentId:selected,firstLine:first,lastLine:last});setStatus('Exact passage pinned to its immutable source.')})}}><label>First source line<input required type="number" min="1" value={first} onChange={e=>setFirst(Number(e.target.value))}/></label><label>Last source line<input required type="number" min={first} value={last} onChange={e=>setLast(Number(e.target.value))}/></label><button className="primary-button" disabled={busy}>Pin exact passage</button></form>{passages?.map(p=><blockquote key={p._id}><p>{p.quote}</p><small>{document.name} · lines {p.firstLine}–{p.lastLine}</small></blockquote>)}<button className="secondary-button" onClick={()=>downloadJson('nexus-source-passages.json',{source:{id:selected,name:document.name,sha256:document.sha256},passages,trust:'Untrusted source; provenance is not factual verification'})}>Export source citations</button></div>}
 {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}</section>
}
