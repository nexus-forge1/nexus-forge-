import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {SkillContractPreview} from '../components/skill-contract-preview'
import {SkillFoundry} from '../components/skill-foundry'
import {SkillFoundryContractStudio} from '../components/skill-foundry-contract-studio'
export const Route=createFileRoute('/skills')({head:()=>routeHead('/skills'),component:Page})
function Page(){return <WorkspaceLayout title="Skill Foundry" eyebrow="INTELLIGENCE / PRIVATE CAPABILITY CONTRACTS"><SkillFoundry/><SkillContractPreview/><SkillFoundryContractStudio/></WorkspaceLayout>}
