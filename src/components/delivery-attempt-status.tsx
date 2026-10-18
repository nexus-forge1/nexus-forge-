import {useQuery} from 'convex/react'
import {api} from '../../convex/_generated/api'
import type {Id} from '../../convex/_generated/dataModel'
export function DeliveryAttemptStatus({id}:{id:Id<'deliveries'>}){
 const attempt=useQuery(api.deliveryDispatch.status,{id})
 if(!attempt)return null
 return <div className="research-card">
 <p role={attempt.status==='uncertain'?'alert':'status'}>{attempt.status==='running'?'Delivery attempt in progress. Wait for confirmation; do not submit it again.':attempt.status==='uncertain'?'Delivery outcome requires review. A remote write may have completed; do not start it again.':attempt.status==='dispatched'?'Dispatch confirmed. Repeated requests reuse this saved receipt.':attempt.status==='reviewed'?'Failed QA run reviewed. An explicit retry uses the same approved artifact and target.':'Target checks stopped before external writes. Review the failure before requesting fresh approval.'}</p>
 <p>Attempt {attempt.generation}{attempt.commitSha?' · Commit '+attempt.commitSha:''}</p>
 {attempt.message&&<p>{attempt.message}</p>}
 </div>
}
