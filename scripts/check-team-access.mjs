import {execFileSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const path='/tmp/nexus-step7-team-access-20261018.json'
const stage=process.env.TEAM_ACCEPTANCE_STAGE||'prepare'
const title='Step 7 controlled team QA 20261018-b4f1'
const memberEmail='e2e+team-step7-20261018-b4f1@e2e.macaly.dev'
function token(session){
 const raw=execFileSync('agent-browser',['--session',session,'eval','localStorage.getItem("__convexAuthJWT_httpsquickrabbit810euwest1convexcloud")'],{encoding:'utf8'})
 const value=raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
 if(!value)throw new Error('Fresh controlled Testing session required')
 return value
}
function client(session){
 const jwt=token(session)
 return async(kind,path,args)=>{
  const response=await fetch('https://quick-rabbit-810.eu-west-1.convex.cloud/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify({path,args,format:'json'}),signal:AbortSignal.timeout(15000)})
  const payload=await response.json()
  if(!response.ok||payload.status!=='success')throw new Error('Controlled request denied')
  return payload.value
 }
}
const owner=client('nf-step7-owner'),member=client('nf-step7-member')
async function denied(fn){try{await fn();return false}catch{return true}}
async function billing(call){const b=await call('query','billing:mine',{});if(b.mode!=='test')throw new Error('Testing billing mode required');return createHash('sha256').update(JSON.stringify([b.account,b.usage])).digest('hex')}
let report=stage==='prepare'?{version:'step7-team-access-v1',environment:'Testing',observedAt:new Date().toISOString(),passed:false}:JSON.parse(await readFile(path,'utf8'))
try{
 if(stage==='prepare'){
  const teams=await owner('query','forgeTeams:list',{}),others=await member('query','forgeTeams:list',{})
  if(teams.length>=20||teams.some(t=>t.name===title)||others.length)throw new Error('Fresh fixture scope not established')
  report.billingBefore={owner:await billing(owner),member:await billing(member)}
  const teamId=await owner('mutation','forgeTeams:create',{name:title})
  report.teamId=teamId
  await owner('mutation','forgeTeams:addNote',{teamId,text:'Step 7 controlled shared note b4f1'})
  const membershipId=await member('mutation','forgeTeams:requestJoin',{teamId})
  report.membershipId=membershipId
  const pendingDenied=await denied(()=>member('query','forgeTeams:detail',{teamId}))
  const detail=await owner('query','forgeTeams:detail',{teamId}),admin=detail.memberships.find(m=>m.role==='admin')
  const ownerProtected=await denied(()=>owner('mutation','forgeTeams:setMember',{teamId,membershipId:admin._id,role:'viewer',status:'revoked'}))
  await owner('mutation','forgeTeams:setMember',{teamId,membershipId,role:'viewer',status:'active'})
  const view=await member('query','forgeTeams:detail',{teamId})
  report.memberId=view.memberships[0]?.operatorId
  const viewerWriteDenied=await denied(()=>member('mutation','forgeTeams:addNote',{teamId,text:'This viewer write must be denied'}))
  const directoryDenied=await denied(()=>member('query','teamProvisioning:list',{teamId}))
  report={...report,pendingDenied,ownerProtected,viewerRead:view.role==='viewer'&&view.memberships.length===1&&view.notes.some(n=>n.text==='Step 7 controlled shared note b4f1'),viewerWriteDenied,directoryDenied,prepared:true}
 }else if(stage==='revoke'){
  if(!report.prepared||report.revoked)throw new Error('Review retained state before repeating')
  const {teamId,membershipId}=report,detail=await owner('query','forgeTeams:detail',{teamId})
  if(detail.team.name!==title||!detail.memberships.some(m=>m._id===membershipId&&m.operatorId===report.memberId))throw new Error('Fixture scope changed')
  await owner('mutation','forgeTeams:setMember',{teamId,membershipId,role:'contributor',status:'active'})
  await member('mutation','forgeTeams:addNote',{teamId,text:'Step 7 controlled contributor note b4f1'})
  report.contributorWrite=(await owner('query','forgeTeams:detail',{teamId})).notes.some(n=>n.text==='Step 7 controlled contributor note b4f1')
  await owner('mutation','teamProvisioning:provision',{teamId,entries:[{email:memberEmail,role:'contributor'}]})
  const grant=(await owner('query','teamProvisioning:list',{teamId})).find(g=>g.email===memberEmail&&g.operatorId===report.memberId)
  if(!grant)throw new Error('Verified grant not linked')
  report.grantId=grant._id
  await owner('mutation','teamProvisioning:revoke',{grantId:grant._id})
  report.revoked=true
  report.revokedReadDenied=await denied(()=>member('query','forgeTeams:detail',{teamId}))
  report.revokedWriteDenied=await denied(()=>member('mutation','forgeTeams:addNote',{teamId,text:'This revoked write must be denied'}))
  report.ownerStillAdmin=(await owner('query','forgeTeams:detail',{teamId})).role==='admin'
 }else if(stage==='verify'){
  if(!report.revoked)throw new Error('Revocation phase required')
  report.freshSignInDenied=await denied(()=>member('query','forgeTeams:detail',{teamId:report.teamId}))
  const membership=(await owner('query','forgeTeams:detail',{teamId:report.teamId})).memberships.find(m=>m._id===report.membershipId)
  report.membershipStillRevoked=membership?.status==='revoked'
  report.billingUnchanged=report.billingBefore.owner===await billing(owner)&&report.billingBefore.member===await billing(member)
  report.passed=['pendingDenied','ownerProtected','viewerRead','viewerWriteDenied','directoryDenied','contributorWrite','revokedReadDenied','revokedWriteDenied','ownerStillAdmin','freshSignInDenied','membershipStillRevoked','billingUnchanged'].every(key=>report[key]===true)
 }else throw new Error('Unknown acceptance stage')
}catch{report.error='Controlled acceptance incomplete; inspect retained IDs before further mutation. No automatic retry.'}
await writeFile(path,JSON.stringify(report,null,2),{mode:0o600})
console.log(JSON.stringify(report))
if(report.error||stage==='verify'&&!report.passed)process.exitCode=1
