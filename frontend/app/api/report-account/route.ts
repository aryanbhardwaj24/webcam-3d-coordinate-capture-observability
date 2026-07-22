import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function createHtmlResponse({
  request,
  status,
  eyebrow,
  title,
  message,
  note,
  tone,
}: {
  request: NextRequest
  status: number
  eyebrow: string
  title: string
  message: string
  note?: string
  tone: "success" | "warning" | "danger" | "neutral"
}) {
  const loginUrl = `${request.nextUrl.origin}/login`
  const palette =
    tone === "success"
      ? {
          accent: "#22d3ee",
          accentSoft: "rgba(34,211,238,0.18)",
          border: "rgba(34,211,238,0.22)",
        }
      : tone === "warning"
        ? {
            accent: "#f59e0b",
            accentSoft: "rgba(245,158,11,0.18)",
            border: "rgba(245,158,11,0.22)",
          }
        : tone === "danger"
          ? {
              accent: "#fb7185",
              accentSoft: "rgba(251,113,133,0.18)",
              border: "rgba(251,113,133,0.22)",
            }
          : {
              accent: "#a78bfa",
              accentSoft: "rgba(167,139,250,0.18)",
              border: "rgba(167,139,250,0.22)",
            }

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(34, 211, 238, 0.16), transparent 40%),
          radial-gradient(circle at bottom right, rgba(167, 139, 250, 0.18), transparent 35%),
          linear-gradient(180deg, #030712 0%, #050812 100%);
        color: rgba(255, 255, 255, 0.92);
      }

      .shell {
        width: min(100%, 760px);
        position: relative;
      }

      .card {
        position: relative;
        overflow: hidden;
        border-radius: 28px;
        border: 1px solid ${palette.border};
        background: linear-gradient(180deg, rgba(9, 14, 24, 0.94), rgba(6, 9, 16, 0.9));
        box-shadow:
          0 40px 140px rgba(0, 0, 0, 0.5),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(18px);
      }

      .card::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at top left, ${palette.accentSoft}, transparent 38%),
          linear-gradient(180deg, rgba(255,255,255,0.03), transparent 32%);
        pointer-events: none;
      }

      .content {
        position: relative;
        z-index: 1;
        padding: 36px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.05);
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255,255,255,0.72);
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: ${palette.accent};
        box-shadow: 0 0 20px ${palette.accentSoft};
      }

      h1 {
        margin: 22px 0 14px;
        font-size: clamp(30px, 4vw, 42px);
        line-height: 1.08;
        letter-spacing: -0.03em;
      }

      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.7;
        color: rgba(255,255,255,0.75);
      }

      .note {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.04);
        color: rgba(255,255,255,0.66);
        font-size: 14px;
      }

      .actions {
        margin-top: 28px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 18px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.12);
        text-decoration: none;
        font-weight: 600;
        transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
      }

      .button:hover {
        transform: translateY(-1px);
      }

      .button-primary {
        color: #04111d;
        background: linear-gradient(135deg, #e6fcff 0%, ${palette.accent} 100%);
        box-shadow: 0 20px 60px ${palette.accentSoft};
        border-color: transparent;
      }

      .button-secondary {
        color: rgba(255,255,255,0.88);
        background: rgba(255,255,255,0.05);
      }

      .button-secondary:hover {
        border-color: rgba(255,255,255,0.22);
        background: rgba(255,255,255,0.08);
      }

      @media (max-width: 640px) {
        body {
          padding: 16px;
        }

        .content {
          padding: 24px;
        }

        .actions {
          flex-direction: column;
        }

        .button {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <div class="content">
          <div class="eyebrow"><span class="dot"></span>${escapeHtml(eyebrow)}</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
          ${note ? `<div class="note">${escapeHtml(note)}</div>` : ""}
          <div class="actions">
            <a class="button button-primary" href="${escapeHtml(loginUrl)}">Try Webcam 3D Capture &amp; Analytics</a>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`

  return new NextResponse(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

async function findUserByEmail(email: string) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.")
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw error
    }

    const matchingUser =
      data.users.find((user) => (user.email ?? "").toLowerCase() === email.toLowerCase()) ?? null

    if (matchingUser) {
      return { supabaseAdmin, user: matchingUser }
    }

    if (data.users.length < perPage) {
      return { supabaseAdmin, user: null }
    }

    page += 1
  }
}

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()

  if (!email) {
    return createHtmlResponse({
      request,
      status: 400,
      eyebrow: "Missing Details",
      title: "We could not process that request",
      message: "This report link is missing the email address we need to look up the pending sign-up request.",
      note: "Please reopen the original confirmation email and try the link again.",
      tone: "warning",
    })
  }

  try {
    const { supabaseAdmin, user } = await findUserByEmail(email)

    if (!user) {
      return createHtmlResponse({
        request,
        status: 404,
        eyebrow: "Nothing To Remove",
        title: "No pending sign-up was found",
        message: `We could not find a pending account request for ${email}. It may already have been removed or the link may be out of date.`,
        note: "If you still want to try the app, you can return to the login page and create a new account.",
        tone: "neutral",
      })
    }

    if (user.email_confirmed_at) {
      return createHtmlResponse({
        request,
        status: 409,
        eyebrow: "Account Already Verified",
        title: "That account is already active",
        message: `The email address ${email} has already been confirmed, so it cannot be removed through this safety link.`,
        note: "If this was not you, use your normal account recovery or support path instead of the confirmation email.",
        tone: "warning",
      })
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (deleteError) {
      throw deleteError
    }

    return createHtmlResponse({
      request,
      status: 200,
      eyebrow: "Request Removed",
      title: "The pending account request was deleted",
      message: `We removed the unverified sign-up request for ${email}. No account will be activated unless a new registration is created and confirmed later.`,
      note: "If you would still like to explore the platform, you can start over from the login page whenever you're ready.",
      tone: "success",
    })
  } catch (error) {
    return createHtmlResponse({
      request,
      status: 500,
      eyebrow: "Server Error",
      title: "We hit a problem while processing this link",
      message: error instanceof Error ? error.message : "An unexpected server error occurred while checking the pending account request.",
      note: "Please try again shortly. If the problem continues, create a fresh sign-up request from the app.",
      tone: "danger",
    })
  }
}
