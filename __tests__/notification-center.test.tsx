import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {getFunctionName} from 'convex/server'
import {NotificationCenter} from '../src/components/notification-center'
const mocks=vi.hoisted(()=>({query:vi.fn(),mutation:vi.fn()}))
vi.mock('@tanstack/react-router',()=>({Link:({to,children,...props}:any)=><a href={to} {...props}>{children}</a>}))
vi.mock('convex/react',()=>({useQuery:(ref:any,args:any)=>mocks.query(getFunctionName(ref),args),useMutation:()=>mocks.mutation}))
const notifications=[
 {_id:'n-1',title:'Template saved',detail:'First',path:'/templates',read:false,createdAt:1},
 {_id:'n-2',title:'Client review received',detail:'Second',path:'/client-delivery',read:false,createdAt:2},
 {_id:'n-3',title:'Older event',detail:'Already handled',path:'/changes',read:true,createdAt:3},
]
beforeEach(()=>{
 mocks.query.mockReset()
 mocks.mutation.mockReset()
 mocks.query.mockImplementation((name:string)=>name==='studio:notifications'?notifications:[])
 mocks.mutation.mockResolvedValue(null)
})
describe('Notification Center',()=>{
 it('marks only loaded unread notifications read and confirms the scope',async()=>{
  render(<NotificationCenter/>)
  fireEvent.click(screen.getByRole('button',{name:'Mark all loaded read'}))
  await waitFor(()=>expect(mocks.mutation).toHaveBeenCalledTimes(2))
  expect(mocks.mutation).toHaveBeenNthCalledWith(1,{id:'n-1',read:true})
  expect(mocks.mutation).toHaveBeenNthCalledWith(2,{id:'n-2',read:true})
  expect(await screen.findByRole('status')).toHaveTextContent('Marked 2 loaded notifications as read.')
 })
 it('retains an error when one of the bulk updates fails',async()=>{
  mocks.mutation.mockRejectedValueOnce(new Error('Notification permission denied'))
  render(<NotificationCenter/>)
  fireEvent.click(screen.getByRole('button',{name:'Mark all loaded read'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Notification permission denied')
 })
})
