export const requiredBlueprintSections = [
  'Manifest', 'Four-way synthesis', 'Candidate strategies', 'Decision scorecard',
  'System design', 'First experiment', 'Execution sequence', 'Risks and guardrails',
  'Success metrics', 'Novelty hypothesis', 'Next action',
] as const
const normalize = (value:string)=>value.trim().toLowerCase().replace(/[\u2010-\u2015\u2212]/g,'-').replace(/\s+/g,' ')
export function assessBlueprint(blueprint:string) {
 const sections=new Map<string,{count:number;content:boolean}>()
 let fence='',active=''
 for(const line of blueprint.split(/\r?\n/)){
  const marker=line.match(/^ {0,3}(`{3,}|~{3,})/)
  if(marker){
   const current=marker[1]
   if(!fence)fence=current
   else if(current[0]===fence[0]&&current.length>=fence.length)fence=''
   continue
  }
  const heading=!fence&&line.match(/^ {0,3}##\s+(.+?)\s*#*\s*$/)
  if(heading){
   active=normalize(heading[1])
   const previous=sections.get(active)
   sections.set(active,{count:(previous?.count??0)+1,content:previous?.content??false})
   continue
  }
  if(!fence&&/^ {0,3}#\s+/.test(line)){active='';continue}
  // A heading, fence or list marker by itself is not section content.
  if(active&&!/^\s*#{1,6}\s/.test(line)&&/[\p{L}\p{N}]/u.test(line))sections.get(active)!.content=true
 }
 const emptySections=requiredBlueprintSections.filter(name=>sections.has(normalize(name))&&!sections.get(normalize(name))!.content)
 const duplicateSections=requiredBlueprintSections.filter(name=>(sections.get(normalize(name))?.count??0)>1)
 const missingSections=requiredBlueprintSections.filter(name=>!sections.get(normalize(name))?.content||sections.get(normalize(name))!.count!==1)
 return {version:'blueprint-sections-v2' as const,complete:missingSections.length===0,missingSections,emptySections,duplicateSections}
}
