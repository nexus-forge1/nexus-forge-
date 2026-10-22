import {useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {CollectionKind} from '../../convex/recordCapacityModel'
function CapacityRow({id,label}:{id:CollectionKind;label:string}){
 const row=useQuery(api.resourceCapacity.collection,{id})
 const uncertain=row?.readLimited&&row.count<row.limit
 return <tr data-testid="capacity-row" data-collection={id} data-state={row===undefined?'loading':'ready'}>
 <th scope="row">{label}{row&&<p className="muted-copy">{row.scope}</p>}</th>
 {row===undefined?<td colSpan={4} role="status">Loading count…</td>:<><td>{uncertain&&row.count===0?'Not established':<>{row.complete?'':'At least '}{row.count}</>}</td><td>{row.limit}</td><td>{uncertain?'Not established':row.remaining}</td><td>{uncertain?'Review required':row.blocked?'Limit reached':'Available'}</td></>}
 </tr>
}
export function ResourceCapacity(){
 const data=useQuery(api.resourceCapacity.catalog,{})
 return <div className="glass-card research-card" data-testid="resource-capacity" data-state={data===undefined?'loading':'ready'}>
 <h2>Record capacity</h2>
 {data===undefined?<p role="status">Loading private admission counts…</p>:<>
 <p>{data.scope}</p>
 <div style={{overflowX:'auto'}}><table aria-label="Account admission counts"><thead><tr><th>Collection</th><th>Counted records</th><th>Limit</th><th>New records available</th><th>Admission</th></tr></thead><tbody>{data.collections.map(row=><CapacityRow key={row.id} {...row}/>)}</tbody></table></div>
 <h3>Limits for related records</h3><p>These are limits for each named parent. They are not account-wide counts or remaining slots. Open the relevant feature to review a specific parent’s saved evidence.</p>
 <div style={{overflowX:'auto'}}><table aria-label="Parent-specific admission limits"><thead><tr><th>Record</th><th>Applies to</th><th>Limit</th><th>Retained evidence</th></tr></thead><tbody>{data.scopedLimits.map(row=><tr key={row.id}><th scope="row">{row.label}</th><td>{row.parent}</td><td>{row.limit}</td><td>{row.note}</td></tr>)}</tbody></table></div>
 <p>Lowering a limit retains existing evidence. This view does not delete records or restart work. Manual saves support up to 65,536 UTF-8 bytes of content; automatically generated evidence follows its own feature limits.</p>
 </>}
 </div>
}
