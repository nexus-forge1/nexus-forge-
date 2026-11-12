import {describe,it,expect} from 'vitest'
import {extractSourceContent} from '../convex/researchSourceModel'
const now=Date.UTC(2026,9,18)
const meta=(value:string,field='article:published_time')=>'<meta content="'+value+'" property="'+field+'">'
describe('source content provenance extraction',()=>{
 it('extracts title/text without executing or retaining scripts and styles',()=>{
  const result=extractSourceContent('<title>Report &amp; evidence</title><style>secret-style</style><p>A &#65; &#x42; &lt;claim&gt;</p><script>secret-code</script>','text/html',now)
  expect(result.title).toBe('Report & evidence')
  expect(result.extractedText).toContain('A A B <claim>')
  expect(result.extractedText).not.toContain('secret-')
 })
 it('drops comments and truncated scripts from bounded responses',()=>{
  const result=extractSourceContent('<p>Visible evidence.</p><!-- ignored > text --><script>hidden truncated code','text/html',now)
  expect(result.extractedText).toBe('Visible evidence.')
 })
 it('preserves bounded text and reports truncation',()=>{
  const result=extractSourceContent('x'.repeat(25000),'text/plain',now)
  expect(result.extractedText).toHaveLength(24000);expect(result.textTruncated).toBe(true)
 })
 it('retains a valid declared date without inventing one from a generic date or modified field',()=>{
  expect(extractSourceContent(meta('2026-10-01T12:00:00Z'),'text/html',now)).toMatchObject({publicationStatus:'declared',publicationDate:'2026-10-01T12:00:00.000Z'})
  expect(extractSourceContent(meta('2026-10-01','date')+meta('2026-10-02','article:modified_time'),'text/html',now).publicationStatus).toBe('unknown')
 })
 it.each([['2026-02-30','invalid'],['tomorrow','invalid'],['2027-01-01','future']])('marks declaration %s as %s',(value,status)=>{
  const result=extractSourceContent(meta(value),'text/html',now)
  expect(result.publicationStatus).toBe(status);expect(result.publicationDate).toBeUndefined()
 })
 it('retains conflicting publication declarations rather than choosing a date',()=>{
  const result=extractSourceContent(meta('2026-10-01')+meta('2026-10-02','datepublished'),'text/html',now)
  expect(result.publicationStatus).toBe('conflicting');expect(result.dateDeclarations).toHaveLength(2)
 })
})
