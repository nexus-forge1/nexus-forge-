import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
import {MissionTemplates} from '../src/components/mission-templates'
import {ProductSpecifications} from '../src/components/product-specifications'
import {DocumentKnowledge} from '../src/components/document-knowledge'
import {NotificationCenter} from '../src/components/notification-center'
const mocks=vi.hoisted(()=>({query:vi.fn(),mutation:vi.fn()}))
vi.mock('@tanstack/react-router',()=>({Link:({to,children,...props}:any)=><a href={to} {...props}>{children}</a>}))
vi.mock('convex/react',()=>({useQuery:(ref:any,args:any)=>mocks.query(getFunctionName(ref),args),useMutation:()=>mocks.mutation}))
const project={_id:'project-1',title:'Private pilot',missionId:'mission-1',description:'A controlled project',createdAt:1}
const requirement={key:'create-task',title:'Create task',role:'Customer',route:'/tasks',entity:'Task',acceptance:'Task survives reload'}
beforeEach(()=>{sessionStorage.clear();mocks.mutation.mockReset();mocks.query.mockReset();mocks.query.mockImplementation((name:string)=>name==='studio:projects'?[project]:[])})
describe('dedicated project tools',()=>{
 it('retains a template draft and reports an actual save failure',async()=>{
  mocks.mutation.mockRejectedValue(new Error('Template limit reached'))
  render(<MissionTemplates/>)
  const title=screen.getByLabelText('Template name')
  fireEvent.change(title,{target:{value:'Keep this draft'}})
  fireEvent.click(screen.getByRole('button',{name:'Save private template'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Template limit reached')
  expect(title).toHaveValue('Keep this draft')
  expect(screen.getByRole('button',{name:'Save private template'})).toBeEnabled()
 })
 it('uses the selected saved revision and retains requirements on stale-write rejection',async()=>{
  mocks.query.mockImplementation((name:string)=>name==='studio:projects'?[project]:name==='studio:specifications'?[{_id:'spec-1',revision:1,roles:['Customer'],requirements:[requirement],createdAt:1}]:[])
  mocks.mutation.mockRejectedValue(new Error('Specification changed. Reload the latest revision before saving.'))
  render(<ProductSpecifications/>)
  fireEvent.click(screen.getByRole('button',{name:'Load latest saved revision'}))
  fireEvent.change(screen.getByLabelText('Observable acceptance criterion'),{target:{value:'Edited exact acceptance'}})
  fireEvent.click(screen.getByRole('button',{name:'Compile immutable specification'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Specification changed')
  expect(screen.getByLabelText('Observable acceptance criterion')).toHaveValue('Edited exact acceptance')
  expect(mocks.mutation).toHaveBeenCalledWith(expect.objectContaining({projectId:'project-1',expectedRevision:1,requirements:[expect.objectContaining({acceptance:'Edited exact acceptance'})]}))
 })
 it('renders retained source passages as inert text and labels the supported format boundary',async()=>{
  mocks.query.mockImplementation((name:string)=>name==='studio:projects'?[project]:name==='studio:documents'?[{_id:'doc-1',name:'source.md',sha256:'a'.repeat(64),format:'md'}]:name==='studio:document'?{name:'source.md',content:'<img src=x onerror=alert(1)>',sha256:'a'.repeat(64)}:[])
  const {container}=render(<DocumentKnowledge/>)
  expect(screen.getByText(/PDF\/DOCX extraction/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'source.md'}))
  expect(await screen.findByText('1: <img src=x onerror=alert(1)>')).toBeInTheDocument()
  expect(container.querySelector('img')).toBeNull()
 })
 it('shows only actual unread notifications when filtered and sends an explicit read-state mutation',async()=>{
  mocks.query.mockImplementation((name:string)=>name==='studio:notifications'?[{_id:'n-1',title:'Specification revision saved',detail:'Pilot revision 1',path:'/changes',read:false,createdAt:1},{_id:'n-2',title:'Old read event',detail:'Existing history',path:'/templates',read:true,createdAt:1}]:[])
  mocks.mutation.mockResolvedValue(null)
  render(<NotificationCenter/>)
  fireEvent.click(screen.getByLabelText('Unread only'))
  expect(screen.queryByText('Old read event')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Mark read'}))
  await waitFor(()=>expect(mocks.mutation).toHaveBeenCalledWith({id:'n-1',read:true}))
  expect(screen.getByRole('link',{name:'Open related page →'})).toHaveAttribute('href','/changes')
 })
})
