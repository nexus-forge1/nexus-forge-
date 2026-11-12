import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ScopeAPanel, ScopeAResult, ScopeASubmit } from './scope-a-ui-kit'

export function FeaturePackageCompilerView(){const compile=useMutation(api.scopeAFunctions.compileFeaturePackage),[featureId,setFeatureId]=useState(''),[expectedDigest,setExpectedDigest]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('')
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setResult('');try{const out=await compile({featureId:featureId as Id<'featurePackages'>,expectedDigest});setResult(JSON.stringify(out))}catch(x){setError(x instanceof Error?x.message:'Feature package compilation failed')}finally{setBusy(false)}}
 return <ScopeAPanel title="Feature package compiler" eyebrow="A10 · SCAFFOLD & HANDOFF"><form onSubmit={submit}><label className="scope-a-field">Feature package ID<input value={featureId} onChange={e=>setFeatureId(e.target.value)} required/></label><label className="scope-a-field">Expected artifact digest<input value={expectedDigest} onChange={e=>setExpectedDigest(e.target.value)} required/></label><p className="muted-copy">Compilation uses the stored package and expected digest; handoff is reported only when the backend confirms it.</p><ScopeASubmit busy={busy} label="Compile feature package"/></form><ScopeAResult value={result} error={error}/></ScopeAPanel>}
