import { AuthExperience } from "@/components/auth/AuthExperience"
import { hasSupabaseEnv } from "@/lib/supabase/env"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  if (hasSupabaseEnv) {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      redirect("/dashboard")
    }
  }

  const params = await searchParams
  return <AuthExperience initialError={params.error} nextPath={params.next} />
}
