import {Link} from '@tanstack/react-router'
import {pipelineFor} from '../lib/pipeline-guides'

export function PipelineGuide({path}:{path:string}){
 const guide=pipelineFor(path)
 if(!guide) return null
 return <section className="glass-card research-card pipeline-guide" aria-label="Pipeline steps for this workspace">
  <p className="section-kicker">THIS WORKSPACE · STEP-BY-STEP PIPELINE</p>
  <ol className="pipeline-steps">{guide.steps.map((step,i)=><li key={i}><strong>{i+1}. {step.title}</strong><span>{step.note}</span></li>)}</ol>
  <p className="pipeline-handoff">When this pipeline completes: <Link to={guide.handoff.path as never}>{guide.handoff.label} →</Link></p>
  {guide.couldAlso&&guide.couldAlso.length>0&&<div className="hero-actions">{guide.couldAlso.map(item=><Link key={item.path} className="ghost-button" to={item.path as never}>{item.label}</Link>)}</div>}
  <small>Steps describe the recorded sequence in this workspace only. Saving here never executes an external action, approves a gate automatically, or authorizes spending.</small>
 </section>
}
