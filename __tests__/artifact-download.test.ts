import {afterEach,expect,it,vi} from 'vitest'
import {Blob as NodeBlob} from 'node:buffer'
import {createHash,webcrypto} from 'node:crypto'
import {downloadArtifact} from '../src/lib/artifact-download'
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML=''})
function setup(){
 vi.useFakeTimers()
 vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('Blob',NodeBlob)
 const create=vi.fn().mockReturnValue('blob:controlled')
 const revoke=vi.fn()
 vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke})
 return {create,revoke}
}
it('exports exact source bytes and digest, without rendering or modifying the source',async()=>{
 const {create,revoke}=setup()
 const content='<!doctype html>\r\n<p>Café 🚀</p><script>throw new Error("never executed")</script>\n'
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){
  expect(this.download).toBe('nexus-forge-fixture1.html');expect(this.getAttribute('href')).toBe('blob:controlled')
 })
 const receipt=await downloadArtifact('fixture1',content)
 const bytes=Buffer.from(await create.mock.calls[0][0].arrayBuffer())
 expect(bytes.equals(Buffer.from(content,'utf8'))).toBe(true)
 expect(receipt).toEqual({filename:'nexus-forge-fixture1.html',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
 expect(click).toHaveBeenCalledOnce();expect(document.querySelector('a')).toBeNull()
 expect(revoke).not.toHaveBeenCalled();vi.advanceTimersByTime(30000)
 expect(revoke).toHaveBeenCalledWith('blob:controlled')
})
it('removes temporary links and releases the URL after a browser rejection',async()=>{
 const {revoke}=setup()
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{throw new Error('browser rejected download')})
 await expect(downloadArtifact('fixture2','source')).rejects.toThrow(/browser rejected/)
 expect(document.querySelector('a')).toBeNull();vi.advanceTimersByTime(30000)
 expect(revoke).toHaveBeenCalledOnce()
})
it('does not create a download before hashing succeeds',async()=>{
 const {create}=setup()
 vi.stubGlobal('crypto',{subtle:{digest:vi.fn().mockRejectedValue(new Error('hash unavailable'))}})
 await expect(downloadArtifact('fixture3','source')).rejects.toThrow(/hash unavailable/)
 expect(create).not.toHaveBeenCalled()
})
