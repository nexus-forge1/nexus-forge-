import {execFileSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const session='nf-step10-journey',reportPath='/tmp/nexus-step10-journey-20261018.json'
const browser=(...args)=>execFileSync('agent-browser',['--session',session,...args],{encoding:'utf8',timeout:45000})
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const phase=process.argv[2]
const names={'/':'Overview','/workflow':'Guided Workflow','/roadmap':'Master Roadmap','/manifest':'Manifest Intelligence','/orchestrator':'Intelligence Orchestrator','/mission':'Mission Console','/council':'AI Council','/evidence':'Research & Memory','/artifacts':'Artifact Forge','/delivery':'Delivery Pipeline','/portfolio':'Portfolio Intelligence','/learning':'Verified Learning Engine','/resilience':'Security & Resilience','/teams':'Team Governance','/developers':'Developer Integrations','/comparisons':'Comparative Validation','/science':'Scientific Experiments','/generality':'Generality Research','/providers':'AI Providers','/readiness':'Launch Readiness','/capabilities':'Capability & Reliability','/incidents':'Incident Center'}
const headings={...names,'/':'Mission Overview','/workflow':'Guided Workflow & Feature Guide','/roadmap':'Project roadmap','/council':'AI Council Workspace','/providers':'AI Provider Health','/readiness':'Launch Readiness Checker'}
function clickObserved(name,support=false){
 const snapshot=browser('snapshot','-i')
 const line=snapshot.split('\n').find(line=>line.includes('link "')&&line.includes(support?name+' →"':' '+name+'"'))
 const ref=line?.match(/\[ref=(e\d+)\]/)?.[1]
 if(!ref)throw Error('Observed navigation link missing: '+name)
 browser('click','@'+ref)
 browser('wait','400')
}
if(phase==='before'||phase==='after'){
 const raw=browser('eval','localStorage.getItem("__convexAuthJWT_httpsquickrabbit810euwest1convexcloud")')
 const token=raw.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0]
 if(!token)throw Error('Fresh controlled session required')
 async function call(path,args){
  const r=await fetch('https://quick-rabbit-810.eu-west-1.convex.cloud/api/query',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({path,args,format:'json'}),signal:AbortSignal.timeout(15000)}),p=await r.json()
  if(!r.ok||p.status!=='success')throw Error('Controlled query failed: '+path)
  return p.value
 }
 const billing=await call('billing:mine',{})
 if(billing.mode!=='test')throw Error('Testing identity required')
 const missions=await call('missions:list',{ownerKey:'local-workspace',paginationOpts:{numItems:100,cursor:null}})
 if(!missions.isDone)throw Error('Complete existing mission scope required')
 const titles=['Step 10 journey alpha 20261018-c6e2','Step 10 journey beta 20261018-c6e2']
 if(phase==='before'){
  if(missions.page.some(row=>titles.includes(row.title)))throw Error('Fixture already exists')
  await writeFile(reportPath,JSON.stringify({version:'step10-user-journey-v1',environment:'Testing',observedAt:new Date().toISOString(),billingBefore:hash(billing),existingMissions:missions.page.map(row=>({id:row._id,hash:hash(row)})),routes:[],passed:false},null,2))
  console.log(JSON.stringify({freshFixtureTitlesVerifiedAbsent:true,existingMissionCount:missions.page.length,testBilling:true}))
 }else{
  const report=JSON.parse(await readFile(reportPath,'utf8'))
  const fixtures=missions.page.filter(row=>titles.includes(row.title))
  if(fixtures.length!==2)throw Error('Expected two controlled UI drafts')
  for(const old of report.existingMissions){if(hash(missions.page.find(row=>row._id===old.id))!==old.hash)throw Error('Existing mission changed')}
  report.fixtures=[]
  for(const row of fixtures){
   if(row.budget!==0)throw Error('Zero budget fixture required')
   const runs=await call('forge:listRuns',{missionId:row._id}),artifacts=await call('artifacts:list',{missionId:row._id}),deliveries=await call('delivery:list',{missionId:row._id})
   if(runs.length||artifacts.length||deliveries.length)throw Error('Unexpected execution')
   report.fixtures.push({id:row._id,title:row.title,status:row.status,approved:row.approved,budget:row.budget,noExecution:true})
  }
  report.billingUnchanged=hash(billing)===report.billingBefore
  if(!report.billingUnchanged)throw Error('Billing changed')
  report.existingMissionsUnchanged=true
  await writeFile(reportPath,JSON.stringify(report,null,2))
  console.log(JSON.stringify({fixtures:report.fixtures,billingUnchanged:true,existingMissionsUnchanged:true}))
 }
}else if(phase==='routes'){
 const paths=JSON.parse(process.argv[3])
 const report=JSON.parse(await readFile(reportPath,'utf8'))
 for(const path of paths){
  // Only known internal navigation links are clicked; never submit page controls.
  if(['/providers','/readiness','/capabilities','/incidents'].includes(path)){
   clickObserved(names['/workflow'])
   browser('wait','#full-platform-tour')
   clickObserved(names[path],true)
  }else clickObserved(names[path])
  browser('wait','#workspace-controls')
  const source='(async()=>{for(let i=0;i<80;i++){if(location.pathname==='+JSON.stringify(path)+'&&document.querySelector("h1")?.textContent==='+JSON.stringify(headings[path])+'&&!document.querySelector("[aria-busy=true]")&&!document.querySelector("[data-state=loading]")&&!document.querySelector(".workspace-context-next").textContent.includes("LOADING MISSION"))break;await new Promise(r=>setTimeout(r,100))}const visible=e=>e.getClientRects().length>0;const anchors=[...document.querySelectorAll("#workspace-controls a[href^=\\\"#\\\"]")].filter(visible);return JSON.stringify({path:location.pathname,heading:document.querySelector("h1")?.textContent,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,loading:!!document.querySelector("[aria-busy=true],[data-state=loading]"),missingAnchors:anchors.map(a=>a.getAttribute("href")).filter(h=>h.length>1&&!document.getElementById(decodeURIComponent(h.slice(1)))),errorBoundary:/Something went wrong|Application error|Uncaught Error/.test(document.body.innerText),guide:document.querySelector(".workspace-context-next")?.textContent})})()'
  const raw=browser('eval',source)
  const match=raw.match(/"(?:[^"\\]|\\.)*"/s)
  if(!match)throw Error('Missing browser audit')
  const row=JSON.parse(JSON.parse(match[0]))
  report.routes.push(row)
  await writeFile(reportPath,JSON.stringify(report,null,2))
  console.log(JSON.stringify(row))
  if(row.path!==path||row.heading!==headings[path]||row.loading||row.missingAnchors.length||row.errorBoundary||row.scrollWidth>row.viewport+1)throw Error('Route audit failed: '+path)
 }
}else if(phase==='selection'){
 const report=JSON.parse(await readFile(reportPath,'utf8'))
 clickObserved(names['/mission'])
 function choose(title){
  const line=browser('snapshot','-i').split('\n').find(line=>line.includes('button "'+title+' '))
  const ref=line?.match(/\[ref=(e\d+)\]/)?.[1]
  if(!ref)throw Error('Owned fixture button missing')
  browser('click','@'+ref);browser('wait','600')
 }
 const alpha='Step 10 journey alpha 20261018-c6e2',beta='Step 10 journey beta 20261018-c6e2'
 choose(alpha)
 const alphaContract=browser('get','text','#active-mission-contract'),alphaGuide=browser('get','text','.workspace-context-next')
 if(!alphaContract.includes(alpha)||!alphaContract.includes('RUNNING')||alphaContract.includes(beta)||!alphaGuide.includes('Complete AI Council planning'))throw Error('Alpha selection isolation failed')
 clickObserved('Continue next mission action',true)
 if(!browser('get','text','h1').includes('AI Council Workspace'))throw Error('Next mission action did not open Council')
 if(!browser('get','text','.workspace-context-next').includes(alpha))throw Error('Mission context lost in Council')
 clickObserved(names['/mission']);choose(beta)
 const betaContract=browser('get','text','#active-mission-contract')
 if(!betaContract.includes(beta)||!betaContract.includes('DRAFT')||betaContract.includes(alpha))throw Error('Beta selection isolation failed')
 browser('reload');browser('wait','#active-mission-contract');browser('wait','600')
 if(!browser('get','text','#active-mission-contract').includes(beta))throw Error('Selection did not persist on reload')
 report.selection={alphaApprovedWithoutExecution:true,betaUnapproved:true,isolatedContracts:true,nextActionOpenedCouncil:true,betaPersistedAfterReload:true}
 await writeFile(reportPath,JSON.stringify(report,null,2))
 console.log(JSON.stringify(report.selection))
}else if(phase==='stale'){
 const report=JSON.parse(await readFile(reportPath,'utf8'))
 browser('eval','sessionStorage.setItem("nexus-forge-active-mission","step10-invalid-mission-selection");window.dispatchEvent(new Event("nexus-active-mission-changed"));true')
 let recovered=false
 for(let i=0;i<10;i++){browser('wait','200');const text=browser('get','text','#active-mission-contract');if(text.includes('NOT SELECTED')){recovered=true;break}}
 if(!recovered||!browser('get','text','.workspace-context-next').includes('START YOUR MISSION'))throw Error('Malformed selection did not recover')
 const errors=browser('errors')
 if(errors.trim())throw Error('Browser reported uncaught errors')
 report.staleSelectionRecovered=true;report.uncaughtBrowserErrors=[]
 await writeFile(reportPath,JSON.stringify(report,null,2))
 console.log(JSON.stringify({staleSelectionRecovered:true,emptyMissionGuideRestored:true,uncaughtBrowserErrors:[]}))
}else throw Error('Expected before, after, routes, selection or stale phase')
