import {createRequire} from 'node:module'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {artifactCoverage} from './fixtures/artifact-coverage.ts'
import {buildArtifactTestDocument} from '../src/lib/artifact-test-runner.ts'
import {artifactFilename,downloadArtifact} from '../src/lib/artifact-download.ts'
const require=createRequire(process.env.NEXUS_BROWSER_PACKAGE+'/package.json')
const {chromium}=require('playwright')
const reportPath=process.env.ARTIFACT_COVERAGE_REPORT||'/tmp/nexus-artifact-coverage.json'
const browser=await chromium.launch({headless:true})
const report={version:'artifact-coverage-v1',observedAt:new Date().toISOString(),browser:browser.version(),scope:'Authored standalone HTML fixtures only; no provider calls or external services',cases:[]}
let failed=false
try{
 for(const fixture of artifactCoverage){
  for(const width of [390,1280]){
   const context=await browser.newContext({viewport:{width,height:800},acceptDownloads:true,serviceWorkers:'block'})
   await context.route('**/*',route=>route.request().url()==='https://artifact-fixture.invalid/'?route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}):route.abort())
   const result={id:fixture.id,width,passed:false}
   try{
    const page=await context.newPage()
    await page.goto('https://artifact-fixture.invalid/')
    await page.setContent('<iframe sandbox="allow-scripts"></iframe>')
    const execute=async content=>{
     const nonce='coverage-'+fixture.id+'-'+width+'-'+Math.random()
     const html=buildArtifactTestDocument(content,fixture.plan,nonce)
     return await page.evaluate(({html,nonce})=>new Promise((resolve,reject)=>{
      const frame=document.querySelector('iframe')
      const listener=event=>{
       if(event.source===frame.contentWindow&&event.data?.nonce===nonce&&event.data?.type==='nexus-artifact-tests'){
        clearTimeout(timer);window.removeEventListener('message',listener);resolve(event.data.results)
       }
      }
      const timer=setTimeout(()=>{window.removeEventListener('message',listener);reject(new Error('No harness result'))},10000)
      window.addEventListener('message',listener);frame.srcdoc=html
     }),{html,nonce})
    }
    result.steps=await execute(fixture.content)
    const exact=result.steps.length===fixture.plan.length&&result.steps.every((steps,i)=>steps.length===fixture.plan[i].steps.length&&steps.every(step=>step.status==='pass'))
    const broken=fixture.id==='interactive-calculator'?fixture.content.replace('value)*2','value)*20'):fixture.id==='finished-campaign'?fixture.content.replace('Neighborhood residents planning seasonal fruit purchases.','Empty copy'):fixture.content.replace('count:0','count:1')
    const negative=await execute(broken)
    result.negativeControlDetected=negative.flat().some(step=>step.status==='fail')
    await page.setContent(fixture.content)
    result.mobileContained=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)
    // Test the actual production download function on these controlled source bytes.
    await page.addScriptTag({content:artifactFilename.toString()+'\n'+downloadArtifact.toString()})
    const [download,receipt]=await Promise.all([page.waitForEvent('download',{timeout:5000}),page.evaluate(async ({id,content})=>await downloadArtifact(id,content),{id:fixture.id,content:fixture.content})])
    const bytes=await readFile(await download.path())
    result.htmlDownload={filename:download.suggestedFilename(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}
    const same=bytes.equals(Buffer.from(fixture.content,'utf8'))&&receipt.sha256===result.htmlDownload.sha256&&receipt.bytes===bytes.length&&download.suggestedFilename()===artifactFilename(fixture.id)
    result.jsonDownload=true
    if(fixture.download){
     await page.fill('#label','Café 🚀');await page.click('#run')
     const [json]=await Promise.all([page.waitForEvent('download',{timeout:5000}),page.click('#export')])
     const payload=JSON.parse(await readFile(await json.path(),'utf8'))
     result.jsonDownload=json.suggestedFilename()===fixture.download.filename&&JSON.stringify(payload)===JSON.stringify(fixture.download.payload)
    }
    result.passed=exact&&result.negativeControlDetected&&result.mobileContained&&same&&result.jsonDownload
   }catch(error){result.error=String(error.message||error).slice(0,600)}
   finally{await context.close()}
   report.cases.push(result);if(!result.passed)failed=true
  }
 }
}finally{
 await browser.close()
 report.passed=!failed&&report.cases.length===6
 await writeFile(reportPath,JSON.stringify(report,null,2))
}
console.log(JSON.stringify({reportPath,passed:report.passed,cases:report.cases.map(({id,width,passed,error})=>({id,width,passed,error}))}))
if(!report.passed)process.exitCode=1
