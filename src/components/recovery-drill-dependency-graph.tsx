import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

type Dependency={key:string;dependsOn:string[]}
export function RecoveryDrillDependencyGraph(){
 const [dependenciesText,setDependenciesText]=useState('[{"key":"application","dependsOn":["database"]},{"key":"database","dependsOn":["backup"]},{"key":"backup","dependsOn":[]}]')
 const [requestKey,setRequestKey]=useState('request-recovery-001');const [drillKey,setDrillKey]=useState('recovery-drill-001');const [recoveryPoint,setRecoveryPoint]=useState('backup-restore-point-001');const [expectedDigest,setExpectedDigest]=useState('expected-digest-001');const [observedDigest,setObservedDigest]=useState('expected-digest-001')
 const [outcome,setOutcome]=useState<'passed'|'failed'>('failed');const [evidence,setEvidence]=useState('Rehearsal evidence must be attached before approval.')
 const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('')
 const dependencies=useMemo<Dependency[]>(()=>{try{const x=JSON.parse(dependenciesText);return Array.isArray(x)?x.filter(v=>v&&typeof v.key==='string'&&Array.isArray(v.dependsOn)&&v.dependsOn.every((d:unknown)=>typeof d==='string')):[]}catch{return []}},[dependenciesText])
 const order=useQuery(api.scopeDFunctionsBatchTwo.resolveRecoveryDependencyOrder,{dependencies})
 const verify=useMutation(api.scopeDFunctionsBatchTwo.verifyRecoveryPoint)
 const rehearse=useMutation(api.scopeDFunctionsBatchTwo.logRecoveryDrillRehearsal)
 const run=async(task:()=>Promise<unknown>,label:string)=>{setBusy(true);setNotice('');try{setNotice(label+': '+JSON.stringify(await task()))}catch(e){setNotice(e instanceof Error?e.message:'Operation failed')}finally{setBusy(false)}}
 return <section className="dashboard-section" aria-labelledby="d34-title"><div className="glass-card research-card"><p className="section-kicker">SCOPE D · D34</p><h2 id="d34-title">Recovery drill dependency graph</h2><p>Validate recovery order and record rehearsal evidence. No restore, rollback, or infrastructure action is executed.</p>
 <label>Dependencies (JSON array of key/dependsOn objects)<textarea rows={5} value={dependenciesText} onChange={e=>setDependenciesText(e.target.value)}/></label><h3>Dependency order</h3>{order===undefined?'Resolving recovery dependency order…':<p role="status">Order: {order.order.join(' → ')||'none'}</p>}
 <label>Request key<input value={requestKey} onChange={e=>setRequestKey(e.target.value)}/></label><label>Drill key<input value={drillKey} onChange={e=>setDrillKey(e.target.value)}/></label><label>Recovery point identifier<input value={recoveryPoint} onChange={e=>setRecoveryPoint(e.target.value)}/></label><label>Expected digest<input value={expectedDigest} onChange={e=>setExpectedDigest(e.target.value)}/></label><label>Observed digest<input value={observedDigest} onChange={e=>setObservedDigest(e.target.value)}/></label>
 <button className="primary-button" disabled={busy||!requestKey.trim()||!drillKey.trim()||!recoveryPoint.trim()||!expectedDigest.trim()||!observedDigest.trim()} onClick={()=>void run(()=>verify({requestKey,drillKey,recoveryPoint,expectedDigest,observedDigest}),'Recovery point verification')}>Record recovery point verification</button>
 <label>Rehearsal outcome<select value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)}><option value="failed">Failed / not yet verified</option><option value="passed">Passed</option></select></label><label>Rehearsal evidence<textarea rows={3} value={evidence} onChange={e=>setEvidence(e.target.value)}/></label>
 <button className="primary-button" disabled={busy||!drillKey.trim()||!evidence.trim()||!dependencies.length} onClick={()=>void run(()=>rehearse({drillKey,dependencies,outcome,rehearsalEvidence:evidence}),'Recovery rehearsal')}>Record rehearsal</button>{notice&&<p role="status" aria-live="polite">{notice}</p>}</div></section>
}