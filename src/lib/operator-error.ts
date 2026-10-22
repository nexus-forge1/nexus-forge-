import {ConvexError} from 'convex/values'
export function operatorError(error:unknown,fallback:string){
 if(error instanceof ConvexError)return typeof error.data==='string'&&error.data.trim()?error.data.slice(0,800):fallback
 if(error instanceof Error&&error.message&&!/^\[CONVEX\s/.test(error.message))return error.message.slice(0,800)
 return fallback
}
