import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

function parsePaths(text: string): string[] | null {
 try {
  const value: unknown = JSON.parse(text);
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string') ? value : null;
 } catch { return null; }
}
function parseFiles(text: string): Array<{path: string; content: string; language: string}> {
 try {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) return [];
  return value.map((item: unknown) => {
   if (!item || typeof item !== 'object') throw new Error('Invalid file');
   const file = item as Record<string, unknown>;
   if (typeof file.path !== 'string' || typeof file.content !== 'string' || (file.language !== undefined && typeof file.language !== 'string')) throw new Error('Invalid file');
   return {path: file.path, content: file.content, language: typeof file.language === 'string' ? file.language : 'typescript'};
  });
 } catch { return []; }
}

export function VisualBuilderSyncInspector() {
 const [stateText,sState]=useState('["Card","Card.props.density"]');
 const [astText,sAst]=useState('["Card","Card.props.density"]');
 const [requestKey,sRequest]=useState('visual-sync-1'),[projectKey,sProject]=useState('nexus-forge'),[revision,sRevision]=useState(1);
 const [filesText,sFiles]=useState('[{"path":"src/generated/Component.tsx","content":"export const Component = () => null;","language":"typescript"}]');
 const [excludeText,sExclude]=useState('node_modules\n.env');
 const [result,sResult]=useState(''),[error,sError]=useState(''),[busy,sBusy]=useState(false);
 const state=parsePaths(stateText),ast=parsePaths(astText),files=parseFiles(filesText);
 const diff=useQuery(api.scopeDFunctionsBatchTwo.diffVisualStateToAst,state&&ast?{state,ast}:'skip');
 const sync=useMutation(api.scopeDFunctionsBatchTwo.syncVisualCodeRevision),exportCode=useAction(api.scopeDFunctionsBatchTwo.generateCleanCodeExport);
 async function run(fn:()=>Promise<unknown>) {
  sBusy(true);sError('');sResult('');
  try {sResult(JSON.stringify(await fn(),null,2));}
  catch(e) {sError(e instanceof Error?e.message:'Operation failed');}
  finally {sBusy(false);}
 }
 async function recordSync() {
  if (!diff || !state || !ast) throw new Error('Wait for a valid path comparison before recording a revision.');
  return sync({requestKey,projectKey,revision,stateDigest:diff.stateDigest,astDigest:diff.astDigest,diff:[
   ...diff.additions.map(path=>({path,kind:'add' as const,summary:'Present in AST paths only'})),
   ...diff.removals.map(path=>({path,kind:'remove' as const,summary:'Present in visual state paths only'})),
  ]});
 }
 return <section className="glass-card research-card" aria-labelledby="d20-title">
  <p className="section-kicker">SCOPE D · D20</p><h2 id="d20-title">Visual state and AST synchronization</h2>
  <label>Visual state paths (JSON array)<textarea rows={4} value={stateText} onChange={e=>sState(e.target.value)}/></label>
  <label>AST paths (JSON array)<textarea rows={4} value={astText} onChange={e=>sAst(e.target.value)}/></label>
  <div aria-live="polite"><h3>Reactive diff</h3><p>{!state||!ast?'Enter JSON arrays containing path strings.':diff===undefined?'Loading diff…':JSON.stringify(diff,null,2)}</p></div>
  <label>Request key<input value={requestKey} onChange={e=>sRequest(e.target.value)} required/></label>
  <label>Project key<input value={projectKey} onChange={e=>sProject(e.target.value)} required/></label>
  <label>Revision<input type="number" min={0} value={revision} onChange={e=>sRevision(Number(e.target.value))}/></label>
  <button type="button" disabled={busy||!requestKey.trim()||!projectKey.trim()||!state||!ast||!diff||!Number.isSafeInteger(revision)||revision<0} onClick={()=>void run(recordSync)}>Sync revision</button>
  <label>Export files JSON<textarea rows={4} value={filesText} onChange={e=>sFiles(e.target.value)}/></label>
  {!files.length&&<p>Enter a non-empty array of files with path and content strings; language defaults to typescript.</p>}
  <label>Exclude patterns<textarea value={excludeText} onChange={e=>sExclude(e.target.value)}/></label>
  <button type="button" disabled={busy||!files.length} onClick={()=>void run(()=>exportCode({files,excludePatterns:excludeText.split('\n').map(x=>x.trim()).filter(Boolean)}))}>Generate clean code export</button>
  {error&&<p role="alert">{error}</p>}{result&&<pre aria-live="polite">{result}</pre>}
 </section>;
}
