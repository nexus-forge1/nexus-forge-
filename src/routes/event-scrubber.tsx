import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { InteractiveEventScrubberView } from '../components/interactive-event-scrubber-view'
export const Route = createFileRoute('/event-scrubber')({ head: () => routeHead('/event-scrubber'), component: Page })
function Page() { return <WorkspaceLayout title="Interactive Event Scrubber" eyebrow="SCOPE E · E6 / HISTORICAL STATE INSPECTION"><InteractiveEventScrubberView /></WorkspaceLayout> }
