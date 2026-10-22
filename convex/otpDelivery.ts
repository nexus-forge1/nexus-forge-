// Preserve the managed OTP payload; never parse or expose its response body.
export async function sendOtpEmail(email:string,token:string){
 const endpoint=process.env.OTP_ENDPOINT
 let url:URL
 try{url=new URL(endpoint??'')}catch{throw Error('Verification email connection is unavailable')}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Verification email connection must use secure HTTPS')
 let response:Response
 try{
  response=await fetch(url.toString(),{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({email,token,chatId:process.env.CHAT_ID,appName:process.env.APP_NAME||'My App',secretKey:process.env.SECRET_KEY}),
  })
 }catch{throw Error('Verification email delivery could not be confirmed. Check your inbox before requesting another code.')}
 await response.body?.cancel().catch(()=>{})
 if(!response.ok)throw Error('Verification email could not be confirmed (HTTP '+response.status+'). Check your inbox before requesting another code.')
}
