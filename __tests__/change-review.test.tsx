import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
import {ChangeReview} from '../src/components/change-review'
const mocks=vi.hoisted(()=>({query:vi.fn(),mutation:vi.fn()}))
vi.mock('@tanstack/react-router',()=>({Link:({to,children,...props}:any)=><a href={to} {...props}>{children}</a>}))
vi.mock('convex/react',()=>({useQuery:(ref:any,args:any)=>mocks.query(getFunctionName(ref),args),useMutation:()=>mocks.mutation}))
const project={_id:'project-1',title:'Multiline review',missionId:'mission-1',description:'Test',createdAt:1}
const artifacts=[
 {_id:'artifact-old',missionId:'mission-1',type:'web-app',name:'Baseline',content:'First line\nSecond line\nThird line',status:'ready',requiresApproval:false,qualityChecks:[],qualityScore:1,qualityPassed:true},
 {_id:'artifact-new',missionId:'mission-1',type:'web-app',name:'Candidate',content:'First line\nUpdated second line\nThird line',status:'verified',requiresApproval:true,qualityChecks:[],qualityScore:1,qualityPassed:true},
]
beforeEach(()=>{
 sessionStorage.clear()
 mocks.mutation.mockReset()
 mocks.query.mockReset()
 mocks.query.mockImplementation((name:string)=>name==='studio:projects'?[project]:name==='artifacts:list'?artifacts:name==='studio:specifications'?[]:[])
})
describe('Change Review',()=>{
 it('compares actual multiline artifact content by line and shows real line breaks',()=>{
  render(<ChangeReview/>)
  fireEvent.change(screen.getByLabelText('Baseline artifact'),{target:{value:'artifact-old'}})
  fireEvent.change(screen.getByLabelText('Candidate artifact'),{target:{value:'artifact-new'}})
  expect(screen.getByText('1 positional line differences. Showing the first 100.')).toBeInTheDocument()
  expect(screen.getByText((_,el)=>el?.tagName==='PRE'&&el.textContent==='Line 2\nBefore: Second line\nAfter: Updated second line')).toBeInTheDocument()
 })
})
