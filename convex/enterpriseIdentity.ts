export function workspaceDomain(value: string | undefined) {
 const domain = value?.trim().toLowerCase()
 return domain && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ? domain : null
}
export function enterpriseConfigured(env: Record<string,string|undefined>) {
 return Boolean(env.AUTH_GOOGLE_ID?.trim() && env.AUTH_GOOGLE_SECRET?.trim() && workspaceDomain(env.AUTH_GOOGLE_HOSTED_DOMAIN))
}
export function verifiedWorkspaceProfile(profile: {sub?:unknown;email?:unknown;email_verified?:unknown;hd?:unknown;name?:unknown;picture?:unknown}, domain: string) {
 if (typeof profile.sub !== 'string' || !profile.sub ||
     typeof profile.email !== 'string' || profile.email.length > 254 ||
     !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(profile.email) ||
     profile.email_verified !== true || typeof profile.hd !== 'string' ||
     profile.hd.toLowerCase() !== domain ||
     profile.email.toLowerCase().split('@')[1] !== domain) {
  throw Error('Verified configured Google Workspace identity required')
 }
 return {id:profile.sub,email:profile.email.toLowerCase(),emailVerified:true,
  ...(typeof profile.name === 'string' ? {name:profile.name} : {}),
  ...(typeof profile.picture === 'string' ? {image:profile.picture} : {})}
}
