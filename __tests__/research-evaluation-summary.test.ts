import {describe,it,expect} from 'vitest'
import {summarize} from '../convex/frontierSupport'
const row=(baseline:number,candidate:number,domain='training')=>({baseline,candidate,domain})
describe('recorded research evaluation summaries',()=>{
 it('exposes a held-out miss even when the aggregate exceeds its target',()=>{
  const result=summarize([row(0,10),row(0,10),row(0,-1,'held')],'higher',1,3,['training','held'],['held'])
  expect(result).toMatchObject({ready:true,targetMet:true,improved:2,regressed:1,heldOutReady:true,heldOutTargetMet:false,heldOutStatus:'domain-target-missed'})
 })
 it('applies the same direction and frozen target to each held-out domain mean',()=>{
  const result=summarize([row(10,7),row(10,8,'held')],'lower',2,2,['training','held'],['held'])
  expect(result).toMatchObject({meanImprovement:2.5,targetMet:true,heldOutTargetMet:true,improved:2,regressed:0})
 })
 it('keeps missing held-out coverage inconclusive without manufacturing a failed observation',()=>{
  const result=summarize([row(0,10),row(0,10)],'higher',1,2,['training','held'],['held'])
  expect(result).toMatchObject({ready:false,targetMet:false,heldOutReady:false,heldOutTargetMet:null,heldOutStatus:'insufficient',regressed:0})
 })
 it('retains negative and unchanged science observations without requiring a held-out split',()=>{
  const result=summarize([row(5,3),row(5,5)],'higher',1,2,['training'],[])
  expect(result).toMatchObject({ready:true,targetMet:false,regressed:1,unchanged:1,heldOutStatus:'not-applicable',heldOutTargetMet:null})
  expect(result.claim).toContain('no general superiority')
 })
})
