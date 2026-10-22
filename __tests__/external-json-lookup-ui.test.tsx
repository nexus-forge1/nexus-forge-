import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {ExternalJsonLookup} from '../src/components/external-json-lookup'
import type {Id} from '../convex/_generated/dataModel'
const state=vi.hoisted(()=>({run:vi.fn(),enable:vi.fn()}))
vi.mock('convex/react',()=>({useAction:()=>state.run,useMutation:()=>state.enable}))
const adapter={_id:'controlled-adapter' as Id<'externalAdapters'>,endpoint:'https://example.com/lookup',enabled:true}
beforeEach(()=>{vi.clearAllMocks();state.run.mockResolvedValue('retained receipt')})
afterEach(cleanup)
function input(){fireEvent.change(screen.getByLabelText('Explicit input JSON'),{target:{value:'{"query":"controlled"}'}})}
it('reuses the same key and exact input for an explicit completed receipt lookup',async()=>{
 render(<ExternalJsonLookup adapter={adapter}/>)
 const key=(screen.getByLabelText('Request key') as HTMLInputElement).value
 input();fireEvent.click(screen.getByRole('button',{name:'Run or retrieve this request'}))
 expect(await screen.findByText('retained receipt')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Run or retrieve this request'}))
 await waitFor(()=>expect(state.run).toHaveBeenCalledTimes(2))
 expect(state.run.mock.calls.map(call=>call[0])).toEqual([{adapterId:adapter._id,requestKey:key,input:'{"query":"controlled"}'},{adapterId:adapter._id,requestKey:key,input:'{"query":"controlled"}'}])
})
it('retains the original key and input after an uncertain failure and does not retry automatically',async()=>{
 state.run.mockRejectedValue(new Error('Review receipt before retrying'))
 render(<ExternalJsonLookup adapter={adapter}/>)
 input()
 const key=(screen.getByLabelText('Request key') as HTMLInputElement).value
 fireEvent.click(screen.getByRole('button',{name:'Run or retrieve this request'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Review receipt')
 expect(state.run).toHaveBeenCalledTimes(1)
 expect(screen.getByLabelText('Request key')).toHaveValue(key)
 expect(screen.getByLabelText('Explicit input JSON')).toHaveValue('{"query":"controlled"}')
})
it('requires an explicit new-key action and does not perform a call merely by changing it',()=>{
 render(<ExternalJsonLookup adapter={adapter}/>)
 input()
 const old=(screen.getByLabelText('Request key') as HTMLInputElement).value
 fireEvent.change(screen.getByLabelText('Explicit input JSON'),{target:{value:'{"query":"changed"}'}})
 expect(screen.getByLabelText('Request key')).toHaveValue(old)
 fireEvent.click(screen.getByRole('button',{name:'Start a new request key'}))
 expect((screen.getByLabelText('Request key') as HTMLInputElement).value).not.toBe(old)
 expect(screen.getByLabelText('Explicit input JSON')).toHaveValue('{"query":"changed"}')
 expect(state.run).not.toHaveBeenCalled()
})
it('prevents new calls through a revoked adapter while leaving its key inspectable',()=>{
 render(<ExternalJsonLookup adapter={{...adapter,enabled:false}}/>)
 expect(screen.getByRole('button',{name:'Run or retrieve this request'})).toBeDisabled()
 expect(screen.getByRole('button',{name:'Start a new request key'})).toBeDisabled()
 expect(screen.getByLabelText('Request key')).toBeEnabled()
})
