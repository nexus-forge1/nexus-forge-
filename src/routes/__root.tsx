import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { MacalyBridge } from '@macaly/bridge'
import AppConvexProvider from '@/components/convex-client-provider'
import { RouteAccess } from '@/components/route-access'
import '../styles.css'
import siteMetadata from '../metadata.json'

const rootMeta = siteMetadata['/']

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: rootMeta.title },
      { name: 'description', content: rootMeta.description },
      { property: 'og:title', content: rootMeta.title },
      { property: 'og:description', content: rootMeta.description },
      {
        property: 'og:image',
        content: siteMetadata.default?.openGraph?.images ?? '',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: rootMeta.title },
      { name: 'twitter:description', content: rootMeta.description },
      {
        name: 'twitter:image',
        content: siteMetadata.default?.openGraph?.images ?? '',
      },
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><HeadContent /></head>
      <MacalyBridge>
        <body>
          <AppConvexProvider><RouteAccess>{children}</RouteAccess></AppConvexProvider>
          <Scripts />
        </body>
      </MacalyBridge>
    </html>
  )
}
