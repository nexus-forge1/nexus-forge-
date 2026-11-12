import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {AppFactoryWorkbench} from '../components/app-factory-workbench'
import {SchemaDiffGate} from '../components/schema-diff-gate'
import {DatabaseMigrationDryrunPanel} from '../components/database-migration-dryrun-panel'
export const Route=createFileRoute('/database-studio')({head:()=>routeHead('/database-studio'),component:Page})
function Page(){return <WorkspaceLayout title="Database & Migration Studio" eyebrow="APP FACTORY / ADDITIVE SCHEMA"><SchemaDiffGate/><AppFactoryWorkbench mode="database"/><DatabaseMigrationDryrunPanel/></WorkspaceLayout>}
