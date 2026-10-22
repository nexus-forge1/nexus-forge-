import {Link} from '@tanstack/react-router'
import {expansionCatalog,starterPaths} from '../lib/expansion-catalog'
export function StudioGuide({path}:{path:string}){
 const pages=starterPaths.map(p=>expansionCatalog.find(f=>f.path===p)!),i=pages.findIndex(p=>p.path===path),next=pages[i+1]
 return <section className="glass-card research-card" aria-label="Product studio guide"><p className="section-kicker">PRODUCT STUDIO · {i>=0?i+1:0}/{pages.length} TOOLS</p><p>{pages[i]?.acceptance??'Track all 36 requested additions and their implementation boundaries.'}</p><div className="hero-actions"><Link className="secondary-button small" to="/expansion">36-feature build checklist →</Link>{next?<Link className="primary-button small" to={next.path as any}>Next: {next.title} →</Link>:<Link className="primary-button small" to="/mission">Continue with mission approval →</Link>}</div><small>These tools extend the existing 16-page operating guide. Saving a plan does not execute a build or authorize spending.</small></section>
}
