import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

type Pair={key:string;value:string}
const parsePairs=(text:string):Pair[]=>{try{const value=JSON.parse(text);return Array.isArray(value)?value.filter(x=>x&&typeof x.key==='string'&&typeof x.value==='string').map(x=>({key:x.key,value:x.value})):[]}catch{return []}}
export function DeploymentCompatibilityMatrix(){
 const [runtime,setRuntime]=useState('tanstack-start-server')
 const [requiredText,setRequiredText]=useState('["server-functions","convex-connectivity","secret-management"]')
 const [availableText,setAvailableText]=useState('["server-functions","convex-connectivity","secret-management"]')
 const [manifestText,setManifestText]=useState('[{"key":"VITE_CONVEX_URL","value":"env:VITE_CONVEX_URL","sensitive":true},{"key":"APP_MODE","value":"production","sensitive":false}]')
 const [sourceText,setSourceText]=useState('[{"key":"APP_MODE","value":"staging"},{"key":"VITE_CONVEX_URL","value":"env:VITE_CONVEX_URL"}]')
 const [targetText,setTargetText]=useState('[{"key":"APP_MODE","value":"production"},{"key":"VITE_CONVEX_URL","value":"env:VITE_CONVEX_URL"}]')
 const required=useMemo(()=>{try{const x=JSON.parse(requiredText);return Array.isArray(x)?x.filter(v=>typeof v==='string'):[]}catch{return []}},[requiredText])
 const available=useMemo(()=>{try{const x=JSON.parse(availableText);return Array.isArray(x)?x.filter(v=>typeof v==='string'):[]}catch{return []}},[availableText])
 const manifest=useMemo(()=>{try{const x=JSON.parse(manifestText);return Array.isArray(x)?x.filter(v=>v&&typeof v.key==='string'&&typeof v.value==='string').map(v=>({key:v.key,value:v.value,sensitive:Boolean(v.sensitive)})):[]}catch{return []}},[manifestText])
 const source=parsePairs(sourceText),target=parsePairs(targetText)
 const compatibility=useQuery(api.scopeDFunctionsBatchTwo.evaluateRuntimeCompatibility,{runtime,requiredFeatures:required,availableFeatures:available})
 const manifestResult=useQuery(api.scopeDFunctionsBatchTwo.validateDeploymentManifest,{manifest})
 const differences=useQuery(api.scopeDFunctionsBatchTwo.generateEnvironmentDifference,{source,target})
 return <section className="dashboard-section" aria-labelledby="d30-title"><div className="glass-card research-card"><p className="section-kicker">SCOPE D · D30</p><h2 id="d30-title">Deployment compatibility matrix</h2><p>Static planning checks only; no provider verification, deployment, or environment mutation is performed.</p>
 <label>Runtime identifier<input value={runtime} onChange={e=>setRuntime(e.target.value)}/></label>
 <label>Required features (JSON string array)<textarea rows={3} value={requiredText} onChange={e=>setRequiredText(e.target.value)}/></label><label>Available features (JSON string array)<textarea rows={3} value={availableText} onChange={e=>setAvailableText(e.target.value)}/></label>
 <h3>Runtime compatibility</h3>{compatibility===undefined?'Loading compatibility…':<p role="status">{compatibility.compatible?'Compatible planning profile':'Missing: '+compatibility.missingFeatures.join(', ')}</p>}
 <label>Deployment manifest (JSON array of key/value/sensitive objects)<textarea rows={5} value={manifestText} onChange={e=>setManifestText(e.target.value)}/></label><h3>Manifest validation</h3>{manifestResult===undefined?'Validating manifest…':<><p role="status">{manifestResult.valid?'Manifest is structurally valid':'Manifest issues: '+manifestResult.errors.join('; ')}</p><pre>{JSON.stringify(manifestResult.masked,null,2)}</pre></>}
 <label>Source environment values (JSON key/value array)<textarea rows={4} value={sourceText} onChange={e=>setSourceText(e.target.value)}/></label><label>Target environment values (JSON key/value array)<textarea rows={4} value={targetText} onChange={e=>setTargetText(e.target.value)}/></label><h3>Environment difference</h3>{differences===undefined?'Comparing environment keys…':<p role="status">{differences.count} differences: {differences.differences.map(d=>d.key).join(', ')||'none'}</p>}
 </div></section>
}