import {describe,it,expect} from 'vitest'
import {buildBlueprintPrompt,blueprintOutputTokens} from '../convex/blueprintGeneration'
import {requiredBlueprintSections} from '../convex/blueprintCompleteness'
const input={intent:'Create a bakery daily planning checklist',domain:'Small software tool',budget:4,horizon:'one day',constraints:'No external action. Keep data local.',acceptanceCriteria:'A working proposal with measurable acceptance.'}
describe('compact blueprint generation contract',()=>{
 it('preserves exact user context and every required section below the shared truncation limit',()=>{
  const prompt=buildBlueprintPrompt(input)
  expect(prompt.length).toBeLessThan(7801)
  for(const section of requiredBlueprintSections)expect(prompt).toContain('## '+section)
  expect(prompt).toContain(JSON.stringify(input))
  expect(prompt).toContain('450–650 words')
  expect(prompt).toContain('distinct mechanisms')
  expect(blueprintOutputTokens).toBe(3000)
 })
 it('rejects oversized context before shared provider truncation can discard constraints',()=>{
  expect(()=>buildBlueprintPrompt({...input,intent:'i'.repeat(3000),constraints:'c'.repeat(2000),acceptanceCriteria:'a'.repeat(2000)})).toThrow(/no inference was started/)
 })
 it('keeps a bounded but detailed request unchanged when it fits',()=>{
  const detailed={...input,constraints:'Keep all data private. '.repeat(30),acceptanceCriteria:'Measure every completed task. '.repeat(25)}
  expect(buildBlueprintPrompt(detailed)).toContain(JSON.stringify(detailed))
 })
})
