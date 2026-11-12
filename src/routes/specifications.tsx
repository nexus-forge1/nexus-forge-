import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ProductSpecifications} from '../components/product-specifications'
import {IntentAstInspector} from '../components/intent-ast-inspector'
import {SpecificationAstCompilerView} from '../components/specification-ast-compiler-view'
export const Route=createFileRoute('/specifications')({head:()=>routeHead('/specifications'),component:Page})
function Page(){return <WorkspaceLayout title="Product Specifications" eyebrow="PRODUCT STUDIO"><ProductSpecifications/><IntentAstInspector/><SpecificationAstCompilerView/></WorkspaceLayout>}
