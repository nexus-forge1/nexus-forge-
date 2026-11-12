// @vitest-environment edge-runtime
import {afterEach,it,expect,vi} from 'vitest'
import {sendOtpEmail} from '../convex/otpDelivery'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
function config(){
 vi.stubEnv('OTP_ENDPOINT','https://otp.example.org/send')
 vi.stubEnv('CHAT_ID','fixture-chat');vi.stubEnv('APP_NAME','NEXUS FORGE');vi.stubEnv('SECRET_KEY','fixture-connection-secret')
}
it('preserves the managed OTP payload while refusing redirects and bounding request time',async()=>{
 config();const network=vi.fn().mockResolvedValue(new Response(null,{status:200}));vi.stubGlobal('fetch',network)
 await sendOtpEmail('operator@example.com','123456')
 expect(network).toHaveBeenCalledTimes(1)
 expect(network.mock.calls[0][0]).toBe('https://otp.example.org/send')
 expect(network.mock.calls[0][1]).toMatchObject({method:'POST',redirect:'error',signal:expect.anything()})
 expect(JSON.parse(network.mock.calls[0][1].body)).toEqual({email:'operator@example.com',token:'123456',chatId:'fixture-chat',appName:'NEXUS FORGE',secretKey:'fixture-connection-secret'})
})
it.each(['http://otp.example.org/','https://user:pass@otp.example.org/','https://otp.example.org:8443/','invalid'])('rejects unsafe endpoint %s before sending codes',async endpoint=>{
 config();vi.stubEnv('OTP_ENDPOINT',endpoint);const network=vi.fn();vi.stubGlobal('fetch',network)
 await expect(sendOtpEmail('operator@example.com','123456')).rejects.toThrow(/connection/)
 expect(network).not.toHaveBeenCalled()
})
it('cancels provider reply bodies without consuming or disclosing their contents',async()=>{
 config();let pulls=0;const cancel=vi.fn(),stream=new ReadableStream({pull(c){pulls++;c.enqueue(new TextEncoder().encode('123456 fixture-connection-secret'));},cancel},{highWaterMark:0})
 const network=vi.fn().mockResolvedValue(new Response(stream,{status:429}));vi.stubGlobal('fetch',network)
 await expect(sendOtpEmail('operator@example.com','123456')).rejects.toThrow(/HTTP 429/)
 expect(pulls).toBe(0);expect(cancel).toHaveBeenCalled();expect(network).toHaveBeenCalledTimes(1)
})
it('does not replay unknown delivery or echo transport credentials',async()=>{
 config();const network=vi.fn().mockRejectedValue(new Error('123456 fixture-connection-secret'));vi.stubGlobal('fetch',network)
 try{await sendOtpEmail('operator@example.com','123456');throw Error('Expected rejection')}
 catch(e){expect(String(e)).toContain('could not be confirmed');expect(String(e)).not.toContain('123456');expect(String(e)).not.toContain('fixture-connection-secret')}
 expect(network).toHaveBeenCalledTimes(1)
})
