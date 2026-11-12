import type { ReactNode } from 'react'

export function ScopeAPanel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section className="glass-card research-card" aria-label={title}>
    <div className="panel-title"><span>{eyebrow}</span><span className="live-pill">SCOPE A</span></div>
    <h2>{title}</h2>
    <div className="scope-a-panel-body">{children}</div>
  </section>
}
export function ScopeAField({ label, value, onChange, type = 'text', placeholder, required = true }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <label className="scope-a-field">{label}<input value={value} type={type} required={required} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>
}
export function ScopeAResult({ value, error }: { value?: string; error?: string }) {
  return <div aria-live="polite">{error && <p role="alert" className="scope-a-error">{error}</p>}{value && <p role="status" className="scope-a-result">{value}</p>}</div>
}
export function ScopeASubmit({ busy, label = 'Run evaluation' }: { busy: boolean; label?: string }) {
  return <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Working…' : label}</button>
}
