const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export function haveDistinctStrategyIdentities(rows:{name:string;mechanism:string}[]){
 const names=rows.map(row=>normalize(row.name)),mechanisms=rows.map(row=>normalize(row.mechanism))
 return rows.length>0&&names.every(Boolean)&&mechanisms.every(Boolean)&&new Set(names).size===rows.length&&new Set(mechanisms).size===rows.length
}
