import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { useEffect, useState } from 'react'
import { WorkspaceGuide } from './workspace-guide'
import { AuthWrapper } from './auth-wrapper'
import { workspaceGroups } from '../lib/workspaces'
import {StudioGuide} from './studio-guide'
import {starterPaths} from '../lib/expansion-catalog'

export function WorkspaceLayout({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const router = useRouter()
  const { signOut } = useAuthActions()
  const [missionId, setMissionId] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  async function leaveSession() {
    setSigningOut(true); setSignOutError('')
    try {
      await signOut()
      window.sessionStorage.removeItem('nexus-forge-active-mission')
      window.sessionStorage.removeItem('nexus-studio-project')
      window.dispatchEvent(new Event('nexus-active-mission-changed'))
      await router.navigate({ to: '/', replace: true })
    } catch { setSignOutError('Unable to sign out. Please try again.') }
    finally { setSigningOut(false) }
  }
  useEffect(() => {
    const sync = () => setMissionId(window.sessionStorage.getItem('nexus-forge-active-mission') ?? '')
    sync()
    window.addEventListener('nexus-active-mission-changed', sync)
    return () => window.removeEventListener('nexus-active-mission-changed', sync)
  }, [pathname])
  return <AuthWrapper><main className="min-h-screen nexus-shell has-sidebar workspace-app-shell">
    <aside className="nexus-sidebar" aria-label="NEXUS FORGE navigation">
      <Link to="/" className="sidebar-brand"><div className="brand-mark">N</div><div><strong>NEXUS</strong><small>FORGE OS</small></div></Link>
      <nav className="sidebar-nav" aria-label="Feature pages">{workspaceGroups.map(group => { const pages = group.pages.filter(item => item.path !== '/capabilities' && item.path !== '/readiness' && item.path !== '/incidents' && item.path !== '/providers'); return pages.length ? <div key={group.title}><div className="sidebar-group-label">{group.title}</div>{pages.map(item => <Link key={item.path} to={item.path} aria-current={pathname === item.path ? 'page' : undefined} className={`sidebar-link ${pathname === item.path ? 'active' : ''}`}><span>{item.icon}</span><span>{item.path === '/workflow' ? 'Guided Workflow' : item.title}</span></Link>)}</div> : null })}</nav>
      <div className="sidebar-footer"><span className="pulse-dot" /><div><strong>CORE ONLINE</strong><small>{missionId ? 'Mission selected' : 'No active mission'}</small></div></div>
    </aside>
    <div className="workspace-page-content">
      <header className="topbar"><div className="brand-lockup"><div className="brand-mark">N</div><div><div className="brand-name">NEXUS FORGE</div><div className="brand-sub">GOVERNED INTELLIGENCE OS</div></div></div><div className="top-actions"><Link to="/billing" className="ghost-button">Billing</Link><span className="live-pill"><span className="pulse-dot" /> CORE ONLINE</span><button className="profile-button" type="button" disabled={signingOut} onClick={() => void leaveSession()}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div></header>
      {signOutError && <p role="alert">{signOutError}</p>}
      <section className="page-heading"><div className="section-kicker">{eyebrow}</div><h1>{title}</h1><p>Use Guided Workflow to understand the sequence, then use each dedicated workspace for its own controls and evidence.</p></section>
      {(starterPaths as readonly string[]).includes(pathname)||pathname==='/expansion'?<StudioGuide path={pathname}/>:<WorkspaceGuide/>}
      <div id="workspace-controls">{children}</div>
    </div>
  </main></AuthWrapper>
}
