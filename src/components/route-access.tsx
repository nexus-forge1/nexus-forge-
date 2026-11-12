import { useRouterState } from '@tanstack/react-router'
import { AuthWrapper } from './auth-wrapper'
import { HomeLandingSeo } from './home-landing'
import { WorkflowLandingSeo } from './workflow-landing'
export function RouteAccess({children}:{children:React.ReactNode}) {
  const pathname=useRouterState({select:state=>state.location.pathname})
  return pathname==='/pricing'?<>{children}</>:<AuthWrapper loading={pathname==='/'?<HomeLandingSeo/>:pathname==='/workflow'?<WorkflowLandingSeo/>:undefined}>{children}</AuthWrapper>
}
