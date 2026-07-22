export const pendingVerificationEmailCookie = "pending_verification_email"
export const pendingVerificationResendAtCookie = "pending_verification_resend_at"
export const verificationResendCooldownMs = 60_000

export type PendingVerificationState = {
  email: string
  resendAvailableAt: number
}

function readCookieValue(cookieString: string, cookieName: string) {
  const cookies = cookieString.split(";")

  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=")
    if (rawName !== cookieName) continue
    return decodeURIComponent(rawValue.join("="))
  }

  return null
}

export function parsePendingVerificationState(cookieString: string): PendingVerificationState | null {
  const email = readCookieValue(cookieString, pendingVerificationEmailCookie)?.trim().toLowerCase()
  if (!email) {
    return null
  }

  const resendAvailableAtRaw = readCookieValue(cookieString, pendingVerificationResendAtCookie)
  const resendAvailableAt = resendAvailableAtRaw ? Number(resendAvailableAtRaw) : 0

  return {
    email,
    resendAvailableAt: Number.isFinite(resendAvailableAt) ? resendAvailableAt : 0,
  }
}
