import { NextResponse } from "next/server"

import {
  pendingVerificationEmailCookie,
  pendingVerificationResendAtCookie,
} from "@/lib/auth/pendingVerification"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const nextPath = requestUrl.searchParams.get("next") || "/dashboard"
  const redirectUrl = new URL(nextPath.startsWith("/") ? nextPath : "/dashboard", requestUrl.origin)

  if (!hasSupabaseEnv) {
    redirectUrl.pathname = "/login"
    redirectUrl.searchParams.set("error", "missing_supabase_env")
    return NextResponse.redirect(redirectUrl)
  }

  const code = requestUrl.searchParams.get("code")

  if (code) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  const response = NextResponse.redirect(redirectUrl)

  if (code) {
    response.cookies.delete(pendingVerificationEmailCookie)
    response.cookies.delete(pendingVerificationResendAtCookie)
  }

  return response
}
