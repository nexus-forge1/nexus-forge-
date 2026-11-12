import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Check freshness hourly so a missed or stale recovery point is detected promptly.
// This monitors evidence only; it does not capture or move backup archives.
crons.hourly('backup recovery freshness monitor', { minuteUTC: 15 }, internal.backupMonitor.check)

export default crons
