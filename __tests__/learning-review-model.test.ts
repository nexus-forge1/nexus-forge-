import {describe,it,expect} from 'vitest'
import {buildLearningReview} from '../convex/learningReviewModel'
const rank=(ids:string[])=>({results:ids.map(id=>({id})),precisionAt5:999})
const retrieval=(id:string,search:string,baseline:string[],candidate:string[])=>({id,value:JSON.stringify({version:'lesson-retrieval-v1',search,missionId:'mission',expected:[{id:'relevant'}],baseline:rank(baseline),candidate:rank(candidate)})})
const reuse=(id:string,a:number,b:number,mission=id)=>({id,value:JSON.stringify({version:'strategy-reuse-v1',applied:true,strategyId:'strategy',lessonId:'lesson',direction:'lower',baseline:{id:id+'a',missionId:'baseline',metric:'actual runtime cost',unit:'USD',target:10,actual:a},candidate:{id:id+'b',missionId:mission,metric:'actual runtime cost',unit:'USD',target:10,actual:b}})})
describe('learning evidence review model',()=>{
 it('recomputes rankings and keeps regressions visible when the mean improves',()=>{
  const report=buildLearningReview('retrieval',[retrieval('1','question one',[],['relevant']),retrieval('2','question two',['relevant'],[]),retrieval('3','question three',[],['relevant'])])
  expect(report.status).toBe('regression-observed')
  expect(report.metrics[0]).toMatchObject({improved:2,regressed:1,unchanged:0})
  expect(report.metrics[0].benefitMean).toBeGreaterThan(0)
  expect(report.metrics[0].candidateMean).toBeLessThan(1)
 })
 it('rejects repeated task labels, duplicate rank IDs and insufficient evidence',()=>{
  expect(()=>buildLearningReview('retrieval',[retrieval('1',' Same Query ',[],[]),retrieval('2','same query',[],[])])).toThrow(/Repeated search/)
  expect(()=>buildLearningReview('retrieval',[retrieval('1','one',['relevant','relevant'],[]),retrieval('2','two',[],[])])).toThrow(/Duplicate ranked/)
  expect(()=>buildLearningReview('retrieval',[])).toThrow(/2–20/)
 })
 it('reports no improvement for unchanged repeated observations',()=>{
  expect(buildLearningReview('retrieval',[retrieval('1','one',[],[]),retrieval('2','two',[],[])]).status).toBe('no-improvement-observed')
 })
 it('normalizes lower-is-better reuse outcomes and retains negative runs',()=>{
  const report=buildLearningReview('reuse',[reuse('1',10,5),reuse('2',10,11)])
  expect(report.metrics[0]).toMatchObject({baselineMean:10,candidateMean:8,benefitMean:2,improved:1,regressed:1})
  expect(report.status).toBe('regression-observed')
 })
 it('rejects reused measurements, repeated candidate missions and mixed targets',()=>{
  const first=reuse('1',10,5),second=reuse('2',10,6)
  const altered=JSON.parse(second.value);altered.baseline.id='1a'
  expect(()=>buildLearningReview('reuse',[first,{...second,value:JSON.stringify(altered)}])).toThrow(/measurement cannot be reused/)
  expect(()=>buildLearningReview('reuse',[first,reuse('2',10,6,'1')])).toThrow(/different candidate missions/)
  const target=JSON.parse(second.value);target.baseline.target=target.candidate.target=11
  expect(()=>buildLearningReview('reuse',[first,{...second,value:JSON.stringify(target)}])).toThrow(/same lesson/)
 })
 it('rejects product comparisons with unequal sample or method conditions',()=>{
  const a=JSON.parse(reuse('1',10,5).value),b=JSON.parse(reuse('2',10,6).value)
  for(const row of [a,b]){row.version='strategy-reuse-product-v1';for(const side of ['baseline','candidate'])Object.assign(row[side],{sampleSize:10,periodStart:100,periodEnd:200,method:'Same method'})}
  b.candidate.sampleSize=9
  expect(()=>buildLearningReview('reuse',[{id:'1',value:JSON.stringify(a)},{id:'2',value:JSON.stringify(b)}])).toThrow(/Product samples/)
 })
})
