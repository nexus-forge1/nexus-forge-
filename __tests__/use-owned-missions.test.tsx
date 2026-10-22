import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "../convex/_generated/api"

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  useQuery: vi.fn(),
}))

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: authState.isAuthenticated }),
  useQuery: authState.useQuery,
}))

import { useOwnedMissions } from "../src/hooks/use-owned-missions"

describe("useOwnedMissions", () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.useQuery.mockReset()
  })

  it("skips protected mission history until the operator is authenticated", () => {
    renderHook(() => useOwnedMissions("local-workspace", 20))
    expect(authState.useQuery).toHaveBeenCalledWith(api.missions.list, "skip")
  })

  it("queries the requested page after authentication resolves", () => {
    authState.isAuthenticated = true
    authState.useQuery.mockReturnValue({ page: [] })
    renderHook(() => useOwnedMissions("local-workspace", 50))
    expect(authState.useQuery).toHaveBeenCalledWith(api.missions.list, {
      ownerKey: "local-workspace",
      paginationOpts: { numItems: 50, cursor: null },
    })
  })
})
