import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {EvaluationLab} from '../components/evaluation-lab'
import {BenchmarkMatrixTable} from '../components/benchmark-matrix-table'
import {CompetencyEvaluationRegistry} from '../components/competency-evaluation-registry'
export const Route=createFileRoute('/evaluations')({head:()=>routeHead('/evaluations'),component:Page})
function Page(){return <WorkspaceLayout title="Evaluation Lab" eyebrow="INTELLIGENCE / COMPETENCY BASELINE"><EvaluationLab/><BenchmarkMatrixTable/><CompetencyEvaluationRegistry/></WorkspaceLayout>}
