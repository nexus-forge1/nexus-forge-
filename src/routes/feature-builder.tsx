import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {FeaturePackageCompilerView} from '../components/feature-package-compiler-view'
import {FeatureBuilder} from '../components/feature-builder'
import {FeatureBuilderScaffoldViewer} from '../components/feature-builder-scaffold-viewer'
export const Route=createFileRoute('/feature-builder')({head:()=>routeHead('/feature-builder'),component:Page})
function Page(){return <WorkspaceLayout title="Full-Stack Feature Builder" eyebrow="APP FACTORY / VERTICAL SLICES"><FeatureBuilder/><FeaturePackageCompilerView/><FeatureBuilderScaffoldViewer/></WorkspaceLayout>}
