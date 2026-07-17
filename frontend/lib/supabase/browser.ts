import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { hasSupabaseEnv, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env"

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient() {
  if (!hasSupabaseEnv) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.")
  }

  browserClient ??= createBrowserClient(supabaseUrl, supabasePublishableKey)
  return browserClient
}
