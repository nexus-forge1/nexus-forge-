import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ScopeAPanel } from './scope-a-ui-kit'

export function SkillContractPreview(){const [skillId,setSkillId]=useState(''),[run,setRun]=useState(false),data=useQuery(api.scopeAFunctions.validateSkillContract,run&&skillId?{skillId:skillId as Id<'skillVersions'>}:'skip')
 return <ScopeAPanel title="Skill contract preview" eyebrow="A14 · SCHEMA VALIDATION"><form onSubmit={e=>{e.preventDefault();setRun(true)}}><label className="scope-a-field">Skill version ID<input value={skillId} onChange={e=>{setSkillId(e.target.value);setRun(false)}} required/></label><button className="primary-button" type="submit">Validate stored contract</button></form>{run&&data===undefined?<p role="status">Validating contract schema and digest…</p>:data&&<><div className="decision-line"><span>CONTRACT</span><strong>{data.valid?'VALID':'INVALID'}</strong></div><p>Revision {data.revision} · {data.inputFieldCount} input fields · {data.outputFieldCount} output fields</p><p>Digest: {data.digest}</p><ul>{data.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul><p className="muted-copy">Execution authorization is always false in this preview.</p></>}</ScopeAPanel>}
