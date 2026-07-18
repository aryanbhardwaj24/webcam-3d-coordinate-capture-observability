"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { useToast } from "@/components/ui/Toast"

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 stroke-current" fill="none" strokeWidth="1.8">
      <path
        d="M2.25 12S5.5 6.75 12 6.75 21.75 12 21.75 12 18.5 17.25 12 17.25 2.25 12 2.25 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" />
      {crossed ? <path d="M5 5 19 19" strokeLinecap="round" /> : null}
    </svg>
  )
}

function PasswordField({
  id,
  name,
  label,
  placeholder,
  value,
  visible,
  onChange,
  onToggle,
}: {
  id: string
  name: string
  label: string
  placeholder: string
  value: string
  visible: boolean
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onToggle: () => void
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-white/70">{label}</span>
      <div className="relative">
        <Input
          required
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          minLength={6}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="pr-12"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-white/45 transition hover:text-white/75"
        >
          <EyeIcon crossed={!visible} />
        </button>
      </div>
    </label>
  )
}

export function AuthExperience({
  initialError,
  nextPath: initialNextPath,
}: {
  initialError?: string
  nextPath?: string
}) {
  const router = useRouter()
  const { push } = useToast()
  const nextPath = initialNextPath || "/dashboard"
  const [mode, setMode] = React.useState<"sign-in" | "sign-up">("sign-in")
  const [form, setForm] = React.useState({ email: "", password: "", confirmPassword: "" })
  const [submitting, setSubmitting] = React.useState(false)
  const [googleLoading, setGoogleLoading] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false)

  React.useEffect(() => {
    if (initialError === "missing_supabase_env") {
      push({
        title: "Missing Supabase env",
        detail: "Set the frontend Supabase URL and publishable key before completing the auth exchange.",
        tone: "danger",
      })
    }
  }, [initialError, push])

  function updateField(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function onEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!hasSupabaseEnv) {
      push({
        title: "Missing auth env",
        detail: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable Supabase auth.",
        tone: "danger",
      })
      return
    }

    if (mode === "sign-up" && form.password !== form.confirmPassword) {
      push({
        title: "Passwords do not match",
        detail: "Please make sure both password fields match before creating your account.",
        tone: "danger",
      })
      return
    }

    setSubmitting(true)

    try {
      const supabase = getSupabaseBrowserClient()

      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })

        if (error) throw error

        push({
          title: "Signed in",
          detail: "Supabase session is active for the operator console.",
          tone: "success",
        })
        router.push(nextPath)
        router.refresh()
        return
      }

      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: redirectTo,
        },
      })

      if (error) throw error

      push({
        title: "Check your inbox",
        detail: "Supabase created the account. Email confirmation may still be required before the first sign-in.",
        tone: "success",
      })
      setForm((current) => ({ ...current, password: "", confirmPassword: "" }))
      setMode("sign-in")
    } catch (error) {
      push({
        title: mode === "sign-in" ? "Sign-in failed" : "Sign-up failed",
        detail: error instanceof Error ? error.message : "Unknown Supabase auth error",
        tone: "danger",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function onGoogleClick() {
    if (!hasSupabaseEnv) {
      push({
        title: "Missing auth env",
        detail: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before enabling Google sign-in.",
        tone: "danger",
      })
      return
    }

    setGoogleLoading(true)

    try {
      const supabase = getSupabaseBrowserClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      const { error } = await supabase.auth.signInWithOAuth({
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

      if (error) throw error
    } catch (error) {
      push({
        title: "Google sign-in failed",
        detail:
          error instanceof Error
            ? error.message
            : "Enable the Google provider in Supabase and allow this frontend origin for OAuth redirects.",
        tone: "danger",
      })
      setGoogleLoading(false)
    }
  }

  return (
    <main className="app-shell flex min-h-screen items-center justify-center px-6 py-12">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_55%)]" />
      <div className="absolute bottom-0 right-0 h-96 w-96 bg-[radial-gradient(circle,rgba(167,139,250,0.18),transparent_60%)]" />
      <div className="relative z-10 grid w-full max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card variant="strong" className="ring-accent overflow-hidden">
          <CardHeader className="pb-5">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <span className="status-dot-live" />
              Welcome back
            </div>
            <CardTitle className="max-w-xl text-4xl leading-tight">
              Sign in and pick up where you left off.
            </CardTitle>
            <CardDescription className="mt-4 max-w-2xl text-base text-white/70">
              Please sign in with your email and password, or continue with Google.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="glass-inset p-5 text-sm text-white/75">
              Use your account to open the app, check your sessions, and keep things moving.
            </div>
          </CardBody>
        </Card>

        <Card className="ring-accent">
          <CardHeader>
            <CardTitle className="text-2xl">{mode === "sign-in" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription>Please sign in with your email and password, or use your Google account.</CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-glass border border-white/10 bg-white/5 p-1.5">
              <button
                type="button"
                className={`rounded-glass border px-3 py-2.5 text-sm font-medium transition ${
                  mode === "sign-in"
                    ? "border-accent-cyan/40 bg-white text-obsidian-950 shadow-[0_10px_30px_rgba(34,211,238,0.18)]"
                    : "border-transparent bg-transparent text-white/55 hover:border-white/10 hover:bg-white/6 hover:text-white/75"
                }`}
                onClick={() => setMode("sign-in")}
              >
                Sign in
              </button>
              <button
                type="button"
                className={`rounded-glass border px-3 py-2.5 text-sm font-medium transition ${
                  mode === "sign-up"
                    ? "border-accent-violet/40 bg-white text-obsidian-950 shadow-[0_10px_30px_rgba(167,139,250,0.18)]"
                    : "border-transparent bg-transparent text-white/55 hover:border-white/10 hover:bg-white/6 hover:text-white/75"
                }`}
                onClick={() => setMode("sign-up")}
              >
                Create account
              </button>
            </div>

            <form className="space-y-4" onSubmit={onEmailSubmit}>
              <label className="block space-y-2">
                <span className="text-sm text-white/70">Email</span>
                <Input
                  required
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={updateField}
                />
              </label>
              <PasswordField
                id="password"
                name="password"
                label="Password"
                placeholder="Enter your password"
                value={form.password}
                visible={showPassword}
                onChange={updateField}
                onToggle={() => setShowPassword((current) => !current)}
              />
              {mode === "sign-up" ? (
                <PasswordField
                  id="confirmPassword"
                  name="confirmPassword"
                  label="Confirm Password"
                  placeholder="Confirm your password"
                  value={form.confirmPassword}
                  visible={showConfirmPassword}
                  onChange={updateField}
                  onToggle={() => setShowConfirmPassword((current) => !current)}
                />
              ) : null}
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
                {mode === "sign-in" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-white/35">
              <div className="h-px flex-1 bg-white/10" />
              Or
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <Button type="button" variant="secondary" size="lg" className="w-full" onClick={onGoogleClick} loading={googleLoading}>
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M21.8 12.2c0-.74-.07-1.45-.19-2.14H12v4.05h5.5a4.72 4.72 0 0 1-2.04 3.1v2.58h3.3c1.93-1.77 3.04-4.39 3.04-7.59Z" />
                <path d="M12 22c2.76 0 5.08-.92 6.77-2.5l-3.3-2.58c-.92.62-2.08 1-3.47 1-2.67 0-4.94-1.8-5.75-4.22H2.83v2.66A10.22 10.22 0 0 0 12 22Z" />
                <path d="M6.25 13.7A6.08 6.08 0 0 1 5.9 12c0-.6.1-1.18.35-1.7V7.64H2.83A10.18 10.18 0 0 0 1.75 12c0 1.64.39 3.2 1.08 4.36L6.25 13.7Z" />
                <path d="M12 6.08c1.5 0 2.86.52 3.93 1.52l2.95-2.95C17.06 2.96 14.74 2 12 2 7.96 2 4.45 4.3 2.83 7.64L6.25 10.3c.81-2.42 3.08-4.22 5.75-4.22Z" />
              </svg>
              Continue with Google
            </Button>
          </CardBody>
        </Card>
      </div>
    </main>
  )
}
