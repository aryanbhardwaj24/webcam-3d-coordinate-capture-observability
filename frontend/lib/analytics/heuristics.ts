type PointLike = {
  x: number
  y: number
  z?: number
}

type BoxLike = {
  x: number
  y: number
  width: number
  height: number
}

type TrackLike = {
  box?: BoxLike
  x?: number
  y?: number
  width?: number
  height?: number
}

type VisibilityLike = {
  visibility?: number | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getTrackCentroid(track: TrackLike) {
  const box = track.box ?? (isFiniteNumber(track.x) && isFiniteNumber(track.y) && isFiniteNumber(track.width) && isFiniteNumber(track.height)
    ? {
        x: track.x,
        y: track.y,
        width: track.width,
        height: track.height,
      }
    : null)

  if (!box) return null

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }
}

export function calculateAngle(a?: PointLike | null, b?: PointLike | null, c?: PointLike | null) {
  if (!a || !b || !c) return null

  const baX = a.x - b.x
  const baY = a.y - b.y
  const baZ = (a.z ?? 0) - (b.z ?? 0)
  const bcX = c.x - b.x
  const bcY = c.y - b.y
  const bcZ = (c.z ?? 0) - (b.z ?? 0)
  const magnitudeBA = Math.sqrt(baX * baX + baY * baY + baZ * baZ)
  const magnitudeBC = Math.sqrt(bcX * bcX + bcY * bcY + bcZ * bcZ)

  if (magnitudeBA === 0 || magnitudeBC === 0) return null

  const cosine = clamp((baX * bcX + baY * bcY + baZ * bcZ) / (magnitudeBA * magnitudeBC), -1, 1)

  return (Math.acos(cosine) * 180) / Math.PI
}

export function calculateDistance(a?: PointLike | null, b?: PointLike | null) {
  if (!a || !b) return null

  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)

  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function calculateCentroidDistance(trackA?: TrackLike | null, trackB?: TrackLike | null) {
  if (!trackA || !trackB) return null

  const centroidA = getTrackCentroid(trackA)
  const centroidB = getTrackCentroid(trackB)
  if (!centroidA || !centroidB) return null

  return calculateDistance(centroidA, centroidB)
}

export function calculateVisibility(landmarks?: Array<VisibilityLike | null | undefined> | null) {
  if (!landmarks || landmarks.length === 0) return null

  const scores = landmarks
    .map((landmark) => landmark?.visibility)
    .filter(isFiniteNumber)
    .map((visibility) => clamp(visibility, 0, 1))

  if (scores.length === 0) return null

  return (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100
}
