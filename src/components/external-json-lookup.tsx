import {useState} from 'react'
import {useAction,useMutation} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
export function ExternalJsonLookup({adapter}:{adapter:{_id:Id<'externalAdapters'>;endpoint:string;enabled:boolean}}){
 const run=useAction(api.externalRuntime.run),setEnabled=useMutation(api.externalRuntime.setEnabled)
 const [requestKey,setRequestKey]=useState<string>(()=>crypto.randomUUID())
 const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(''),[error,setError]=useState('')
 async function work(operation:()=>Promise<unknown>){
  setBusy(true);setError('');setResult('')
  try{const value=await operation();setResult(typeof value==='string'?value:JSON.stringify(value)??'Saved')}
  catch(e){setError(e instanceof Error?e.message:'Lookup failed. Inspect the receipt before starting another request.')}
  finally{setBusy(false)}
 }
 return <form data-testid="external-json-lookup" data-adapter-id={adapter._id} data-state={busy?'working':'ready'} onSubmit={event=>{
  event.preventDefault()
  void work(()=>run({adapterId:adapter._id,requestKey,input}))
 }}>
  <h3>{adapter.endpoint}</h3><p>{adapter.enabled?'Enabled':'Revoked'}</p>
  <label>Request key<input value={requestKey} pattern="[A-Za-z0-9_-]{8,100}" required maxLength={100} disabled={busy} onChange={e=>setRequestKey(e.target.value)}/></label>
  <label>Explicit input JSON<textarea required maxLength={16000} value={input} disabled={busy} onChange={e=>setInput(e.target.value)}/></label>
  <p>Keep this key and exact input to retrieve a completed receipt without another lookup. Pending or failed keys stay blocked. Editing input does not create a new request. Starting a new key permits another external call; review uncertain receipts first.</p>
  <div className="hero-actions">
   <button className="primary-button" disabled={busy||!adapter.enabled}>Run or retrieve this request</button>
   <button type="button" className="secondary-button" disabled={busy||!adapter.enabled} onClick={()=>{setRequestKey(crypto.randomUUID());setResult('');setError('')}}>Start a new request key</button>
   <button type="button" className="ghost-button" disabled={busy} onClick={()=>void work(()=>setEnabled({adapterId:adapter._id,enabled:!adapter.enabled}))}>{adapter.enabled?'Revoke':'Enable'}</button>
  </div>
  {busy&&<p role="status">Checking this request…</p>}
  {error&&<p role="alert">{error}</p>}
  {result&&<pre role="status" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{result}</pre>}
 </form>
}
