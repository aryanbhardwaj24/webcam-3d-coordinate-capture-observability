"use client"

import * as React from "react"
import type { Session, User } from "@supabase/supabase-js"

import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseEnv } from "@/lib/supabase/env"

type ProfileRecord = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
}

type ArtifactRecordInput = {
  fileName: string
  mimeType: string
  byteSize: number
  driveFileId: string
  driveWebViewLink?: string | null
  metadata?: Record<string, unknown>
}

type AuthContextValue = {
  connectGoogleDrive: () => Promise<void>
  hasSupabaseEnv: boolean
  loading: boolean
  operatorSessionId: string | null
  profile: ProfileRecord | null
  providerToken: string | null
  session: Session | null
  user: User | null
  recordArtifact: (input: ArtifactRecordInput) => Promise<void>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)
const operatorSessionStorageKey = "cv_operator_session_id"

function buildProfileFallback(user: User): ProfileRecord {
  return {
    id: user.id,
    email: user.email ?? null,
    display_name:
      (typeof user.user_metadata.full_name === "string" && user.user_metadata.full_name) ||
      (typeof user.user_metadata.name === "string" && user.user_metadata.name) ||
      user.email?.split("@")[0] ||
      "Capture operator",
    avatar_url: typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null,
  }
}

function readOperatorSessionKey(userId: string) {
  return `${operatorSessionStorageKey}:${userId}`
}

async function upsertProfile(user: User) {
  const supabase = getSupabaseBrowserClient()
  const payload = {
    id: user.id,
    email: user.email ?? null,
    display_name: buildProfileFallback(user).display_name,
    avatar_url: buildProfileFallback(user).avatar_url,
    last_sign_in_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from("profiles").upsert(payload).select("id, email, display_name, avatar_url").single()
  if (error) throw error
  return data as ProfileRecord
}

async function ensureOperatorSession(userId: string) {
  if (typeof window === "undefined") return null

  const supabase = getSupabaseBrowserClient()
  const storageKey = readOperatorSessionKey(userId)
  const existingSessionId = window.localStorage.getItem(storageKey)

  if (existingSessionId) {
    const { data, error } = await supabase.from("sessions").select("id, status").eq("id", existingSessionId).maybeSingle()
    if (!error && data?.id && data.status === "active") {
      return data.id as string
    }
    window.localStorage.removeItem(storageKey)
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      label: "Browser operator console",
      status: "active",
      workstation_name: window.location.hostname,
      metadata: {
        source: "frontend",
        userAgent: navigator.userAgent,
      },
    })
    .select("id")
    .single()

  if (error) throw error

  window.localStorage.setItem(storageKey, data.id as string)
  return data.id as string
}

async function closeOperatorSession(userId: string) {
  if (typeof window === "undefined") return

  const storageKey = readOperatorSessionKey(userId)
  const operatorSessionId = window.localStorage.getItem(storageKey)

  if (!operatorSessionId) return

  window.localStorage.removeItem(storageKey)

  const supabase = getSupabaseBrowserClient()
  await supabase
    .from("sessions")
    .update({ status: "signed_out", ended_at: new Date().toISOString() })
    .eq("id", operatorSessionId)
    .eq("user_id", userId)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [user, setUser] = React.useState<User | null>(null)
  const [profile, setProfile] = React.useState<ProfileRecord | null>(null)
  const [operatorSessionId, setOperatorSessionId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const syncProfile = React.useCallback(async (nextUser: User) => {
    try {
      const nextProfile = await upsertProfile(nextUser)
      setProfile(nextProfile)
    } catch {
      setProfile(buildProfileFallback(nextUser))
    }
  }, [])

  const syncFromSession = React.useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession)
      const nextUser = nextSession?.user ?? null
      setUser(nextUser)

      if (!nextUser) {
        setProfile(null)
        setOperatorSessionId(null)
        setLoading(false)
        return
      }

      await syncProfile(nextUser)

      try {
        const nextOperatorSessionId = await ensureOperatorSession(nextUser.id)
        setOperatorSessionId(nextOperatorSessionId)
      } catch {
        setOperatorSessionId(null)
      } finally {
        setLoading(false)
      }
    },
    [syncProfile]
  )

  React.useEffect(() => {
    if (!hasSupabaseEnv) {
      setLoading(false)
      return
    }

    const supabase = getSupabaseBrowserClient()
    let mounted = true

    const applySession = async (nextSession: Session | null) => {
      if (!mounted) return
      await syncFromSession(nextSession)
    }

    void supabase.auth.getSession().then(({ data }) => applySession(data.session))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [syncFromSession])

  const refreshProfile = React.useCallback(async () => {
    if (!user || !hasSupabaseEnv) return
    await syncProfile(user)
  }, [syncProfile, user])

  const connectGoogleDrive = React.useCallback(async () => {
    if (!hasSupabaseEnv) {
      throw new Error("Set the Supabase frontend environment variables before connecting Google Drive.")
    }

    const supabase = getSupabaseBrowserClient()
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback?next=/analytics` : undefined
    const hasGoogleIdentity = Boolean(user?.identities?.some((identity) => identity.provider === "google"))

    const { error } = hasGoogleIdentity
      ? await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            scopes: "https://www.googleapis.com/auth/drive.file",
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
        },
        })
      : await supabase.auth.linkIdentity({
          provider: "google",
          options: {
            redirectTo,
            scopes: "https://www.googleapis.com/auth/drive.file",
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        })

    if (error) {
      throw error
    }
  }, [user])

  const signOut = React.useCallback(async () => {
    if (!hasSupabaseEnv) return
    if (user) {
      await closeOperatorSession(user.id)
    }
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
  }, [user])

  const recordArtifact = React.useCallback(
    async (input: ArtifactRecordInput) => {
      if (!hasSupabaseEnv || !user) return

      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.from("artifacts").insert({
        user_id: user.id,
        session_id: operatorSessionId,
        storage_provider: "google_drive",
        artifact_kind: "analytics_bundle",
        file_name: input.fileName,
        mime_type: input.mimeType,
        byte_size: input.byteSize,
        drive_file_id: input.driveFileId,
        drive_web_view_link: input.driveWebViewLink ?? null,
        metadata: input.metadata ?? {},
      })

      if (error) throw error
    },
    [operatorSessionId, user]
  )

  const value = React.useMemo<AuthContextValue>(
    () => ({
      connectGoogleDrive,
      hasSupabaseEnv,
      loading,
      operatorSessionId,
      profile,
      providerToken: session?.provider_token ?? null,
      session,
      user,
      recordArtifact,
      refreshProfile,
      signOut,
    }),
    [connectGoogleDrive, loading, operatorSessionId, profile, recordArtifact, refreshProfile, session, signOut, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = React.useContext(AuthContext)
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return value
}
