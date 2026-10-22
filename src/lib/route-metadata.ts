import metadata from '../metadata.json'
import { productionOrigin } from './production-probe'
export const indexablePaths = ['/', '/pricing'] as const
export function routeHead(path: Exclude<keyof typeof metadata, 'default'>) {
  const page = metadata[path]
  if (!page || !path.startsWith('/') || path.startsWith('//') || /[?#]/.test(path)) throw new Error('Unknown metadata route')
  const canonical = new URL(path, productionOrigin).href
  const image = metadata.default.openGraph.images
  return {
    meta: [
      { title: page.title },
      { name: 'description', content: page.description },
      { name: 'robots', content: (indexablePaths as readonly string[]).includes(path) ? 'index, follow' : 'noindex, follow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: page.title },
      { property: 'og:description', content: page.description },
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: image },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: page.title },
      { name: 'twitter:description', content: page.description },
      { name: 'twitter:image', content: image },
    ],
    links: [{ rel: 'canonical', href: canonical }],
  }
}
