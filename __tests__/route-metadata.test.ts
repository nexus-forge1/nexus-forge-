import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { routeHead, indexablePaths } from '../src/lib/route-metadata'
import metadata from '../src/metadata.json'
describe('production metadata and indexing boundaries', () => {
  it('gives every actual page a canonical and social URL on the current domain', () => {
    const titles = new Set<string>()
    for (const file of readdirSync('src/routes').filter(file => file.endsWith('.tsx') && file !== '__root.tsx')) {
      const source = readFileSync('src/routes/' + file, 'utf8')
      const path = source.match(/createFileRoute\(['"]([^'"]+)['"]\)/)?.[1]
      expect(path).toBeDefined()
      expect(source).toContain('routeHead(')
      const head = routeHead(path as Exclude<keyof typeof metadata, 'default'>)
      expect(head.links).toEqual([{ rel: 'canonical', href: 'https://www.network-x-ai.com' + path }])
      expect(head.meta).toContainEqual({ property: 'og:url', content: 'https://www.network-x-ai.com' + path })
      const title = head.meta.find(item => 'title' in item)?.title!
      expect(titles.has(title)).toBe(false); titles.add(title)
      expect(head.meta).toContainEqual({ name: 'robots', content: (indexablePaths as readonly string[]).includes(path!) ? 'index, follow' : 'noindex, follow' })
    }
  })
  it('keeps only public welcome and pricing pages in the sitemap and references it from robots', () => {
    const sitemap = readFileSync('public/sitemap.xml', 'utf8')
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
    expect(locations).toEqual(['https://www.network-x-ai.com/', 'https://www.network-x-ai.com/pricing'])
    expect(readFileSync('public/robots.txt', 'utf8')).toContain('Sitemap: https://www.network-x-ai.com/sitemap.xml')
    expect(sitemap).not.toContain('macaly.app')
    expect(() => routeHead('//other.example' as any)).toThrow()
  })
  it('uses the application brand and an existing icon in the install manifest', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'))
    expect(manifest).toMatchObject({ name: 'NEXUS FORGE', short_name: 'NEXUS FORGE', id: '/', start_url: '/', scope: '/' })
    expect(manifest.icons).toEqual([{ src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' }])
    expect(readFileSync('public/favicon.svg', 'utf8')).toContain('<svg')
  })
})
