import { useEffect, useMemo, useState } from 'react'

type Props = { mission: string; budget: number; autonomy: string; onReadyChange: (ready: boolean) => void }

const checks = [
  { id: 'outcome', label: 'Outcome and acceptance evidence are specific', detail: 'The mission states an inspectable deliverable and how success will be measured.' },
  { id: 'authority', label: 'Authority and spend limits are understood', detail: 'The operator has reviewed the autonomy level, spend cap, and approval boundary.' },
  { id: 'data', label: 'Data handling and credential scope are reviewed', detail: 'No secrets are pasted into task text; access is least-privilege and source data is treated as untrusted.' },
  { id: 'effects', label: 'External side effects and reversibility are reviewed', detail: 'Publishing, deletion, deployment, customer impact, and rollback requirements have been considered.' },
  { id: 'evidence', label: 'Evidence capture and stop conditions are defined', detail: 'The operator knows what receipt proves completion and when work must pause for review.' },
] as const

export function PreExecutionSafetyGate({ mission, budget, autonomy, onReadyChange }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [reviewedAt, setReviewedAt] = useState<number | null>(null)
  const policy = useMemo(() => {
    const text = mission.toLowerCase()
    const highImpact = /\b(delete|drop|wipe|charge|payment|checkout|billing|publish|production|deploy|customer data|personal data|credential|secret)\b/.test(text)
    const paymentScope = /\b(payment|checkout|billing|charge|subscription|payment activation)\b/.test(text)
    const budgetInvalid = !Number.isFinite(budget) || budget < 0 || budget > 500
    const draftOnly = autonomy === 'Draft only'
    const rules = [
      { label: 'Budget within authorized range', pass: !budgetInvalid, detail: budgetInvalid ? 'Budget must remain between $0 and $500.' : 'Budget is within the configured $0–$500 mission limit.' },
      { label: 'High-impact action review', pass: !highImpact || autonomy === 'Approval required', detail: highImpact ? (autonomy === 'Approval required' ? 'High-impact language detected; explicit approval is retained.' : 'High-impact language requires “Approval required” authority.') : 'No high-impact action terms detected in the current mission text.' },
      { label: 'Payment activation boundary', pass: !paymentScope, detail: paymentScope ? 'Payment-related scope is blocked from activation. B17 remains gated; no payment, checkout, billing, or charge execution is enabled here.' : 'No payment activation requested.' },
      { label: 'Execution authority present', pass: !draftOnly, detail: draftOnly ? 'Draft-only authority cannot pass the pre-execution gate.' : 'Authority is not limited to draft-only work.' },
    ]
    return { rules, highImpact, paymentScope, blocked: rules.some(rule => !rule.pass) }
  }, [mission, budget, autonomy])
  const allChecked = checks.every(item => checked[item.id] === true)
  const ready = allChecked && !policy.blocked
  useEffect(() => { onReadyChange(ready) }, [ready, onReadyChange])
  return <section className="glass-card research-card" id="pre-execution-safety-gate" aria-labelledby="safety-gate-title">
    <div className="panel-title"><span id="safety-gate-title">INDEPENDENT VERIFICATION & SAFETY GATE</span><span className="live-pill">{ready ? 'GATE READY' : policy.blocked ? 'BLOCKED' : 'REVIEW REQUIRED'}</span></div>
    <p>Complete each operator verification item against the current mission draft. This checklist is a pre-execution readiness review, not proof that a provider ran or that an external system is safe.</p>
    <div className="decision-line"><span>GATE STATE</span><strong>{ready ? 'READY FOR SEPARATE EXECUTION AUTHORIZATION' : policy.blocked ? 'BLOCKED BY POLICY' : 'CHECKLIST INCOMPLETE'}</strong></div>
    {checks.map(item => <label className="decision-line" key={item.id}><input type="checkbox" checked={checked[item.id] === true} onChange={event => { setChecked(current => ({ ...current, [item.id]: event.target.checked })); setReviewedAt(null) }} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></label>)}
    <h3>Deterministic guardrail policy evaluation</h3>
    {policy.rules.map(rule => <div className="decision-line" key={rule.label}><span>{rule.pass ? 'PASS' : 'BLOCK'}</span><span><strong>{rule.label}</strong><small>{rule.detail}</small></span></div>)}
    <div className="hero-actions"><button type="button" className="secondary-button" onClick={() => setReviewedAt(Date.now())}>Record local gate review</button><span className="muted-copy">{reviewedAt ? 'Reviewed at ' + new Date(reviewedAt).toLocaleString() : 'Local review timestamp is not a persisted approval receipt.'}</span></div>
    {policy.paymentScope && <p className="warning" role="alert">Payment activation is intentionally unavailable. This safety gate cannot unlock B17 or initiate payment activity.</p>}
    {ready && <p className="receipt" role="status">All checklist items are checked and no policy rule blocks the gate. Execution still requires its separate authorized workflow.</p>}
  </section>
}
