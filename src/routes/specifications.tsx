import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ProductSpecifications} from '../components/product-specifications'
export const Route=createFileRoute('/specifications')({head:()=>routeHead('/specifications'),component:Page})
function Page(){return <WorkspaceLayout title="Product Specifications" eyebrow="PRODUCT STUDIO"><ProductSpecifications/></WorkspaceLayout>}
