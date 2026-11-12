import { createFileRoute, Link } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { PaymentReadinessLockView } from '../components/payment-readiness-lock-view'

export const Route = createFileRoute('/payment-readiness')({
  head: () => routeHead('/payment-readiness'),
  component: PaymentReadinessPage,
})

function PaymentReadinessPage() {
  return <WorkspaceLayout title="Payment Activation Readiness" eyebrow="B17 / GATED BOUNDARY">
    <section className="workspace">
      <div className="hero-actions">
        <Link className="secondary-button" to="/capabilities">Review reliability evidence →</Link>
        <Link className="secondary-button" to="/releases">Review release controls →</Link>
      </div>
      <PaymentReadinessLockView />
    </section>
  </WorkspaceLayout>
}
