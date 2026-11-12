import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {EnvironmentSecretsMaskRegistry} from '../components/environment-secrets-mask-registry'
export const Route=createFileRoute('/secrets')({head:()=>routeHead('/secrets'),component:Page})
function Page(){return <WorkspaceLayout title="Environment Secrets Registry" eyebrow="SCOPE D / PRODUCTIVITY & PORTFOLIO"><EnvironmentSecretsMaskRegistry/></WorkspaceLayout>}
