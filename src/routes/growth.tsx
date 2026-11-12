import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {GrowthStudio} from '../components/business-factory'
import {GovernedLaunchGrowthBoard} from '../components/governed-launch-growth-board'
export const Route=createFileRoute('/growth')({head:()=>routeHead('/growth'),component:Page})
function Page(){return <WorkspaceLayout title="Launch & Growth Studio" eyebrow="BUSINESS FACTORY"><GrowthStudio/><GovernedLaunchGrowthBoard/></WorkspaceLayout>}
