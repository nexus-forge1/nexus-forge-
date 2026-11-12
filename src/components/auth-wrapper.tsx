import {AuthLoading,Authenticated,Unauthenticated} from 'convex/react'
import {Command} from 'lucide-react'
import {SignInForm} from './sign-in-form'

export function AuthWrapper({children,loading}:{children:React.ReactNode;loading?:React.ReactNode}){
 return <>
  <AuthLoading>{loading ?? <main className="welcome-loading"><span className="welcome-logo" aria-hidden="true"><Command size={23}/></span><strong>NEXUS FORGE</strong><p role="status">Checking your session…</p></main>}</AuthLoading>
  <Authenticated>{children}</Authenticated>
  <Unauthenticated><SignInForm/></Unauthenticated>
 </>
}
