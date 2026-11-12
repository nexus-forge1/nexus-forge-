import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { assessBlueprint, requiredBlueprintSections } from '../convex/blueprintCompleteness'
import { BlueprintCompleteness } from '../src/components/blueprint-completeness'
const full = requiredBlueprintSections.map(section => '## ' + section + '\nControlled proposal.').join('\n')
describe('blueprint structural completeness', () => {
  it('rejects empty sections, heading-only scaffolds and duplicate required sections', () => {
    const headings=requiredBlueprintSections.map(section=>'## '+section).join('\n')
    expect(assessBlueprint(headings).emptySections).toHaveLength(11)
    const empty=full.replace('## Next action\nControlled proposal.','## Next action\n-')
    expect(assessBlueprint(empty).missingSections).toEqual(['Next action'])
    expect(assessBlueprint(full+'\n## Next action\nAnother action.').duplicateSections).toEqual(['Next action'])
    expect(assessBlueprint(full+'\n## Next action\nAnother action.').complete).toBe(false)
  })
  it('distinguishes complete sections from a truncated draft and accepts Unicode hyphens', () => {
    expect(assessBlueprint(full).complete).toBe(true)
    expect(assessBlueprint(full.replace('Four-way', 'Four‑way')).complete).toBe(true)
    expect(assessBlueprint(full.replace('## Next action', 'Next action')).missingSections).toEqual(['Next action'])
    expect(assessBlueprint('## Manifest\nOnly the start.').missingSections).toHaveLength(10)
  })
  it('does not accept required headings hidden inside code fences', () => {
    expect(assessBlueprint('~~~markdown\n' + full + '\n~~~').complete).toBe(false)
    expect(assessBlueprint(full.replace('## Next action', '~~~\n## Next action') + '\n~~~').missingSections).toEqual(['Next action'])
  })
  it('shows incomplete paid drafts without claiming execution or initiating another request', () => {
    render(<BlueprintCompleteness blueprint="## Manifest\nPartial draft" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Incomplete AI draft')
    expect(screen.getByRole('alert')).toHaveTextContent('Next action')
    expect(screen.getByRole('alert')).toHaveTextContent('no inference is retried automatically')
    cleanup()
    render(<BlueprintCompleteness blueprint={full} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/does not verify claims, quality or execution/)).toBeInTheDocument()
  })
})
