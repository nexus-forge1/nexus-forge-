import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {AppFactoryWorkbench} from '../components/app-factory-workbench'
import {BrowserQAScenarioRecorder} from '../components/browser-qa-scenario-recorder'
export const Route=createFileRoute('/browser-qa')({head:()=>routeHead('/browser-qa'),component:Page})
function Page(){return <WorkspaceLayout title="Real Browser QA & Repair" eyebrow="APP FACTORY / EVIDENCE-GATED QA"><AppFactoryWorkbench mode="browser"/><BrowserQAScenarioRecorder/></WorkspaceLayout>}
