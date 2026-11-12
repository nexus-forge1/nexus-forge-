import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ScopeAPanel } from './scope-a-ui-kit'

export function RepoSnapshotParserView(){const [snapshotId,setSnapshotId]=useState(''),[run,setRun]=useState(false),data=useQuery(api.scopeAFunctions.parseRepositorySnapshot,run&&snapshotId?{snapshotId:snapshotId as Id<'appImportSnapshots'>}:'skip')
 return <ScopeAPanel title="Repository snapshot parser" eyebrow="A11 · AST FINDINGS"><form onSubmit={e=>{e.preventDefault();setRun(true)}}><label className="scope-a-field">Repository snapshot ID<input value={snapshotId} onChange={e=>{setSnapshotId(e.target.value);setRun(false)}} required/></label><button className="primary-button" type="submit">Parse snapshot</button></form>{run&&data===undefined?<p role="status">Parsing stored snapshot…</p>:data&&<><div className="decision-line"><span>FINDINGS</span><strong>{data.findings.length}</strong></div><p>Languages: {data.languages.join(', ')||'Not detected'}</p><ul>{data.findings.map((finding,i)=><li key={i}>{finding}</li>)}</ul></>}</ScopeAPanel>}
