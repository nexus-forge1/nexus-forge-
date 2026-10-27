import {useAuthActions} from '@convex-dev/auth/react'
import {useEffect,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {useQuery} from 'convex/react'
import {ArrowRight,ArrowUpRight,Check,Command,KeyRound,Layers3,Mail,ShieldCheck,Sparkles} from 'lucide-react'
import {api} from '../../convex/_generated/api'
import '@/components/welcome.css'

export function SignInForm(){
 const {signIn}=useAuthActions(),options=useQuery(api.signInOptions.available,{})
 const [mode,setMode]=useState<'signin'|'signup'>('signin'),[step,setStep]=useState<'email'|'code'>('email')
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState('')
 const [loading,setLoading]=useState(false),[resendIn,setResendIn]=useState(0)
 const pending=useRef(false),codeInput=useRef<HTMLInputElement>(null),emailInput=useRef<HTMLInputElement>(null),previousStep=useRef(step),resendUntil=useRef(0)
 useEffect(()=>{if(step==='code'&&!loading)codeInput.current?.focus();else if(step==='email'&&previousStep.current==='code')emailInput.current?.focus();previousStep.current=step},[step,loading])
 useEffect(()=>{
  if(step!=='code'||resendIn<=0)return
  const update=()=>setResendIn(Math.max(0,Math.ceil((resendUntil.current-Date.now())/1000)))
  const timer=window.setInterval(update,1000)
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',update)
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update)}
 },[step,resendIn])
 function beginCooldown(){resendUntil.current=Date.now()+30000;setResendIn(30)}
 async function requestCode(){
  const form=new FormData();form.set('email',email.trim().toLowerCase());await signIn('resend-otp',form)
 }
 async function submitEmail(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;pending.current=true;setError(null);setNotice('');setLoading(true)
  try{await requestCode();setEmail(email.trim().toLowerCase());setCode('');beginCooldown();setStep('code')}
  catch{setError('We couldn’t send a code. Check your email address and try again.')}
  finally{pending.current=false;setLoading(false)}
 }
 async function submitCode(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;const form=new FormData(event.currentTarget);pending.current=true;setError(null);setNotice('');setLoading(true)
  try{await signIn('resend-otp',form)}
  catch{setError('That code is invalid or expired. Check the latest email or request a new code.');codeInput.current?.focus()}
  finally{pending.current=false;setLoading(false)}
 }
 async function resend(){
  if(pending.current||resendIn>0)return;pending.current=true;setLoading(true);setError(null);setNotice('')
  try{await requestCode();setCode('');beginCooldown();setNotice('A new code is on its way. Use the latest email.');codeInput.current?.focus()}
  catch{setError('We couldn’t send another code. Wait a moment, then try again.');beginCooldown()}
  finally{pending.current=false;setLoading(false)}
 }
 async function workspace(){
  if(pending.current)return;pending.current=true;setLoading(true);setError(null)
  try{await signIn('google',{redirectTo:'/'})}
  catch{setError('Workspace sign-in could not be completed. Try again or continue with email.')}
  finally{pending.current=false;setLoading(false)}
 }
 function switchMode(next:'signin'|'signup'){setMode(next);setError(null);setNotice('')}
 return <main className="welcome-page" data-testid="welcome-page">
  <header className="welcome-header">
   <div className="welcome-brand"><span className="welcome-logo" aria-hidden="true"><Command size={23}/></span><span>NEXUS FORGE<small>GOVERNED INTELLIGENCE</small></span></div>
   <span className="welcome-header-note"><ShieldCheck size={15} aria-hidden="true"/>Your ideas. Your direction.</span>
  </header>
  <div className="welcome-layout">
   <section className="welcome-story" aria-labelledby="welcome-title">
    <div className="welcome-grid" aria-hidden="true"/>
    <div className="welcome-story-copy"><span className="welcome-eyebrow"><span/>A WORKSPACE FOR WHAT’S NEXT</span>
    <h1 id="welcome-title">Good ideas deserve<br/><em>real outcomes.</em></h1>
    <p>Turn an intention into a project you can research, build and verify. Bring the ambition. Give it a clear next step.</p></div>
    <div className="welcome-loop" role="group" aria-label="Plan, build and verify in one workspace">
     <div className="welcome-loop-header"><span><Layers3 size={15} aria-hidden="true"/>THE FORGE LOOP</span><span>IDEA → OUTCOME</span></div>
     <div className="welcome-phases"><div><span className="welcome-phase-icon"><Sparkles size={19} aria-hidden="true"/></span><strong>Plan with clarity</strong><small>Define the mission.</small></div><ArrowRight className="welcome-phase-arrow" size={16} aria-hidden="true"/><div><span className="welcome-phase-icon"><Command size={19} aria-hidden="true"/></span><strong>Build together</strong><small>Work with your AI Council.</small></div><ArrowRight className="welcome-phase-arrow" size={16} aria-hidden="true"/><div><span className="welcome-phase-icon"><ShieldCheck size={19} aria-hidden="true"/></span><strong>Verify the result</strong><small>Keep the evidence.</small></div></div>
     <div className="welcome-loop-footer"><Check size={14} aria-hidden="true"/><span>Human direction at every important decision.</span></div>
    </div>
    <div className="welcome-story-bottom"><span>RESEARCH. CREATE. MEASURE. IMPROVE.</span><ArrowUpRight size={23} aria-hidden="true"/></div>
   </section>
   <section className="welcome-access" aria-labelledby="access-title" data-testid="account-access" data-state={loading?'loading':step}>
    {step==='email'?<>
     <div className="welcome-mode" role="group" aria-label="Account access">
      <button type="button" aria-pressed={mode==='signin'} disabled={loading} onClick={()=>switchMode('signin')}>Sign in</button>
      <button type="button" aria-pressed={mode==='signup'} disabled={loading} onClick={()=>switchMode('signup')}>Create account</button>
     </div>
     <div className="welcome-access-heading"><span className="welcome-access-icon"><ArrowUpRight size={25} aria-hidden="true"/></span><p className="welcome-small-label">{mode==='signin'?'WELCOME BACK':'YOUR NEXT CHAPTER'}</p><h2 id="access-title">{mode==='signin'?'Sign in to the Forge':'Create your account'}</h2><p>{mode==='signin'?'Pick up where your next idea left off.':'A focused place to turn your ideas into progress.'}</p></div>
    </>:<div className="welcome-access-heading"><span className="welcome-access-icon"><Mail size={24} aria-hidden="true"/></span><p className="welcome-small-label">ONE MORE STEP</p><h2 id="access-title">Check your email</h2><p>Enter the 6-digit code sent to <strong className="welcome-email">{email}</strong>.</p></div>}
    {error&&<div className="welcome-error" id="access-error" role="alert">{error}</div>}
    {notice&&<p className="welcome-notice" role="status">{notice}</p>}
    {step==='email'?<>
     <form onSubmit={submitEmail} aria-busy={loading}>
      <label htmlFor="operator-email">Email address</label>
      <div className="welcome-input"><Mail size={18} aria-hidden="true"/><input ref={emailInput} id="operator-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} disabled={loading} onChange={e=>{setEmail(e.target.value);setError(null)}} placeholder="you@example.com" aria-describedby={error?'email-help access-error':'email-help'}/></div>
      <p id="email-help" className="welcome-field-help">We’ll email you a sign-in code. No password to remember.</p>
      <button className="welcome-submit" type="submit" disabled={loading}><span>{loading?'Sending…':mode==='signup'?'Create account with email':'Send verification code'}</span><ArrowRight size={18} aria-hidden="true"/></button>
     </form>
     {options?.workspaceSso&&<><div className="welcome-divider"><span>or continue with your organization</span></div><button className="welcome-sso" type="button" disabled={loading} onClick={()=>void workspace()}><span className="welcome-google" aria-hidden="true">G</span>Continue with Google Workspace<ArrowUpRight size={15} aria-hidden="true"/></button><p className="welcome-domain">For verified {options.domain} accounts.</p></>}
     <p className="welcome-account-note">{mode==='signup'?'Verify your email to finish setting up your account. Already registered? The same code signs you in.':'New here? Choose Create account above. You’ll verify your email before entering the workspace.'}</p>
    </>:<>
     <form onSubmit={submitCode} aria-busy={loading}>
      <input name="email" value={email} type="hidden"/>
      <label htmlFor="operator-code">Verification code</label>
      <div className="welcome-input welcome-code"><KeyRound size={18} aria-hidden="true"/><input ref={codeInput} id="operator-code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required value={code} disabled={loading} onChange={e=>{setCode(e.target.value.replace(/\D/g,'').slice(0,6));setError(null)}} placeholder="000000" aria-describedby={error?'code-help access-error':'code-help'} aria-invalid={error?true:undefined}/></div>
      <p id="code-help" className="welcome-field-help">Use the latest code. Check your spam folder if it hasn’t arrived.</p>
      <button className="welcome-submit" type="submit" disabled={loading}><span>{loading?'Verifying…':mode==='signup'?'Verify and create account':'Verify and enter'}</span><ArrowRight size={18} aria-hidden="true"/></button>
     </form>
     <div className="welcome-recovery"><button type="button" disabled={loading||resendIn>0} onClick={()=>void resend()}>{resendIn>0?'Resend code in '+resendIn+'s':'Resend code'}</button><button type="button" disabled={loading} onClick={()=>{setStep('email');setCode('');setError(null);setNotice('')}}>Use another email</button></div>
    </>}
    <p className="welcome-account-note">Paid access: monthly subscriptions or prepaid usage. No free plan or free trial. <a href="/pricing">View pricing →</a></p>
    <div className="welcome-trust"><ShieldCheck size={16} aria-hidden="true"/><p>Your workspace starts private.<br/><span>You decide what to share and approve.</span></p></div>
   </section>
  </div>
  <footer className="welcome-footer"><span>BUILT FOR PURPOSEFUL INTELLIGENCE.</span><span>Human governed. Evidence first.</span></footer>
 </main>
}
