// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api} from '../../convex/_generated/api'
import {applyDirectoryGrants,email} from '../../convex/teamProvisioning'
import {verifiedWorkspaceProfile} from '../../convex/enterpriseIdentity'
const modules=import.meta.glob('../../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'})
 const teamId=await owner.mutation(api.forgeTeams.create,{name:'Identity safety'})
 return {t,owner,teamId}
}
const address='person@example.com'
describe('team identity safety',()=>{
 it.each(['a@example.com@elsewhere.com','a b@example.com','a@@example.com'])('rejects malformed verified email %s',value=>{
  expect(()=>email(value)).toThrow(/Valid email/)
  expect(()=>verifiedWorkspaceProfile({sub:'id',email:value,email_verified:true,hd:'example.com'},'example.com')).toThrow(/Workspace/)
 })
 it('does not silently transfer a linked grant to a new account after email reassignment',async()=>{
  const {t,owner,teamId}=await fixture()
  const first=await t.run(c=>c.db.insert('users',{email:address,emailVerificationTime:1}))
  await owner.mutation(api.teamProvisioning.provision,{teamId,entries:[{email:address,role:'contributor'}]})
  const second=await t.run(async c=>{
   await c.db.patch(first,{email:'previous@example.com'})
   return c.db.insert('users',{email:address,emailVerificationTime:2})
  })
  await t.run(c=>applyDirectoryGrants(c,second))
  expect((await owner.query(api.teamProvisioning.list,{teamId}))[0].operatorId).toBe(first)
  expect((await t.withIdentity({subject:first}).query(api.forgeTeams.detail,{teamId})).role).toBe('contributor')
  await expect(t.withIdentity({subject:second}).query(api.forgeTeams.detail,{teamId})).rejects.toThrow(/permission denied/)
  // The admin can deliberately reconcile the changed verified identity.
  await owner.mutation(api.teamProvisioning.provision,{teamId,entries:[{email:address,role:'viewer'}]})
  expect((await owner.query(api.teamProvisioning.list,{teamId}))[0].operatorId).toBe(second)
  await expect(t.withIdentity({subject:first}).query(api.forgeTeams.detail,{teamId})).rejects.toThrow(/permission denied/)
  expect((await t.withIdentity({subject:second}).query(api.forgeTeams.detail,{teamId})).role).toBe('viewer')
 })
 it('rejects duplicates hidden behind unverified candidates in both preview and apply',async()=>{
  const {t,owner,teamId}=await fixture()
  await t.run(c=>c.db.insert('users',{email:address}))
  const first=await t.run(c=>c.db.insert('users',{email:address,emailVerificationTime:1}))
  await t.run(c=>c.db.insert('users',{email:address,emailVerificationTime:2}))
  const input={teamId,entries:[{email:address,role:'viewer' as const}]}
  await expect(owner.mutation(api.teamProvisioning.provision,input)).rejects.toThrow(/Ambiguous/)
  await expect(owner.query(api.teamDirectorySync.preview,{...input,revokeMissing:false})).rejects.toThrow(/Ambiguous/)
  await t.run(c=>applyDirectoryGrants(c,first))
  expect(await owner.query(api.teamProvisioning.list,{teamId})).toEqual([])
  expect((await owner.query(api.forgeTeams.detail,{teamId})).memberships).toHaveLength(1)
 })
 it('fails closed at the bounded identity scan even if only one returned account is verified',async()=>{
  const {t,owner,teamId}=await fixture()
  for(let i=0;i<4;i++)await t.run(c=>c.db.insert('users',{email:address,...(i===0?{emailVerificationTime:1}:{})}))
  await expect(owner.mutation(api.teamProvisioning.provision,{teamId,entries:[{email:address,role:'viewer'}]})).rejects.toThrow(/Ambiguous/)
  expect((await owner.query(api.forgeTeams.detail,{teamId})).memberships).toHaveLength(1)
 })
 it('leaves linked grants and access untouched when a second verified account signs in',async()=>{
  const {t,owner,teamId}=await fixture()
  const first=await t.run(c=>c.db.insert('users',{email:address,emailVerificationTime:1}))
  await owner.mutation(api.teamProvisioning.provision,{teamId,entries:[{email:address,role:'contributor'}]})
  const second=await t.run(c=>c.db.insert('users',{email:address,emailVerificationTime:2}))
  await t.run(c=>applyDirectoryGrants(c,second))
  expect((await owner.query(api.teamProvisioning.list,{teamId}))[0].operatorId).toBe(first)
  expect((await t.withIdentity({subject:first}).query(api.forgeTeams.detail,{teamId})).role).toBe('contributor')
  await expect(t.withIdentity({subject:second}).query(api.forgeTeams.detail,{teamId})).rejects.toThrow()
 })
})
