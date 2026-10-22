import { useConvexAuth, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"

/**
 * Query mission history only after Convex confirms an authenticated operator session.
 * The surrounding AuthWrapper controls rendered content, but hooks run before that
 * wrapper can gate children, so protected queries must be skipped here as well.
 */
export function useOwnedMissions(ownerKey: string, numItems: number) {
  const { isAuthenticated } = useConvexAuth()
  return useQuery(
    api.missions.list,
    isAuthenticated
      ? { ownerKey, paginationOpts: { numItems, cursor: null } }
      : "skip",
  )
}
