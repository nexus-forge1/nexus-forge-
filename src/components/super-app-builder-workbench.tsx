import { useState, type FormEvent } from 'react'
import { useAction, useMutation } from 'convex/react'
import { api } from '../lib/scope-e-api'

type BuildFile = { path: string; content: string; language: string }
const card = 'glass-card research-card'
const stages = ['Draft', 'Scaffolded', 'Ready to Synthesize'] as const

export function SuperAppBuilderWorkbench() {
  const [title, setTitle] = useState('Governed full-stack product')
  const [description, setDescription] = useState('A secure, reviewable product scaffold with clear ownership and reversible delivery.')
  const [requirements, setRequirements] = useState('Clear acceptance criteria\nOperator approval before external actions\nReview scaffold before synthesis')
  const [specKey, setSpecKey] = useState('scope-e-build-001')
  const [artifactKind, setArtifactKind] = useState<'D17' | 'D19'>('D17')
  const [artifactJson, setArtifactJson] = useState('')
  const [specDigest, setSpecDigest] = useState('')
  const [files, setFiles] = useState<BuildFile[]>([])
  const [lane, setLane] = useState<(typeof stages)[number]>('Draft')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const intake = useMutation(api.scopeEFunctions.intakeAppBuilderSpec)
  const compile = useAction(api.scopeEFunctions.compileAppScaffold)
  const transition = useMutation(api.scopeEFunctions.transitionBuildLane)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      let artifact: Record<string, unknown> | undefined
      if (artifactJson.trim()) {
        const parsed: unknown = JSON.parse(artifactJson)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('D17/D19 artifact must be a JSON object.')
        artifact = parsed as Record<string, unknown>
      }
      const lines = requirements.split('\n').map(value => value.trim()).filter(Boolean)
      const result = await intake({
        requestKey: 'e1-' + specKey,
        specKey,
        title,
        description,
        requirements: lines,
        ...(artifact && artifactKind === 'D17' ? { d17IntentJson: JSON.stringify(artifact) } : {}),
        ...(artifact && artifactKind === 'D19' ? { d19IntentJson: JSON.stringify(artifact) } : {}),
      })
      setSpecDigest(result.specDigest); setLane(result.lane as (typeof stages)[number])
      setNotice('Specification saved. Digest: ' + result.specDigest)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Specification intake failed.') }
    finally { setBusy(false) }
  }

  async function buildScaffold() {
    setBusy(true); setError(''); setNotice('')
    try {
      if (!specDigest) throw new Error('Save the specification before compiling the scaffold.')
      const result = await compile({ title, description, requirements: requirements.split('\n').map(v => v.trim()).filter(Boolean), specDigest })
      const scaffoldFiles = result.files as BuildFile[]
      await transition({ specKey, nextLane: 'Scaffolded', scaffoldFiles, scaffoldDigest: result.scaffoldDigest })
      setFiles(scaffoldFiles); setLane('Scaffolded')
      setNotice('Scaffold generated in memory and recorded for review. No files were written to a repository.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Scaffold compilation failed.') }
    finally { setBusy(false) }
  }

  async function readyForSynthesis() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await transition({ specKey, nextLane: 'Ready to Synthesize' })
      setLane(result.lane as (typeof stages)[number])
      setNotice('Handoff marked ready. Synthesis, deployment, and external actions have not been executed.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Lane transition failed.') }
    finally { setBusy(false) }
  }

  return <section className="workspace" aria-labelledby="e1-heading">
    <div className={card}>
      <p className="panel-title">SCOPE E · E1 / SPECIFICATION → SCAFFOLD</p>
      <h2 id="e1-heading">Super-app builder workbench</h2>
      <p>Import a D17 intent or D19 handoff artifact, compile a reviewable TanStack + Convex scaffold, then advance its governed lane.</p>
      <ol aria-label="Build lane progression" className="workflow-steps">{stages.map((stage, index) => <li key={stage} aria-current={lane === stage ? 'step' : undefined}><strong>{index + 1}. {stage}</strong><span>{stages.indexOf(lane) >= index ? 'Reached' : 'Pending'}</span></li>)}</ol>
    </div>
    <form className={card} onSubmit={event => void submit(event)}>
      <h3>Specification intake</h3>
      <label>Specification key<input value={specKey} onChange={event => setSpecKey(event.target.value)} required maxLength={160} pattern="[A-Za-z0-9][A-Za-z0-9._:/-]*" /></label>
      <label>Product title<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} /></label>
      <label>Build intent<textarea value={description} onChange={event => setDescription(event.target.value)} required rows={3} maxLength={6000} /></label>
      <label>Requirements (one per line)<textarea value={requirements} onChange={event => setRequirements(event.target.value)} required rows={4} maxLength={12000} /></label>
      <div className="field-grid">
        <label>Artifact source<select value={artifactKind} onChange={event => setArtifactKind(event.target.value as 'D17' | 'D19')}><option value="D17">D17 intent</option><option value="D19">D19 feature handoff</option></select></label>
      </div>
      <label>Import artifact JSON (optional)<textarea value={artifactJson} onChange={event => setArtifactJson(event.target.value)} rows={4} maxLength={30000} placeholder='{"intent":"...","requirements":[]}' /></label>
      <div className="hero-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save specification'}</button><button type="button" className="secondary-button" onClick={() => void buildScaffold()} disabled={busy || !specDigest}>Compile scaffold</button><button type="button" className="secondary-button" onClick={() => void readyForSynthesis()} disabled={busy || lane !== 'Scaffolded'}>Mark ready to synthesize</button></div>
      {specDigest && <p><strong>Specification SHA-256:</strong> <code>{specDigest}</code></p>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status" aria-live="polite">{notice}</p>}
    </form>
    {files.length > 0 && <div className={card}><h3>Scaffold inventory</h3><ul>{files.map(file => <li key={file.path}><code>{file.path}</code> <span>({file.language})</span></li>)}</ul><p>Scaffold content is held in the governed backend lane; no repository write or deployment was performed.</p></div>}
  </section>
}
