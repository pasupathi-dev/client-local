// Display helpers — small, framework-free, safe for React + node.

// Distance: < 1 km → "350 m" (0 decimals), ≥ 1 km → "1.2 km" (1 decimal).
// Mirrors the local.html prototype (line 6217):
//   km < 1 ? (km * 1000).toFixed(0) + 'm' : km.toFixed(1) + ' km'
export function formatDistance (km) {
  if (km == null || Number.isNaN(Number(km))) return ''
  const n = Number(km)
  if (n < 1) return `${Math.round(n * 1000)} m`
  return `${n.toFixed(1)} km`
}

// Price: "₹500" — integer rupees, never shows "₹0" for missing prices.
export function formatPrice (value) {
  if (value == null || Number(value) <= 0) return '—'
  return `₹${Math.round(Number(value))}`
}

// ETA: distance_km / speed * 60 + buffer min, capped between "5 min" and
// "2 hr+". Speed + buffer are admin-tunable via app_config — App.jsx wires
// them up by calling setEtaConfig() once /api/config has loaded. Defaults
// match the original 20 km/h + 5 min buffer if the setter never fires.
//   formatEta(0.5) → "5 min"
//   formatEta(3)   → "~14 min away"     (3/20*60 + 5 = 14)
//   formatEta(50)  → "2 hr+ away"
let _etaSpeedKmph = 20
let _etaBufferMin = 5
export function setEtaConfig ({ speedKmph, bufferMin } = {}) {
  if (Number.isFinite(Number(speedKmph)) && Number(speedKmph) > 0) _etaSpeedKmph = Number(speedKmph)
  if (Number.isFinite(Number(bufferMin)) && Number(bufferMin) >= 0) _etaBufferMin = Number(bufferMin)
}
export function formatEta (km) {
  if (km == null || !Number.isFinite(Number(km))) return null
  const minutes = Math.round((Number(km) / _etaSpeedKmph) * 60 + _etaBufferMin)
  if (minutes >= 120) return '2 hr+ away'
  const clamped = Math.max(5, minutes)
  return `~${clamped} min away`
}

// Compact "time ago" — "just now", "5m", "2h", "3d", "2w", or a date string
// for anything older than a month. Small and intl-free by design.
export function timeAgo (input) {
  if (!input) return ''
  const then = new Date(input).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (s < 60)      return 'just now'
  if (s < 3600)    return `${Math.floor(s / 60)}m ago`
  if (s < 86400)   return `${Math.floor(s / 3600)}h ago`
  if (s < 604800)  return `${Math.floor(s / 86400)}d ago`
  if (s < 2592000) return `${Math.floor(s / 604800)}w ago`
  return new Date(then).toLocaleDateString()
}
