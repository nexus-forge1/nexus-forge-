import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export function useActiveMission() {
  const [selectedId, setMissionIdState] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const sync = () => {
      setMissionIdState(window.sessionStorage.getItem('nexus-forge-active-mission') as Id<'missions'> | null)
      setLoaded(true)
    }
    sync()
    window.addEventListener('nexus-active-mission-changed', sync)
    return () => window.removeEventListener('nexus-active-mission-changed', sync)
  }, [])
  const setMissionId = (id: Id<'missions'> | null) => {
    setMissionIdState(id)
    if (typeof window !== 'undefined') {
      if (id) window.sessionStorage.setItem('nexus-forge-active-mission', id)
      else window.sessionStorage.removeItem('nexus-forge-active-mission')
      window.dispatchEvent(new Event('nexus-active-mission-changed'))
    }
  }
  const selection = useQuery(api.missions.selection, selectedId ? { id: selectedId } : 'skip')
  const mission = selection?._id === selectedId ? selection : selection === null ? null : undefined
  const missionId = mission?._id as Id<'missions'> | undefined ?? null
  // A saved session can outlive a deleted or inaccessible mission. Clear that stale
  // selection once Convex resolves it to null so pages can return to the empty state.
  useEffect(() => {
    if (selectedId && mission === null) {
      setMissionIdState(null)
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('nexus-forge-active-mission')
        window.dispatchEvent(new Event('nexus-active-mission-changed'))
      }
    }
  }, [selectedId, mission])
  const research = useQuery(api.research.list, missionId ? { missionId } : 'skip')
  const agents = useQuery(api.forge.listRuns, missionId ? { missionId } : 'skip')
  const artifacts = useQuery(api.artifacts.list, missionId ? { missionId } : 'skip')
  const deliveries = useQuery(api.delivery.list, missionId ? { missionId } : 'skip')
  const measurements = useQuery(api.verification.measurements, missionId ? { missionId } : 'skip')
  const sourceLinks = useQuery(api.missionSources.list, missionId ? { missionId } : 'skip')
  const evidenceLoading = !loaded || (!!selectedId && mission === undefined) || (!!missionId && [research, agents, artifacts, deliveries, measurements, sourceLinks].some(value => value === undefined))
  const councilComplete = !!agents?.length && agents.every(run => run.status === 'complete')
  const hasResearch = !!research?.some(row => (row.citations?.length ?? 0) > 0)
  const hasVerifiedArtifact = !!artifacts?.some(item => item.status === 'verified' || item.status === 'ready')
  const hasApprovedArtifact = !!artifacts?.some(item => item.status === 'ready')
  const hasApprovedDelivery = !!deliveries?.some(item => item.approved && ['github', 'test', 'build', 'deploy', 'verified', 'complete'].includes(item.stage))
  return { sourceLinks: sourceLinks ?? [], evidenceLoading, missionId, setMissionId, loaded, mission, research: research ?? [], agents: agents ?? [], artifacts: artifacts ?? [], deliveries: deliveries ?? [], measurements: measurements ?? [], councilComplete, hasResearch, hasVerifiedArtifact, hasApprovedArtifact, hasApprovedDelivery }
}
