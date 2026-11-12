#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const outputRoot = resolve(process.cwd(), '.output/public')
const requiredRoutes = [
  'templates',
  'specifications',
  'knowledge',
  'economics',
  'connections',
  'changes',
  'client-delivery',
  'notifications',
  'expansion',
]
const missing = requiredRoutes.filter((route) => {
  const file = resolve(outputRoot, route, 'index.html')
  return !existsSync(file) || !statSync(file).isFile() || statSync(file).size === 0
})

if (missing.length > 0) {
  console.error('Static export is missing required NEXUS FORGE routes:')
  for (const route of missing) console.error(` - /${route}/ (expected .output/public/${route}/index.html)`)
  process.exitCode = 1
} else {
  console.log(`Static route export check passed: ${requiredRoutes.length} required routes have non-empty HTML.`)
}
