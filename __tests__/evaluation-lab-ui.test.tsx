import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EvaluationLab } from '../src/components/evaluation-lab'
import { getFunctionName } from 'convex/server'

const mocks = vi.hoisted(() => ({ create: vi.fn(), record: vi.fn(), recordReview: vi.fn(), recordBlind: vi.fn() }))
const suite = {
  _id: 'suite-1',
  suiteKey: 'quality',
  title: 'Quality suite',
  version: 1,
  cases: [{ key: 'case_one', category: 'reasoning', input: 'Return the exact answer.', expected: 'answer', grader: 'exact-text', critical: false }],
  digest: 'suite-digest-1234567890',
  graderVersion: 'deterministic-output-v1',
  createdAt: 1000,
}
const run = {
  _id: 'run-1',
  suiteId: 'suite-1',
  requestKey: 'run-1',
  config: { agent: 'agent-v1', model: 'model-v1', promptVersion: 'p1', toolVersion: 't1' },
  provenance: 'operator-submitted',
  outputs: [{ key: 'case_one', output: 'answer' }],
  results: [{ key: 'case_one', category: 'reasoning', critical: false, status: 'pass', detail: 'Exact text matched' }],
  payloadDigest: 'run-digest-1234567890',
  createdAt: 2000,
}
const secondRun = { ...run, _id: 'run-2', requestKey: 'run-2', config: { ...run.config, model: 'model-v2' }, outputs: [{ key: 'case_one', output: 'alternative answer' }], payloadDigest: 'run-digest-2234567890', createdAt: 3000 }
const pair = { pairKey: 'run-1:run-2', suiteDigest: suite.digest, leftRunId: 'run-1', rightRunId: 'run-2', cases: [{ key: 'case_one', category: 'reasoning', input: 'Return the exact answer.', leftOutput: 'answer', rightOutput: 'alternative answer' }] }
vi.mock('convex/react', () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref)
    return name === 'evaluations:recordBlindComparison' ? mocks.recordBlind : name === 'evaluations:recordReview' ? mocks.recordReview : name === 'evaluations:record' ? mocks.record : mocks.create
  },
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === 'skip') return undefined
    const name = getFunctionName(ref)
    if (name === 'evaluations:reviews' || name === 'evaluations:blindReviews') return []
    if (name === 'evaluations:blindPair') return pair
    if (name === 'evaluations:runs') return [run, secondRun]
    return [suite]
  },
}))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a> }))
vi.mock('../src/lib/operator-error', () => ({ operatorError: (_e: unknown, fallback: string) => fallback }))
vi.mock('../src/components/studio-shared', () => ({ downloadJson: vi.fn() }))

describe('Evaluation Lab semantic rubric UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue('suite-2')
    mocks.record.mockResolvedValue('run-1')
    mocks.recordReview.mockResolvedValue('review-1')
    mocks.recordBlind.mockResolvedValue('blind-review-1')
  })

  it('records a run and saves a digest-bound rubric review from the UI', async () => {
    render(<EvaluationLab />)
    fireEvent.change(screen.getByLabelText('Saved suite'), { target: { value: 'suite-1' } })
    expect(await screen.findByText('5. Semantic quality rubric review')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Agent identity / version'), { target: { value: 'agent-v1' } })
    fireEvent.change(screen.getByLabelText('Provider / model configuration'), { target: { value: 'model-v1' } })
    fireEvent.change(screen.getByLabelText('Prompt version or digest'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText('Tool configuration version or digest'), { target: { value: 't1' } })
    fireEvent.change(screen.getByLabelText('Run key'), { target: { value: 'run-1' } })
    fireEvent.change(screen.getByLabelText('Answers JSON'), { target: { value: JSON.stringify([{ key: 'case_one', output: 'answer' }]) } })
    fireEvent.click(screen.getByRole('button', { name: 'Grade and retain answers' }))

    await waitFor(() => expect(mocks.record).toHaveBeenCalledWith({
      suiteId: 'suite-1',
      requestKey: 'run-1',
      config: { agent: 'agent-v1', model: 'model-v1', promptVersion: 'p1', toolVersion: 't1' },
      outputs: [{ key: 'case_one', output: 'answer' }],
    }))
    await waitFor(() => expect(screen.getByText(/Reviewing run run-1/)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Review key'), { target: { value: 'review-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save immutable rubric review' }))
    await waitFor(() => expect(mocks.recordReview).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      requestKey: 'review-1',
      scores: [expect.objectContaining({ key: 'case_one', correctness: 3, completeness: 3, instructionAdherence: 3, grounding: 3, safety: 3 })],
    })))
  })

  it('saves an identity-masked pairwise review from the UI', async () => {
    render(<EvaluationLab />)
    fireEvent.change(screen.getByLabelText('Saved suite'), { target: { value: 'suite-1' } })
    expect(await screen.findByText('4. Identity-masked pairwise review')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('First saved run · identity masked'), { target: { value: 'run-1' } })
    fireEvent.change(screen.getByLabelText('Second saved run · identity masked'), { target: { value: 'run-2' } })
    expect(await screen.findByText('alternative answer')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Preference for case_one'), { target: { value: 'left' } })
    fireEvent.change(screen.getByLabelText('Rationale for case_one'), { target: { value: 'Answer A follows the frozen task exactly and avoids unsupported claims.' } })
    fireEvent.change(screen.getByLabelText('Pairwise review key'), { target: { value: 'blind-review-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save identity-masked comparison' }))
    await waitFor(() => expect(mocks.recordBlind).toHaveBeenCalledWith({
      firstRunId: 'run-1',
      secondRunId: 'run-2',
      requestKey: 'blind-review-1',
      decisions: [{ key: 'case_one', preference: 'left', rationale: 'Answer A follows the frozen task exactly and avoids unsupported claims.' }],
    }))
  })
})
