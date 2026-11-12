import {ConvexError} from 'convex/values'
import {featureSources,type SourceFile} from './featurePackSources'
import {digest} from './studioModel'
import {canonical} from './evaluationModel'
import {defaultVisual,visualScope,visualCss,type VisualConfig} from '../src/lib/visual-task-contract'
export type VisualPack={version:string;feature:{key:string;title:string;revision:number};contract:{version:string;productionReady:boolean;targetIntegrationVerified:boolean};files:Array<SourceFile&{sha256:string}>;[key:string]:unknown}
export async function auditVisualSource(snapshot:string,expectedDigest:string){
 if(await digest(snapshot)!==expectedDigest)throw new ConvexError('Feature source digest mismatch')
 const p=JSON.parse(snapshot) as VisualPack
 if(p.version!=='feature-source-package-v1'||p.contract?.version!=='private-task-pack-v1'||p.contract.productionReady!==false||p.contract.targetIntegrationVerified!==false)throw new ConvexError('Only the exact supported private task source pack can be edited')
 const expected=featureSources(p.feature.key,p.feature.title)
 if(!Array.isArray(p.files)||p.files.length!==expected.length)throw new ConvexError('Unsupported source file set')
 for(let i=0;i<expected.length;i++){const a=p.files[i],b=expected[i];if(a.path!==b.path||a.content!==b.content||a.sha256!==await digest(a.content))throw new ConvexError('Source changed or template is unsupported; inspect the exact feature package')}
 return p
}
function replaceOnce(source:string,needle:string,replacement:string){const first=source.indexOf(needle);if(first<0||source.indexOf(needle,first+needle.length)>=0)throw new ConvexError('Supported component anchor changed');return source.slice(0,first)+replacement+source.slice(first+needle.length)}
export async function visualPackage(base:VisualPack,sourceDigest:string,config:VisualConfig,revision:number){
 const key=base.feature.key,scope=visualScope(key),module='feature_'+key.replaceAll('-','_'),cssPath='src/components/'+module+'.visual.css',componentPath='src/components/'+module+'.tsx',old=base.files.find(f=>f.path===componentPath)
 if(!old)throw new ConvexError('Supported component unavailable')
 let component=replaceOnce(old.content,'className="dashboard-section"','className="dashboard-section '+scope+'"')
 component=replaceOnce(component,'<h2>{'+JSON.stringify(base.feature.title)+'}</h2>','<h2>{'+JSON.stringify(config.heading)+'}</h2>')
 component=replaceOnce(component,'className="primary-button" disabled={busy||rows===undefined}>Create task</button>','className="'+config.buttonStyle+'-button" disabled={busy||rows===undefined}>{'+JSON.stringify(config.buttonLabel)+'}</button>')
 component=replaceOnce(component,':rows.map(r=><TaskRow key={r._id} r={r}/>)',':<div className="visual-task-grid">{rows.map(r=><TaskRow key={r._id} r={r}/>)}</div>')
 component="import './"+module+".visual.css'\n"+component
 const css=visualCss(scope,config),files=await Promise.all([...base.files.map(f=>({path:f.path,content:f.path===componentPath?component:f.content})),{path:cssPath,content:css}].map(async f=>({...f,sha256:await digest(f.content)})))
 for(const f of base.files.filter(f=>f.path!==componentPath)){const next=files.find(n=>n.path===f.path);if(!next||next.content!==f.content||next.sha256!==f.sha256)throw new ConvexError('Protected source changed')}
 const snapshot=canonical({...base,version:'visual-feature-package-v1',visual:{contract:'visual-task-edit-v1',revision,sourceDigest,config,scope,defaultConfig:defaultVisual(base.feature.title)},files,integration:'Uninstalled visual source revision. Native preview is a supported layout model with read-only preview data, not target installation or pixel-parity proof. API, permissions, schema, tests, route, metadata and recovery instructions remain exact.'})
 if(new TextEncoder().encode(snapshot).length>160*1024)throw new ConvexError('Visual package exceeds 160 KiB')
 const changed=files.filter(f=>base.files.find(b=>b.path===f.path)?.sha256!==f.sha256).map(f=>{const before=base.files.find(b=>b.path===f.path)?.content??'',a=before.split('\n'),b=f.content.split('\n'),lines=Array.from({length:Math.max(a.length,b.length)},(_,i)=>({line:i+1,before:a[i]??'',after:b[i]??''})).filter(r=>r.before!==r.after);return{path:f.path,kind:before?'modified':'added',beforeSha:base.files.find(b=>b.path===f.path)?.sha256??null,afterSha:f.sha256,totalChangedLines:lines.length,lines:lines.slice(0,80)}})
 return{snapshot,packageDigest:await digest(snapshot),diff:canonical({basis:'exact frozen feature source',changed,protectedFiles:base.files.filter(f=>f.path!==componentPath).map(f=>({path:f.path,sha256:f.sha256})),note:'Positional line comparison, capped at 80 changed lines per file. No target repository was edited.'})}
}
