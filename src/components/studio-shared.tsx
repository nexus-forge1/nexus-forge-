import {useEffect,useState} from 'react'
import {useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
export function useStudioProject(){
 const projects=useQuery(api.studio.projects,{})
 const [requested,setRequested]=useState('')
 useEffect(()=>{setRequested(window.sessionStorage.getItem('nexus-studio-project')??'')},[])
 const project=projects?.find(p=>p._id===requested)??projects?.[0]
 const projectId=project?._id
 function select(id:string){setRequested(id);window.sessionStorage.setItem('nexus-studio-project',id)}
 return{projects,project,projectId,select}
}
export function ProjectPicker({studio}:{studio:ReturnType<typeof useStudioProject>}){
 return studio.projects===undefined?<p role="status">Loading projects…</p>:studio.projects.length===0?<p>Create a project from Mission Templates first.</p>:<label>Active project<select value={studio.projectId??''} onChange={e=>studio.select(e.target.value)}>{studio.projects.map(p=><option key={p._id} value={p._id}>{p.title}</option>)}</select></label>
}
export function downloadJson(name:string,data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export const message=(error:unknown)=>error instanceof Error?error.message:'Unable to save. Your draft is retained.'
