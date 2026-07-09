import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export default async function HomePage() {
  const session = (await cookies()).get("cv_session")?.value
  redirect(session ? "/dashboard" : "/login")
}
