import * as Sentry from '@sentry/tanstackstart-react'

/**
 * Sentry is intentionally dormant until a project DSN is configured.
 * DSNs are public ingest identifiers; never place SENTRY_AUTH_TOKEN here.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      // Avoid exporting request bodies, headers, cookies, or user identity.
      event.user = undefined
      if (event.request) {
        event.request.data = undefined
        event.request.cookies = undefined
        event.request.headers = undefined
        if (event.request.url) {
          event.request.url = event.request.url.split('#', 1)[0].split('?', 1)[0]
        }
      }

      // Breadcrumbs can contain request data or query strings too.
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          const next = { ...breadcrumb }
          if (next.data) {
            next.data = { ...next.data }
            delete next.data.body
            delete next.data.data
            delete next.data.headers
            delete next.data.cookies
            if (typeof next.data.url === 'string') {
              next.data.url = next.data.url.split('#', 1)[0].split('?', 1)[0]
            }
          }
          return next
        })
      }
      return event
    },
  })
}
