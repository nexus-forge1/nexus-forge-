import { assessBlueprint } from '../../convex/blueprintCompleteness'
export function BlueprintCompleteness({ blueprint }: { blueprint: string }) {
  if (!blueprint) return null
  const check = assessBlueprint(blueprint)
  return check.complete ? <p data-testid="blueprint-section-check" data-state="complete">Required blueprint sections contain content without duplicate headings. This structural check does not verify claims, quality or execution.</p> :
    <div role="alert" data-testid="blueprint-section-check" data-state="incomplete"><strong>Incomplete AI draft</strong><p>Missing, empty or duplicated required sections: {check.missingSections.join(', ')}.</p><p>The response and usage are preserved. Review the draft before explicitly requesting more AI work; no inference is retried automatically. Guided mission handoff waits for section and receipt checks.</p></div>
}
