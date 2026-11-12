import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
import {TeamGovernance} from '../src/components/team-governance'
const state=vi.hoisted(()=>({revoked:false,mutation:vi.fn()}))
vi.mock('convex/react',()=>({
 useMutation:()=>state.mutation,
 useQuery:(ref:any)=>{
  const name=getFunctionName(ref)
  if(name==='forgeTeams:list')return [{_id:'membership',teamId:'team',name:'Controlled team',role:'viewer',status:'active'}]
  if(name==='forgeTeams:detail'){
   if(state.revoked)throw new Error('Team not found or permission denied')
   return {team:{_id:'team',name:'Controlled team'},role:'viewer',memberships:[],notes:[{_id:'note',text:'Shared controlled note',author:'owner',createdAt:1}]}
  }
  return []
 }
}))
vi.mock('../src/components/team-directory',()=>({TeamDirectory:()=>null}))
vi.mock('../src/components/shared-team-missions',()=>({SharedTeamMissions:()=>null}))
beforeEach(()=>{state.revoked=false;vi.clearAllMocks();vi.spyOn(console,'error').mockImplementation(()=>{})})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('removes inaccessible notes and offers a usable return when a team subscription is revoked',()=>{
 const {rerender}=render(<TeamGovernance/>)
 fireEvent.click(screen.getByRole('button',{name:'Open team'}))
 expect(screen.getByText('Shared controlled note')).toBeInTheDocument()
 state.revoked=true;rerender(<TeamGovernance/>)
 expect(screen.queryByText('Shared controlled note')).not.toBeInTheDocument()
 expect(screen.getByRole('alert')).toHaveTextContent('membership or permissions may have changed')
 fireEvent.click(screen.getByRole('button',{name:'Return to teams'}))
 expect(screen.queryByRole('alert')).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Create team'})).toBeEnabled()
 expect(state.mutation).not.toHaveBeenCalled()
})
it('can reopen the team after a deliberate new access decision',()=>{
 state.revoked=true
 render(<TeamGovernance/>)
 fireEvent.click(screen.getByRole('button',{name:'Open team'}))
 fireEvent.click(screen.getByRole('button',{name:'Return to teams'}))
 state.revoked=false
 fireEvent.click(screen.getByRole('button',{name:'Open team'}))
 expect(screen.getByText('Shared controlled note')).toBeInTheDocument()
 expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
