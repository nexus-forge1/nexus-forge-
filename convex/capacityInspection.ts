export const CAPACITY_INSPECTION_LIMITS={records:500,bytes:4*1024*1024}as const
export function capacityBudget(){return{records:0,bytes:0,exhausted:false}}
export type CapacityBudget=ReturnType<typeof capacityBudget>
export async function inspectCapacity<T>(query:AsyncIterable<T>,limit:number,budget:CapacityBudget,include:(row:T)=>boolean=()=>true){
 if(budget.exhausted||budget.records>=CAPACITY_INSPECTION_LIMITS.records||budget.bytes>=CAPACITY_INSPECTION_LIMITS.bytes){budget.exhausted=true;return{count:0,complete:false,readLimited:true}}
 let count=0
 for await(const row of query){
  const bytes=new TextEncoder().encode(JSON.stringify(row)).byteLength
  if(budget.records>=CAPACITY_INSPECTION_LIMITS.records||budget.bytes+bytes>CAPACITY_INSPECTION_LIMITS.bytes){
   budget.exhausted=true
   return{count,complete:false,readLimited:true}
  }
  budget.records++;budget.bytes+=bytes
  if(include(row))count++
  if(count>limit)return{count,complete:false,readLimited:false}
 }
 return{count,complete:true,readLimited:false}
}
