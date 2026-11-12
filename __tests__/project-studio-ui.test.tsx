import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
import {MissionTemplates} from '../src/components/mission-templates'
import {ProductSpecifications} from '../src/components/product-specifications'
import {DocumentKnowledge} from '../src/components/document-knowledge'
import {NotificationCenter} from '../src/components/notification-center'
import {ClientDeliveryPortal} from '../src/components/client-delivery-portal'
const mocks=vi.hoisted(()=>({query:vi.fn(),mutation:vi.fn()}))
vi.mock('@tanstack/react-router',()=>({Link:({to,children,...props}:any)=><a href={to} {...props}>{children}</a>}))
vi.mock('convex/react',()=>({useQuery:(ref:any,args:any)=>mocks.query(getFunctionName(ref),args),useMutation:()=>mocks.mutation}))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs',()=>({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[]})})}),destroy:async()=>{}})}))
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
 it('saves each real newline in mission acceptance criteria as a separate criterion',async()=>{
  mocks.mutation.mockResolvedValue('template-1')
  render(<MissionTemplates/>)
  fireEvent.change(screen.getByLabelText('Acceptance criteria · one per line'),{target:{value:'First check'+String.fromCharCode(10)+'Second check'+String.fromCharCode(10)+'Third check'}})
  fireEvent.click(screen.getByRole('button',{name:'Save private template'}))
  await waitFor(()=>expect(mocks.mutation).toHaveBeenCalledWith(expect.objectContaining({criteria:['First check','Second check','Third check']})))
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
 it('renders actual multi-line source boundaries and pins the chosen range',async()=>{
  const source='First line'+String.fromCharCode(10)+'Second line'+String.fromCharCode(10)+'Third line'
  mocks.query.mockImplementation((name:string)=>name==='studio:projects'?[project]:name==='studio:documents'?[{_id:'doc-2',name:'multi.md',sha256:'b'.repeat(64),format:'md'}]:name==='studio:document'?{name:'multi.md',content:source,sha256:'b'.repeat(64)}:name==='studio:passages'?[]:[])
  mocks.mutation.mockResolvedValue('passage-1')
  render(<DocumentKnowledge/>)
  fireEvent.click(screen.getByRole('button',{name:'multi.md · MD'}))
  expect(await screen.findByText((_,el)=>el?.tagName==='PRE'&&el.textContent==='1: First line'+String.fromCharCode(10)+'2: Second line'+String.fromCharCode(10)+'3: Third line')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('First source line'),{target:{value:'1'}})
  fireEvent.change(screen.getByLabelText('Last source line'),{target:{value:'2'}})
  fireEvent.click(screen.getByRole('button',{name:'Pin exact passage'}))
  await waitFor(()=>expect(mocks.mutation).toHaveBeenCalledWith({documentId:'doc-2',firstLine:1,lastLine:2}))
 })
 it('offers explicit OCR when an uploaded PDF has no selectable text',async()=>{
  const file=new File(['scanned pdf'],'scan.pdf',{type:'application/pdf'})
  Object.defineProperty(file,'arrayBuffer',{value:async()=>new ArrayBuffer(8)})
  mocks.query.mockImplementation((name:string)=>name==='studio:projects'?[project]:name==='studio:document'?undefined:[])
  render(<DocumentKnowledge/>)
  fireEvent.change(screen.getByLabelText('Upload document'),{target:{files:[file]}})
  expect(await screen.findByRole('button',{name:'Run local English OCR'})).toBeInTheDocument()
  expect(screen.getByText(/PDF itself stays local/)).toBeInTheDocument()
 })
 it('renders retained source passages as inert text and labels the supported format boundary',async()=>{
  mocks.query.mockImplementation((name:string)=>name==='studio:projects'?[project]:name==='studio:documents'?[{_id:'doc-1',name:'source.md',sha256:'a'.repeat(64),format:'md'}]:name==='studio:document'?{name:'source.md',content:'<img src=x onerror=alert(1)>',sha256:'a'.repeat(64)}:[])
  const {container}=render(<DocumentKnowledge/>)
  expect(screen.getByText(/PDF\/DOCX extraction runs locally in your browser/)).toBeInTheDocument()
  expect(screen.getByText(/scanned PDFs support opt-in English OCR/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'source.md · MD'}))
  expect(await screen.findByText('1: <img src=x onerror=alert(1)>')).toBeInTheDocument()
  expect(container.querySelector('img')).toBeNull()
 })
 it('surfaces retained client acceptance and revision counts in the delivery inventory',()=>{
  mocks.query.mockImplementation((name:string)=>name==='studio:projects'?[project]:name==='artifacts:list'?[{_id:'artifact-1',name:'Release candidate',status:'ready'}]:name==='clientDelivery:list'?[{_id:'portal-1',name:'Release candidate',recipientId:'recipient-1',expiresAt:Date.now()+86400000,revoked:false,createdAt:1,mine:true,feedbackCount:3,acceptedCount:2,revisionCount:1,lastFeedbackAt:1234}]:[])
  render(<ClientDeliveryPortal />)
  expect(screen.getByText(/Client feedback: 3 total · 2 accepted · 1 revision requests/)).toBeInTheDocument()
 })
 it('shows only actual unread notifications when filtered and sends an explicit read-state mutation',async()=>{
  mocks.query.mockImplementation((name:string)=>name==='studio:notifications'?[{_id:'n-1',title:'Specification revision saved',detail:'Pilot revision 1',path:'/changes',read:false,createdAt:1},{_id:'n-2',title:'Old read event',detail:'Existing history',path:'/templates',read:true,createdAt:1}]:[])
  mocks.mutation.mockResolvedValue(null)
  render(<NotificationCenter/>)
  fireEvent.click(screen.getByLabelText('Unacknowledged only'))
  expect(screen.queryByText('Old read event')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Acknowledge'}))
  await waitFor(()=>expect(mocks.mutation).toHaveBeenCalledWith({id:'n-1',read:true}))
  expect(screen.getByRole('link',{name:'Open related page →'})).toHaveAttribute('href','/changes')
 })
})
