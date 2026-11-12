import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { GovernedCompliancePackagerView } from '../components/governed-compliance-packager-view'
export const Route = createFileRoute('/audit-export')({ head: () => routeHead('/audit-export'), component: Page })
function Page() { return <WorkspaceLayout title="Governed Compliance Packager" eyebrow="SCOPE E · E7 / AUDIT DOSSIER & SHA-256"><GovernedCompliancePackagerView /></WorkspaceLayout> }
