export function artifactFilename(id: string): string {
 const safe = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100)
 if (!safe) throw new Error('Artifact identifier is required')
 return 'nexus-forge-' + safe + '.html'
}
export async function downloadArtifact(id: string, content: string) {
 const filename = artifactFilename(id)
 const bytes = new TextEncoder().encode(content)
 const hash = await crypto.subtle.digest('SHA-256', bytes)
 const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
 const blob = new Blob([bytes], {type:'text/html;charset=utf-8'})
 const url = URL.createObjectURL(blob)
 const link = document.createElement('a')
 link.href = url; link.download = filename
 try {
  document.body.appendChild(link)
  link.click()
 } finally {
  link.remove()
  // Give the browser time to accept the download before releasing its URL.
  setTimeout(() => URL.revokeObjectURL(url), 30000)
 }
 return { filename, sha256, bytes: bytes.byteLength }
}
