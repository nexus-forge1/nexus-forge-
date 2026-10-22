import { routeHead } from '../lib/route-metadata'
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction,useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { WorkspaceLayout } from '../components/workspace-layout'
import { PricingOptions } from '../components/pricing-options'
export const Route=createFileRoute('/billing')({ head: () => routeHead("/billing"),component:Billing})
function Account(){
 const mine=useQuery(api.billing.mine,{}),portal=useAction(api.payments.portal),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const money=(n:number)=>'$'+(n/100).toFixed(2)
 return <section className="workspace"><div className="glass-card research-card"><h2>Your billing account</h2>
 {!mine?<p role="status">Loading balance…</p>:<>
 <p>Mode: <strong>{mine.mode==='live'?'Real payments':mine.mode==='test'?'Test payments · no real charges':'Payments awaiting activation'}</strong></p>
 <p>Prepaid: {money(mine.account?.prepaid??0)} · Available monthly credit: {money(mine.account?.included??0)} · Reserved: {money(mine.account?.held??0)}</p>
 <p>Plan: {mine.account?.plan??'No subscription'} · Status: {mine.account?.subscriptionStatus??'No paid subscription'}</p>
 {(mine.account?.cancelAtPeriodEnd||!!mine.account?.cancelAt)&&<p role="status">Cancellation scheduled. Your subscription ends {new Date(mine.account.cancelAt||mine.account.expiresAt).toLocaleDateString()}.</p>}
 {!!mine.account?.unresolved&&<p role="alert">Usage cost requires billing review. New AI execution is paused; reserved funds have not been finalized as charges.</p>}
 {mine.account?.frozen&&<p role="alert">Billing is frozen pending refund review.</p>}
 <button className="secondary-button" disabled={busy||!mine.receipts.length} onClick={async()=>{
  setBusy(true);setError('')
  const tab=window.open('about:blank','_blank')
  try{const {url}=await portal({});if(tab)tab.location.href=url;else setError('Allow pop-ups to open payment management.')}
  catch(e){tab?.close();setError(e instanceof Error?e.message:'Could not open billing management')}
  finally{setBusy(false)}
 }}>Manage subscription & payment method</button>
 <h3>Recent AI usage</h3>
 {mine.usage.length===0?<p>No paid AI usage recorded.</p>:mine.usage.map((u:any)=><p key={u._id}>{u.status==='settled'?money(u.charged??0)+' charged':money(u.reserved)+' reserved · '+u.status} · {new Date(u.createdAt).toLocaleDateString()}{u.costBasis&&<> · Cost basis: {u.costBasis}</>}</p>)}
 <h3>Recent paid receipts</h3>
 {mine.receipts.length===0?<p>No verified payments yet. A checkout success screen alone does not grant credit.</p>:mine.receipts.map((r:any)=><p key={r._id}>{r.sku} · {money(r.paidCents)} · {new Date(r.createdAt).toLocaleDateString()}{r.invoiceUrl&&<> · <a href={r.invoiceUrl} target="_blank" rel="noreferrer">Invoice</a></>}</p>)}
 </>}
 {error&&<p role="alert">{error}</p>}
 </div></section>
}
function Billing(){return <WorkspaceLayout title="Plans & Billing" eyebrow="ACCOUNT / PAID ACCESS"><Account/><PricingOptions/></WorkspaceLayout>}
