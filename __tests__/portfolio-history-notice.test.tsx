import {render,screen,cleanup} from '@testing-library/react'
import {describe,it,expect,afterEach} from 'vitest'
import {PortfolioHistoryNotice} from '../src/components/portfolio-history-notice'
afterEach(cleanup)
describe('portfolio history scope notice',()=>{
 it('discloses sample-only counts and retained evidence',()=>{
  render(<PortfolioHistoryNotice scope={{complete:false,note:'Counts describe only this sample. No older evidence was deleted.'}}/>)
  expect(screen.getByRole('status').textContent).toContain('Partial history sample')
  expect(screen.getByRole('status').textContent).toContain('only this sample')
  expect(screen.getByRole('status').textContent).toContain('No older evidence was deleted.')
 })
 it('does not report complete history as partial',()=>{
  render(<PortfolioHistoryNotice scope={{complete:true,note:'Complete'}}/>)
  expect(screen.queryByRole('status')).toBeNull()
 })
 it('supports older responses without scope metadata',()=>{
  render(<PortfolioHistoryNotice/>)
  expect(screen.queryByRole('status')).toBeNull()
 })
})
