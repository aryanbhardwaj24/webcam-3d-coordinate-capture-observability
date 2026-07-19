export async function uploadZipToDrive({
  accessToken,
  blob,
  fileName,
}: {
  accessToken: string
  blob: Blob
  fileName: string
}) {
  const boundary = `drive-upload-${crypto.randomUUID()}`
  const metadata = {
    name: fileName,
    mimeType: "application/zip",
  }

  const payload = new Blob(
    [
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      `${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\n`,
      "Content-Type: application/zip\r\n\r\n",
      blob,
      "\r\n",
      `--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  )

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: payload,
  })

  if (!response.ok) {
    let detail = ""

    try {
      const payload = (await response.json()) as { error?: { message?: string } }
      detail = payload.error?.message ?? ""
    } catch {
      detail = await response.text()
    }

    throw new Error(detail || `Drive upload failed with status ${response.status}.`)
  }

  return (await response.json()) as {
    id: string
    name: string
    webViewLink?: string
  }
}
