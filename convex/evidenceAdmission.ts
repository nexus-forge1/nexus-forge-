import {ConvexError} from 'convex/values'
export const EVIDENCE_LIMITS={records:100,bytes:4*1024*1024,payload:65536} as const
export function boundEvidence(value:unknown,label='Evidence',max:number=EVIDENCE_LIMITS.payload){
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>max)throw new ConvexError(label+' exceeds its '+max+'-byte safety limit. Existing history is retained.')
}
export async function evidenceWindow<T>(query:AsyncIterable<T>,label:string,limit:number=EVIDENCE_LIMITS.records):Promise<T[]>{
 const rows:T[]=[];let bytes=0
 for await(const row of query){
  if(rows.length>=limit)break
  bytes+=new TextEncoder().encode(JSON.stringify(row)).byteLength
  if(bytes>EVIDENCE_LIMITS.bytes)throw new ConvexError(label+' history exceeds the bounded inspection budget. Review retained history before starting new work.')
  rows.push(row)
 }
 return rows
}
export function requireEvidenceRoom(rows:unknown[],label:string,limit:number=EVIDENCE_LIMITS.records){
 if(rows.length>=limit)throw new ConvexError(label+' history limit reached ('+limit+'). Existing evidence and settlement remain retained. Review capacity before new work; changing missions does not reset owner-wide limits.')
}
// Apply only BEFORE new work/writes, never to authoritative settlement.
export async function admitEvidence(query:AsyncIterable<unknown>,label:string,limit:number=EVIDENCE_LIMITS.records){
 requireEvidenceRoom(await evidenceWindow(query,label,limit),label,limit)
}
export function evidencePage<T extends {numItems:number;cursor:string|null}>(options:T,maxItems=20){
 if(!Number.isInteger(options.numItems)||options.numItems<1||options.numItems>maxItems||options.cursor!==null&&options.cursor.length>8192)throw new ConvexError('History page size or cursor exceeds its safety limit.')
 return {...options,maximumRowsRead:Math.max(40,maxItems*2),maximumBytesRead:maxItems>20?4*1024*1024:1024*1024}
}
