import JSZip from "jszip"

const throughputPoints = [42, 48, 51, 58, 61, 67, 69]
const driftPoints = [8, 7, 7, 5, 4, 3, 3]

export const analyticsThroughputPoints = throughputPoints
export const analyticsDriftPoints = driftPoints

export function buildExportFiles() {
  const generatedAt = new Date().toISOString()

  return {
    "analytics/session-summary.json": JSON.stringify(
      {
        generatedAt,
        sessions: 14,
        avgFps: 31.2,
        calibrationDriftMm: 3.4,
      },
      null,
      2
    ),
    "analytics/throughput.csv":
      "window,tracked_points\n08:00,42\n09:00,48\n10:00,51\n11:00,58\n12:00,61\n13:00,67\n14:00,69\n",
    "analytics/drift.csv": "window,drift_mm\n08:00,8\n09:00,7\n10:00,7\n11:00,5\n12:00,4\n13:00,3\n14:00,3\n",
  }
}

export async function buildAnalyticsZipBundle() {
  const zip = new JSZip()
  const exportFiles = buildExportFiles()

  Object.entries(exportFiles).forEach(([path, contents]) => {
    zip.file(path, contents)
  })

  const blob = await zip.generateAsync({ type: "blob" })
  const generatedAt = new Date().toISOString()
  const fileName = `capture-analytics-${generatedAt.replace(/[:.]/g, "-")}.zip`

  return {
    blob,
    fileCount: Object.keys(exportFiles).length,
    fileName,
    generatedAt,
  }
}
