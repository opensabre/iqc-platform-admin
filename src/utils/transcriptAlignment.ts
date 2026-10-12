/** Render only observed alignment; legacy clock values never imply segment endpoints. */
function segmentTime(value: number) {
  const hours = Math.floor(value / 3600000), minutes = Math.floor(value / 60000) % 60, seconds = Math.floor(value / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
}
export function segmentRange(item: { startMs?: number | null; endMs?: number | null }) {
  const { startMs, endMs } = item;
  return typeof startMs === "number" && typeof endMs === "number" && Number.isSafeInteger(startMs) && Number.isSafeInteger(endMs) && startMs >= 0 && endMs >= startMs
    ? `${segmentTime(startMs)} – ${segmentTime(endMs)}` : undefined;
}
export function confidenceLabel(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? `${(value * 100).toFixed(2)}%` : undefined;
}
