import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {VisualDiffInspector} from '../components/visual-diff-inspector'
import {VisualBuilder} from '../components/visual-builder'
import {VisualBuilderSyncInspector} from '../components/visual-builder-sync-inspector'
export const Route=createFileRoute('/visual-builder')({head:()=>routeHead('/visual-builder'),component:Page})
function Page(){return <WorkspaceLayout title="Visual Builder With Code Synchronization" eyebrow="APP FACTORY / SUPPORTED COMPONENT EDITING"><VisualBuilder/><VisualDiffInspector/><VisualBuilderSyncInspector/></WorkspaceLayout>}
