import {beforeEach,describe,it,expect,vi} from 'vitest'
import {cleanup,render,screen,within} from '@testing-library/react'
import {MissionPage} from '../src/routes/mission'
const state=vi.hoisted(()=>({guide:{} as any}))
vi.mock('../src/lib/use-mission-guide',()=>({useMissionGuide:()=>state.guide}))
vi.mock('convex/react',()=>({useConvexAuth:()=>({isAuthenticated:true}),useQuery:()=>({page:[]}),useMutation:()=>vi.fn()}))
vi.mock('@tanstack/react-router',()=>({
 createFileRoute:()=> (options:unknown)=>options,
 useRouterState:()=>'/mission',
 Link:({to,children,...props}:any)=><a href={to} {...props}>{children}</a>,
}))
vi.mock('../src/components/workspace-layout',()=>({WorkspaceLayout:({children}:any)=><main>{children}</main>}))
beforeEach(()=>{
 cleanup();sessionStorage.clear()
 state.guide={evidenceLoading:false,missionId:null,setMissionId:vi.fn(),mission:null,sourceLinks:[],nextStage:{title:'Define mission',path:'/mission',note:'Define an outcome.'}}
})
function approved(path:string,title:string){
 state.guide={...state.guide,missionId:'m1',mission:{title:'Existing mission',mission:'Build a useful page',status:'running',approved:true,budget:25,autonomy:'Approval required'},nextStage:{path,title,note:'Continue with saved evidence.'}}
}
describe('Mission Console entry and continuation',()=>{
 it.each(['complete','cancelled'])('does not offer approval or execution for a %s mission',status=>{
  approved('/council','Run Council');state.guide.mission.status=status;state.guide.mission.approved=false
  render(<MissionPage/>)
  expect(screen.queryByRole('button',{name:'Approve mission contract'})).toBeNull()
  expect(within(screen.getByTestId('mission-next-step')).getByRole('link')).toHaveAttribute('href',status==='complete'?'/learning':'#mission-contract')
 })
 it.each([true,false])('keeps review-held missions on portfolio review even with approved=%s',value=>{
  approved('/council','Run Council');state.guide.mission.status='review';state.guide.mission.approved=value
  render(<MissionPage/>)
  expect(screen.queryByRole('button',{name:'Approve mission contract'})).toBeNull()
  expect(within(screen.getByTestId('mission-next-step')).getByRole('link')).toHaveAttribute('href','/portfolio')
 })
 it('leads a new user to the mission contract without premature Council navigation',()=>{
  render(<MissionPage/>)
  expect(within(screen.getByTestId('mission-next-step')).getByRole('link')).toHaveAttribute('href','#mission-contract')
  expect(screen.queryByRole('link',{name:/Continue to AI Council/})).toBeNull()
  expect(screen.getByLabelText('DESIRED OUTCOME')).toHaveAttribute('aria-describedby','mission-brief-help')
 })
 it('keeps an unapproved mission at its contract review',()=>{
  approved('/mission','Review mission authorization');state.guide.mission.approved=false
  render(<MissionPage/>)
  expect(within(screen.getByTestId('mission-next-step')).getByRole('link')).toHaveAttribute('href','#active-mission-contract')
 })
 it.each([['/council','Complete AI Council planning'],['/evidence','Gather cited research'],['/delivery','Resolve blocked delivery']])('resumes saved next action at %s',(path,title)=>{
  approved(path,title);render(<MissionPage/>)
  const panel=within(screen.getByTestId('mission-next-step'))
  expect(panel.getByRole('heading',{name:title})).toBeInTheDocument()
  expect(panel.getByRole('link')).toHaveAttribute('href',path)
 })
 it('continues a completed mission to learning',()=>{
  approved('/learning','Done');state.guide.mission.status='complete';state.guide.nextStage=undefined;render(<MissionPage/>)
  expect(within(screen.getByTestId('mission-next-step')).getByRole('link')).toHaveAttribute('href','/learning')
 })
})
