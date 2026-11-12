import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {RepoSnapshotParserView} from '../components/repo-snapshot-parser-view'
import {AppImports} from '../components/app-imports'
import {ModernizationDebtAnalyzer} from '../components/modernization-debt-analyzer'
export const Route=createFileRoute('/imports')({head:()=>routeHead('/imports'),component:Page})
function Page(){return <WorkspaceLayout title="Existing-App Import & Modernization" eyebrow="APP FACTORY / REPOSITORY BASELINES"><AppImports/><RepoSnapshotParserView/><ModernizationDebtAnalyzer/></WorkspaceLayout>}
