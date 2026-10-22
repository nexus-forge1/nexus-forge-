import {afterEach,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import {createHash} from 'node:crypto'
import schema from '../convex/schema'
import {api,internal} from '../convex/_generated/api'
const modules=import.meta.glob('../convex/**/*.ts')
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals()})
it('polls without a user session only for the opted-in feed, checks the Git blob and deduplicates unchanged report bytes across commits',async()=>{
 vi.useFakeTimers();vi.stubEnv('GITHUB_ACCESS_TOKEN','fixture-token');const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),missionId=await t.run(c=>c.db.insert('missions',{ownerKey:'owner',title:'Feed fixture',mission:'Controlled scheduled feed',autonomy:'governed',budget:0,status:'draft',completion:0,approved:false}));
 const report={version:'product-outcome-v1',missionId,metric:'task-success-rate',observed:9,target:80,sampleSize:10,periodStart:100,periodEnd:200,method:'Fixed population of ten synthetic tasks',evidence:['https://example.com/fixture'],notes:'Synthetic source; no production result claimed'},bytes=Buffer.from(JSON.stringify(report)),path='nexus-forge-outcomes/'+missionId+'/daily.json';
 let commit='a'.repeat(40);const network=vi.fn(async(url:any)=>String(url).endsWith('/commits/main')?Response.json({sha:commit}):Response.json({type:'file',path,encoding:'base64',size:bytes.length,sha:createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),content:bytes.toString('base64')}));vi.stubGlobal('fetch',network);
 const feedId=await owner.mutation(api.outcomeFeeds.create,{missionId,reportId:'daily'});
 await t.action(internal.productEvidenceImport.pollFeed,{feedId,generation:1});expect((await owner.query(api.verification.productOutcomes,{paginationOpts:{numItems:20,cursor:null}})).page).toHaveLength(1);
 commit='b'.repeat(40);await t.action(internal.productEvidenceImport.pollFeed,{feedId,generation:1,sequence:1});expect((await owner.query(api.verification.productOutcomes,{paginationOpts:{numItems:20,cursor:null}})).page).toHaveLength(1);
 expect((await owner.query(api.outcomeFeeds.list,{}))[0]).toMatchObject({lastCommit:commit,lastError:''});
 await owner.mutation(api.outcomeFeeds.setEnabled,{feedId,enabled:false});const calls=network.mock.calls.length;await t.action(internal.productEvidenceImport.pollFeed,{feedId,generation:1});expect(network).toHaveBeenCalledTimes(calls);
})
