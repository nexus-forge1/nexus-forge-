import {v} from 'convex/values'
export const sourceSnapshotFields={finalUrl:v.string(),contentType:v.string(),httpStatus:v.number(),title:v.string(),extractedText:v.string(),textTruncated:v.boolean(),bodyBytes:v.number(),bodyLimitReached:v.boolean(),bodySha256:v.string(),textSha256:v.string(),capturedAt:v.number(),publicationStatus:v.union(v.literal('declared'),v.literal('unknown'),v.literal('invalid'),v.literal('future'),v.literal('conflicting')),publicationDate:v.optional(v.string()),dateDeclarations:v.array(v.object({field:v.string(),value:v.string()}))}
export const sourceCaptureFields={missionId:v.id('missions'),researchId:v.id('research'),ownerKey:v.string(),citation:v.string(),status:v.union(v.literal('pending'),v.literal('captured'),v.literal('failed')),createdAt:v.number(),failureReason:v.optional(v.string()),snapshot:v.optional(v.object(sourceSnapshotFields))}
function decode(text:string){
 return text.replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(raw,value)=>{const code=value[0].toLowerCase()==='x'?parseInt(value.slice(1),16):Number(value);return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):raw}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,name)=>(({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[name.toLowerCase()]??' '))
}
function clean(html:string){return decode(html.replace(/<!--[\s\S]*?(?:-->|$)/g,' ').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim()}
function parseDate(value:string){
 const date=value.slice(0,10)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return null
 if(value!==date&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null
 const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(parsed).toISOString():null
}
export function extractSourceContent(body:string,contentType:string,now:number){
 const html=/text\/html|application\/xhtml\+xml/i.test(contentType)
 const declarations:{field:string;value:string}[]=[]
 if(html)for(const tag of body.match(/<meta\b[^>]*>/gi)??[]){
  const attrs:Record<string,string>={}
  for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[match[1].toLowerCase()]=decode(match[2]??match[3]??match[4]??'')
  const field=(attrs.property??attrs.name??'').toLowerCase()
  if(['article:published_time','datepublished','dc.date.issued','dcterms.issued'].includes(field)&&attrs.content&&declarations.length<8)declarations.push({field,value:attrs.content.trim().slice(0,160)})
 }
 const dates=declarations.map(d=>{try{return parseDate(d.value)}catch{return null}})
 const valid=dates.filter((date):date is string=>date!==null)
 const days=new Set(valid.map(date=>date.slice(0,10)))
 const status=!declarations.length?'unknown':dates.some(date=>date===null)?'invalid':days.size>1?'conflicting':valid.some(date=>Date.parse(date)>now)?'future':'declared'
 const extracted=html?clean(body):body.replace(/\s+/g,' ').trim()
 return {title:html?clean(body.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]??'').slice(0,300):'',extractedText:extracted.slice(0,24000),textTruncated:extracted.length>24000,publicationStatus:status as 'unknown'|'invalid'|'conflicting'|'future'|'declared',...(status==='declared'?{publicationDate:valid[0]}:{}),dateDeclarations:declarations}
}
