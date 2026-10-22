import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { buildResearchDossier, safeCitation } from '../src/lib/research-dossier'
import { ResearchDossier } from '../src/components/research-dossier'
const now = Date.UTC(2026,9,17)
const record = (id:string, citations:string[], createdAt=now) => ({ _id:id, query:'Market evidence', result:'Saved findings', citations, createdAt })
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})
describe('research dossier',()=>{
 it.each(['javascript:alert(1)','data:text/html,hello','https://user:password@example.com/','not a url'])('omits unsafe citation %s',url=>{
  expect(safeCitation(url)).toBeNull()
 })
 it('normalizes fragments while preserving distinct queries and record provenance',()=>{
  const records=[record('r1',['https://EXAMPLE.com/report#one','https://example.com/report#two']),record('r2',['https://example.com/report','https://example.com/report?v=2','https://other.example/info'])]
  const dossier=buildResearchDossier('m1',records,now)
  expect(dossier.summary).toEqual({records:2,uniqueSources:3,domains:2,duplicateCitations:2,invalidCitations:0})
  expect(dossier.sources[0].recordIds).toEqual(['r1','r2'])
  expect(records[0].citations[0]).toContain('#one')
  expect(dossier.records).toEqual(records)
 })
 it('distinguishes stale research, invalid dates and unusable citations',()=>{
  const dossier=buildResearchDossier('m1',[record('old',[],now-31*86400000),record('future',['https://example.com'],now+1),record('bad',['javascript:alert(1)'],NaN)],now)
  expect(dossier.staleRecordIds).toEqual(['old'])
  expect(dossier.invalidDateRecordIds).toEqual(['future','bad'])
  expect(dossier.uncitedRecordIds).toEqual(['old','bad'])
  expect(dossier.summary.invalidCitations).toBe(1)
  expect(dossier.evidenceLimits).toContain('not source publication')
 })
 it('does not label exactly 30 days as older than 30 days',()=>{
  expect(buildResearchDossier('m1',[record('boundary',[],now-30*86400000)],now).staleRecordIds).toEqual([])
 })
 it('shows limited scope and disables empty exports',()=>{
  render(<ResearchDossier missionId="m1" records={[]}/>)
  expect(screen.getByRole('button',{name:/Download research dossier/})).toBeDisabled()
  expect(screen.getByText(/not a complete research archive/)).toBeInTheDocument()
 })
 it('downloads only the supplied mission snapshot and releases its object URL',async()=>{
  vi.useFakeTimers()
  let exported:Blob|undefined
  const create=vi.fn((blob:Blob)=>{exported=blob;return 'blob:controlled'})
  const revoke=vi.fn(),click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
  vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:create,revokeObjectURL:revoke}))
  render(<ResearchDossier missionId="selected-mission" records={[record('r1',['https://example.com'])]}/>)
  fireEvent.click(screen.getByRole('button',{name:/Download research dossier/}))
  expect(create).toHaveBeenCalledOnce();expect(exported?.type).toBe('application/json');expect(click).toHaveBeenCalledOnce()
  expect(document.querySelector('a[download]')).toBeNull()
  vi.advanceTimersByTime(1000);expect(revoke).toHaveBeenCalledWith('blob:controlled')
 })
 it('reports download failures without discarding records',()=>{
  vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:()=>{throw Error('unsupported')}}))
  render(<ResearchDossier missionId="m1" records={[record('r1',['https://example.com'])]}/>)
  fireEvent.click(screen.getByRole('button',{name:/Download research dossier/}))
  expect(screen.getByRole('alert')).toHaveTextContent('Could not download')
  expect(screen.getByRole('link',{name:'https://example.com/'})).toBeInTheDocument()
 })
})
