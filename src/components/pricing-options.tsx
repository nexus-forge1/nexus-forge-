import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { tokenRates } from '../../convex/billingRates'
import { api } from '../../convex/_generated/api'

const pricingFaqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  'mainEntity': [
    {
      '@type': 'Question',
      'name': 'Is there a free plan or a free trial?',
      'acceptedAnswer': { '@type': 'Answer', 'text': 'No. NEXUS FORGE has no free plan and no free trial. Monthly subscriptions include usage credit, and prepaid usage credit purchases require no subscription. All prices are in USD.' },
    },
    {
      '@type': 'Question',
      'name': 'How is AI usage charged?',
      'acceptedAnswer': { '@type': 'Answer', 'text': 'Each model inference step reserves $1 of available usage credit. The final charge is twice the provider-reported dollar cost, or twice the published standard token-price calculation when no dollar cost is returned, rounded up to the nearest cent and capped at $1 per inference step. Unused reserved credit is returned.' },
    },
    {
      '@type': 'Question',
      'name': 'Are there automatic overage charges?',
      'acceptedAnswer': { '@type': 'Answer', 'text': 'No. There are no automatic overage charges, and AI execution pauses when available credit is insufficient.' },
    },
    {
      '@type': 'Question',
      'name': 'What happens to unused subscription credit?',
      'acceptedAnswer': { '@type': 'Answer', 'text': 'Monthly subscriptions renew until canceled. Included credit expires at the end of its billing period and does not become prepaid credit.' },
    },
  ],
}

export function PricingOptions() {
 const catalog=useQuery(api.billing.catalog,{})
 return <section className="workspace pricing-page" aria-label="Paid plans">
  <div className="workspace-head"><div><div className="section-kicker">NEXUS FORGE / PAID ACCESS</div><h1>Subscribe monthly. Or pay as you go.</h1></div></div>
  <p>No free plan. No free trial. Monthly subscriptions include usage credit; prepaid purchases require no subscription. All prices are in USD.</p>
  {catalog?.mode!=='live'&&<p role="status" className="receipt">TEST PAYMENTS · No real charges. Production AI cannot be funded with test purchases. Real payments require business activation in the Payments tab.</p>}
  {!catalog?<p role="status">Loading pricing…</p>:<div className="field-grid">{catalog.products.map((p:any)=><article className="glass-card research-card" key={p.sku}>
   <h2>{p.name}</h2><p><strong>${p.price}{p.recurring?' / month':' once'}</strong></p>
   <p>${p.credit} {p.recurring?'usage credit each paid billing period':'prepaid usage credit'}.</p>
   <p>{p.recurring?'Renews monthly until canceled. Included credit expires at the end of its billing period.':'No monthly subscription required. No automatic refill.'}</p>
   <Link className={p.sku==='pro'?'primary-button':'secondary-button'} to="/checkout" search={{product:p.sku}}>{p.recurring?'Subscribe to '+p.name:'Buy $'+p.price+' credit'}</Link>
  </article>)}</div>}
  <h2>How usage is charged</h2>
  <p>Each model inference step reserves $1 of available usage credit. An AI Council or workflow can contain several steps. The final charge is twice the provider-reported dollar cost, or twice the published standard token-price calculation below when no dollar cost is returned, rounded up to the nearest cent and capped at $1 per inference step. Unused reserved credit is returned; expired monthly credit does not become prepaid credit.</p>
  <div className="glass-card research-card"><h3>Standard token rates · October 17, 2026 snapshot</h3>{tokenRates.map(r=><p key={r.provider}>{r.provider} · {r.model}: ${r.input} per million input tokens / ${r.output} per million output tokens. <a href={r.source} target="_blank" rel="noreferrer">Provider pricing</a></p>)}<p>These are provider list-price bases before the 2× usage multiplier. Token-based billing does not claim to match our invoice, free quotas or negotiated discounts. Unknown models and incomplete token counts require review.</p></div>
  <p>Token counts alone do not establish invoiced dollar cost. Missing cost or interrupted accounting keeps the authorization on hold for billing review and can pause additional execution. Provider usage from failed attempts can count. Confirmed platform errors require a reviewed credit reversal.</p>
  <p>Provider health diagnostics are included for funded accounts with at least $1 available credit: one batch per ten minutes, up to twenty batches per UTC day. Diagnostic batches do not deduct usage credit.</p>
  <p>There are no automatic overage charges. AI pauses when credit is insufficient. Hosting, domains and separately billed external services are excluded. Existing governance and deployment approval requirements still apply.</p>
  <p>Subscriptions currently fund the purchasing operator's workspace. Shared team-seat allocation and enterprise contracts require separate setup; no enterprise SLA, unlimited usage or shared-seat entitlement is sold by this checkout.</p>
  <div className="hero-actions"><Link to="/billing" className="secondary-button">Account balance & billing →</Link><Link to="/" className="ghost-button">Return to NEXUS FORGE →</Link></div>
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingFaqJsonLd) }} />
 </section>
}
