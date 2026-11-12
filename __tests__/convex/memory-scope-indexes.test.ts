// @vitest-environment edge-runtime
import {describe,it,expect,vi,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
afterEach(()=>vi.useRealTimers())
async function fixture(){
 vi.useFakeTimers();vi.setSystemTime(1000000)
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const ids=await t.run(async ctx=>{
  const mission=(ownerKey:string)=>ctx.db.insert('missions',{ownerKey,title:'Scoped memory',mission:'Read private history',autonomy:'governed',budget:0,status:'draft',completion:0,approved:false})
  const first=await mission('owner'),second=await mission('owner'),foreign=await mission('other')
  for(let i=0;i<300;i++)await ctx.db.insert('memories',{ownerKey:'owner',missionId:second,category:'noise',key:'unrelated-'+i,value:'Unrelated history',confidence:0,source:'test'})
  const rows:string[]=[]
  for(let i=0;i<12;i++){
   vi.advanceTimersByTime(1000)
   rows.push(await ctx.db.insert('memories',{ownerKey:'owner',missionId:i%3===0?second:first,category:i%2===0?'z-last':'a-first',key:'ordered-'+i,value:'Private chronological evidence',confidence:0,source:'test'}))
  }
  await ctx.db.insert('memories',{ownerKey:'other',missionId:foreign,category:'a-first',key:'foreign-private',value:'Foreign evidence',confidence:0,source:'test'})
  await ctx.db.insert('memories',{ownerKey:'owner',category:'a-first',key:'unlinked-private',value:'Owner account evidence',confidence:0,source:'test'})
  return{first,second,foreign,rows}
 })
 return{t,owner,other,...ids}
}
describe('indexed private memory scopes',()=>{
 it('retains chronological order and complete pages across every browse scope',async()=>{
  const{owner,first}=await fixture()
  for(const scope of [{missionId:first},{missionId:first,category:'a-first'},{category:'a-first'},{}]){
   const keys:string[]=[];let cursor:string|null=null
   for(let page=0;page<200;page++){
    const result=await owner.query(api.memory.browse,{...scope,paginationOpts:{numItems:3,cursor}})
    keys.push(...result.page.map(r=>r.key))
    if(result.isDone)break
    cursor=result.continueCursor
   }
   const expected=Array.from({length:12},(_,i)=>i).reverse().filter(i=>(!('missionId'in scope)||i%3!==0)&&(!('category'in scope)||i%2!==0)).map(i=>'ordered-'+i)
   if(!('missionId'in scope))expected.unshift('unlinked-private')
   if(!('category'in scope)&&!('missionId'in scope))expected.push(...Array.from({length:300},(_,i)=>'unrelated-'+(299-i)))
   expect(keys).toEqual(expected)
   expect(new Set(keys).size).toBe(keys.length)
  }
 })
 it('selects the newest exact-mission synthesis and excludes unrelated or foreign evidence',async()=>{
  const{t,owner,other,first,second,foreign}=await fixture()
  await t.run(async ctx=>{
   for(const [missionId,ownerKey,value]of [[first,'owner','earlier'],[second,'owner','different mission'],[first,'owner','newest'],[foreign,'other','foreign']]as const){
    vi.advanceTimersByTime(1000)
    await ctx.db.insert('memories',{ownerKey,missionId,category:'research-synthesis',key:value,value,confidence:.7,source:'test'})
   }
  })
  expect(await t.query(internal.memory.getMissionSynthesis,{missionId:first})).toEqual({value:'newest',confidence:.7,source:'test'})
  await expect(other.query(api.memory.browse,{missionId:first,category:'research-synthesis',paginationOpts:{numItems:3,cursor:null}})).rejects.toThrow(/access denied/)
  await expect(t.query(api.memory.browse,{missionId:first,paginationOpts:{numItems:3,cursor:null}})).rejects.toThrow(/Authenticated/)
  expect((await owner.query(api.memory.browse,{missionId:first,category:'research-synthesis',paginationOpts:{numItems:3,cursor:null}})).page.map(r=>r.value)).toEqual(['newest','earlier'])
 })
 it('retains source validation when indexed links contain malformed or foreign references',async()=>{
  const{t,owner,other,first}=await fixture()
  const source=await t.run(async ctx=>{
   const valid=await ctx.db.insert('memories',{ownerKey:'owner',category:'manifest-blueprint',key:'valid source',value:'Proposal',confidence:.7,source:'test'})
   const foreign=await ctx.db.insert('memories',{ownerKey:'other',category:'manifest-blueprint',key:'foreign source',value:'Private',confidence:.7,source:'test'})
   for(const value of [JSON.stringify({sourceMemoryId:valid}),JSON.stringify({sourceMemoryId:foreign}),'{',JSON.stringify({sourceMemoryId:'invalid'})])await ctx.db.insert('memories',{ownerKey:'owner',missionId:first,category:'mission-source',key:'link',value,confidence:1,source:'mission-source-link'})
   return valid
  })
  expect(await owner.query(api.missionSources.list,{missionId:first})).toEqual([{sourceMemoryId:source,path:'/manifest',key:'valid source'}])
  await expect(other.query(api.missionSources.list,{missionId:first})).rejects.toThrow(/access denied/)
 })
})
