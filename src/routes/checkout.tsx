import { routeHead } from '../lib/route-metadata'
import { useCallback,useEffect,useMemo,useState } from 'react'
import { createFileRoute,Link } from '@tanstack/react-router'
import { useAction } from 'convex/react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider,EmbeddedCheckout } from '@stripe/react-stripe-js'
import { api } from '../../convex/_generated/api'
import { AuthWrapper } from '../components/auth-wrapper'
export const Route=createFileRoute('/checkout')({ head: () => routeHead("/checkout"),validateSearch:(search:Record<string,unknown>)=>({product:typeof search.product==='string'?search.product:''}),component:Checkout})
function Content(){
 const {product}=Route.useSearch(),create=useAction(api.payments.checkout)
 const [requestKey,setRequestKey]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false)
 const key=import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
 const stripe=useMemo(()=>key?loadStripe(key):null,[key])
 useEffect(()=>{const name='nexus-checkout-'+product;let value=sessionStorage.getItem(name);if(!value){value=crypto.randomUUID();sessionStorage.setItem(name,value)}setRequestKey(value)},[product])
 const fetchClientSecret=useCallback(async()=>{
  try{return (await create({sku:product,requestKey})).clientSecret}
  catch(e){setError(e instanceof Error?e.message:'Checkout unavailable');throw e}
 },[create,product,requestKey])
 return <main className="nexus-shell min-h-screen"><section className="workspace"><h1>Secure checkout</h1>
 {import.meta.env.VITE_STRIPE_MODE!=='live'&&<p role="status">TEST PAYMENTS · No real charge. Test purchases do not fund production AI.</p>}
 <p>Your account receives credit only after the server verifies payment. No free trial or automatic prepaid refill.</p>
 {complete?<p role="status">Checkout completed. Waiting for verified payment fulfillment; check your Billing balance before executing paid work.</p>:!stripe?<p role="alert">Payments are not configured yet.</p>:requestKey&&product&&<EmbeddedCheckoutProvider key={product} stripe={stripe} options={{fetchClientSecret,onComplete:()=>{setComplete(true);sessionStorage.removeItem('nexus-checkout-'+product)}}}><EmbeddedCheckout/></EmbeddedCheckoutProvider>}
 {error&&<p role="alert">{error}. If this checkout expired, return to pricing and start a fresh checkout.</p>}
 <div className="hero-actions"><Link to="/billing" className="secondary-button">Check account balance →</Link><Link to="/pricing" className="ghost-button" onClick={()=>sessionStorage.removeItem('nexus-checkout-'+product)}>Return to pricing</Link></div>
 </section></main>
}
function Checkout(){return <AuthWrapper><Content/></AuthWrapper>}
