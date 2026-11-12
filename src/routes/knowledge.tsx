import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {DocumentKnowledge} from '../components/document-knowledge'
import {KnowledgeFacetedBrowser} from '../components/knowledge-faceted-browser'
import {DocumentKnowledgeHubPanel} from '../components/document-knowledge-hub-panel'
export const Route=createFileRoute('/knowledge')({head:()=>routeHead('/knowledge'),component:Page})
function Page(){return <WorkspaceLayout title="Document Knowledge Hub" eyebrow="PRODUCT STUDIO"><DocumentKnowledge/><KnowledgeFacetedBrowser/><DocumentKnowledgeHubPanel/></WorkspaceLayout>}
