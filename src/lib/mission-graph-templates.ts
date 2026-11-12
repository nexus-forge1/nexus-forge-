import type {GraphNode,GraphDesign} from '../../convex/missionGraphModel'
export type MissionType=GraphDesign['missionType']
function node(key:string,specialist:string,dependsOn:string[],inputKinds:GraphNode['inputKinds'],outputKind:GraphNode['outputKind'],acceptance:string):GraphNode{return{key,specialist,dependsOn,inputKinds,outputKind,acceptance}}
export function graphTemplate(type:MissionType):GraphNode[]{
 if(type==='research')return[
 node('research','Research Oracle',[],['brief'],'evidence','Supply sourced claims and explicit gaps.'),
 node('audit','Evidence Auditor',['research'],['evidence'],'verification','Check each claim against exact references; report uncertainty.'),
 node('decision','Decision Analyst',['research','audit'],['evidence','verification'],'decision','Recommend a bounded next test or stop, preserving human review.')]
 if(type==='build')return[
 node('plan','Planner',[],['brief'],'plan','Specify requirements, interfaces and acceptance criteria.'),
 node('architecture','Systems Engineer',['plan'],['plan'],'analysis','Review technical dependencies and permission boundaries.'),
 node('ux','Creative Director',['plan'],['plan'],'analysis','Specify responsive loading, error and permission states.'),
 node('build','Builder',['architecture','ux'],['analysis'],'implementation','Supply an implementation reference and test evidence.'),
 node('verify','Test and Security Reviewer',['build'],['implementation'],'verification','Check tests and access controls independently of the supplied build summary.'),
 node('decision','Release Reviewer',['verify','build'],['verification','implementation'],'decision','Record readiness gaps and the required approval; do not deploy.')]
 if(type==='growth')return[
 node('market','Market Analyst',[],['brief'],'evidence','Separate demand evidence from assumptions.'),
 node('experiment','Experiment Designer',['market'],['evidence'],'plan','Specify comparison, guardrails and decision rule.'),
 node('creative','Creative Director',['experiment'],['plan'],'implementation','Supply campaign drafts and instrumented destination references.'),
 node('measure','Measurement Reviewer',['creative','experiment'],['implementation','plan'],'verification','Check metric definitions and causal limitations.'),
 node('decision','Growth Decision Analyst',['market','measure'],['evidence','verification'],'decision','Recommend keep, revise or stop with human review.')]
 return[
 node('diagnose','Diagnostics',[],['brief'],'analysis','Identify affected services, observations and unknowns.'),
 node('reproduce','Reproduction Specialist',['diagnose'],['analysis'],'evidence','Supply a bounded reproduction and exact failure evidence.'),
 node('repair','Repair Engineer',['reproduce'],['evidence'],'implementation','Supply the smallest proposed repair and recovery constraints.'),
 node('regression','Regression Reviewer',['repair'],['implementation'],'verification','Check the reproduction and meaningful regression evidence.'),
 node('decision','Incident Reviewer',['regression','diagnose'],['verification','analysis'],'decision','Record remaining risk and explicit production approval requirements.')]
}
export const defaultGraphLimits={maxSteps:20,maxToolCalls:20,maxTokens:10000,maxWallSeconds:3600,maxReplans:2,parallelism:2}
