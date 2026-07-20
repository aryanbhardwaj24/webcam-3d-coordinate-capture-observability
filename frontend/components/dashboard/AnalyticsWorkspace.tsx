"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { AnalyticsCenter } from "@/components/dashboard/AnalyticsCenter"
import { OperatorShell } from "@/components/dashboard/OperatorShell"
import { ProfileMenu } from "@/components/dashboard/ProfileMenu"
import { StatStrip } from "@/components/dashboard/StatStrip"
import { Button } from "@/components/ui/Button"
import { useAuth } from "@/components/providers/AuthProvider"
import { combineArchivedCaptureSessions, useLocalArchivedCaptureSessions } from "@/lib/analytics/sessionArchives"
import { listPersistedCaptureSessions } from "@/lib/analytics/supabaseSync"

export function AnalyticsWorkspace() {
  const router = useRouter()
  const { user } = useAuth()
  const localArchivedSessions = useLocalArchivedCaptureSessions()
  const [cloudArchivedSessions, setCloudArchivedSessions] = React.useState<typeof localArchivedSessions>([])
  const [loadingArchivedSessions, setLoadingArchivedSessions] = React.useState(true)
  const [pastSessionsOpen, setPastSessionsOpen] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    async function loadArchivedSessions() {
      if (!user) {
        setCloudArchivedSessions([])
        setLoadingArchivedSessions(false)
        return
      }

      setLoadingArchivedSessions(true)

      try {
        const sessions = await listPersistedCaptureSessions(user.id)
        if (!cancelled) {
          setCloudArchivedSessions(sessions)
        }
      } catch {
        if (!cancelled) {
          setCloudArchivedSessions([])
        }
      } finally {
        if (!cancelled) {
          setLoadingArchivedSessions(false)
        }
      }
    }

    void loadArchivedSessions()

    return () => {
      cancelled = true
    }
  }, [user])

  const archivedSessions = React.useMemo(
    () => combineArchivedCaptureSessions(localArchivedSessions, cloudArchivedSessions),
    [cloudArchivedSessions, localArchivedSessions]
  )
  const hasArchivedSessions = archivedSessions.length > 0

  return (
    <OperatorShell
      title="Analytics review center"
      description="Inspect recent capture history, review combined session metrics, and export archived bundles without leaving the browser workflow."
      status="standby"
      allowPageScroll
      plainBackground
      solidHeader
      headerControls={
        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap justify-end gap-3">
            {hasArchivedSessions ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPastSessionsOpen(true)}
                title="Review your saved capture sessions."
              >
                Past Sessions
              </Button>
            ) : null}
            {!hasArchivedSessions ? (
              <Button type="button" variant="primary" onClick={() => router.push("/capture")}>
                Capture
              </Button>
            ) : null}
          </div>
          <div className="flex justify-end">
            <ProfileMenu />
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        <StatStrip
          items={[
            { label: "Archive model", value: "Supabase + Drive", detail: "Session summaries stay queryable while heavy bundles remain file-based." },
            { label: "Retention", value: "Last 5 sessions", detail: "Older sessions are pruned automatically after cloud sync succeeds." },
            { label: "Analytics scope", value: hasArchivedSessions ? "Combined recent history" : "Awaiting first capture", detail: "Main Analytics cards merge the newest archived sessions for the signed-in user." },
          ]}
        />
        <AnalyticsCenter
          archivedSessions={archivedSessions}
          loadingArchivedSessions={loadingArchivedSessions}
          pastSessionsOpen={pastSessionsOpen}
          onClosePastSessions={() => setPastSessionsOpen(false)}
          onNavigateToCapture={() => router.push("/capture")}
        />
      </div>
    </OperatorShell>
  )
}
