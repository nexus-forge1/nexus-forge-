import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {ArtifactsPage} from '../src/routes/artifacts'
const state=vi.hoisted(()=>({download:vi.fn(),mutate:vi.fn(),action:vi.fn()}))
vi.mock('../src/lib/artifact-download',()=>({downloadArtifact:state.download}))
vi.mock('convex/react',()=>({useMutation:()=>state.mutate,useAction:()=>state.action}))
vi.mock('@tanstack/react-router',()=>({createFileRoute:()=>()=>({}),Link:({children,to}:any)=><a href={to}>{children}</a>}))
vi.mock('../src/components/workspace-layout',()=>({WorkspaceLayout:({children}:any)=><main>{children}</main>}))
vi.mock('../src/components/artifact-revision',()=>({ArtifactRevision:()=>null}))
vi.mock('../src/components/artifact-browser-checks',()=>({ArtifactBrowserChecks:()=>null}))
vi.mock('../src/hooks/use-active-mission',()=>({useActiveMission:()=>({
 evidenceLoading:false,missionId:'mission',mission:{approved:true,mission:'Controlled contract',title:'Mission'},councilComplete:true,hasResearch:true,research:[],
 artifacts:[{_id:'first',name:'First draft',content:'<p>First Café 🚀</p>',status:'verification_failed'},{_id:'second',name:'Second draft',content:'<p>Second snapshot</p>',status:'ready'}]
})}))
beforeEach(()=>{vi.clearAllMocks();state.download.mockResolvedValue({filename:'nexus-forge-first.html',bytes:24,sha256:'controlled-digest'})})
afterEach(cleanup)
it('downloads only the selected saved draft and reports a request without changing approvals',async()=>{
 const {container}=render(<ArtifactsPage/>)
 const row=container.querySelector('[data-artifact-id="first"]') as HTMLElement
 fireEvent.click(within(row).getByRole('button',{name:'Download saved HTML'}))
 expect(await screen.findByRole('status')).toHaveTextContent('Download requested: nexus-forge-first.html')
 expect(screen.getByRole('status')).toHaveTextContent('Browser acceptance is not a saved-file confirmation')
 expect(state.download).toHaveBeenCalledWith('first','<p>First Café 🚀</p>')
 expect(state.mutate).not.toHaveBeenCalled();expect(state.action).not.toHaveBeenCalled()
})
it('shows download failures and keeps the selected content available for another attempt',async()=>{
 state.download.mockRejectedValueOnce(new Error('Browser download unavailable'))
 const {container}=render(<ArtifactsPage/>)
 const row=container.querySelector('[data-artifact-id="second"]') as HTMLElement
 fireEvent.click(within(row).getByRole('button',{name:'Download saved HTML'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Browser download unavailable')
 expect(within(row).getByRole('button',{name:'Download saved HTML'})).toBeEnabled()
 expect(state.mutate).not.toHaveBeenCalled();expect(state.action).not.toHaveBeenCalled()
})
