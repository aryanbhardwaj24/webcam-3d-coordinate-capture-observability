import { redirect } from "next/navigation"

import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export default async function HomePage() {
  if (!hasSupabaseEnv) {
    redirect("/login")
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? "/dashboard" : "/login")
}
