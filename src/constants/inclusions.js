// Per-category "what's included / what's extra" copy. Surfaces above the
// Request now button (C24) so the customer can see exactly what the base
// price covers before they commit. Wording matches the booking-flow spec:
// honest, short, and shaped around the questions customers actually ask
// before paying.
//
// New categories should always specify both `includes` and `extras`. The
// fallback at the bottom is a generic template — fine as a safety net but
// not as a final answer.

const FALLBACK = {
  includes: [
    'Up to 30 min on-site labour',
    'Standard diagnostic + minor adjustments',
  ],
  extras: [
    'Materials at cost (only if needed)',
    'Travel beyond 5 km may apply',
  ],
}

const CATEGORY_INCLUSIONS = {
  'AC Repair': {
    includes: [
      'Up to 30 min servicing',
      'Coil + filter inspection',
      'Basic leak check',
    ],
    extras: [
      'Gas refill billed by weight (₹1,500–₹3,000 typical)',
      'Replacement parts at cost',
    ],
  },
  Electrician: {
    includes: [
      'Up to 30 min labour',
      'Wiring + switch diagnostics',
    ],
    extras: [
      'MCBs, switches, sockets billed at cost',
      'Wall chasing billed separately',
    ],
  },
  Plumber: {
    includes: [
      'Up to 30 min labour',
      'Leak diagnosis + minor tightening',
    ],
    extras: [
      'Pipes, valves, gaskets billed at cost',
      'Cutting / re-routing billed separately',
    ],
  },
  Carpenter: {
    includes: [
      'Up to 30 min labour',
      'Hinge / handle / shelf adjustments',
    ],
    extras: [
      'Wood, laminate, hardware billed at cost',
      'Custom work needs a separate visit',
    ],
  },
  Painter: {
    includes: [
      'On-site assessment',
      'Surface measurement + quote',
    ],
    extras: [
      'Paint, primer, brushes billed at cost',
      'Multi-coat / texture work billed per sq ft',
    ],
  },
  Cleaning: {
    includes: [
      'Up to 1 hour cleaning',
      'Customer-supplied cleaning agents',
    ],
    extras: [
      'Branded cleaning agents on request',
      'Deep cleaning quoted on inspection',
    ],
  },
  Mechanic: {
    includes: [
      'On-site inspection',
      'Minor adjustments + tuning',
    ],
    extras: [
      'Parts billed at cost',
      'Tow / pickup billed separately',
    ],
  },
  'Pest Control': {
    includes: [
      'On-site inspection',
      'Single-room spray with standard formulation',
    ],
    extras: [
      'Whole-home treatments billed per sq ft',
      'Termite treatment quoted separately',
    ],
  },
  'TV Repair': {
    includes: [
      'On-site diagnosis',
      'Cable / setting checks',
    ],
    extras: [
      'Replacement panels, boards billed at cost',
      'Off-site repair billed separately',
    ],
  },
  Tiling: {
    includes: [
      'On-site measurement',
      'Up to 30 min labour quote',
    ],
    extras: [
      'Tiles, adhesive, grout at cost',
      'Demolition billed separately',
    ],
  },
  Welding: {
    includes: [
      'On-site inspection',
      'Small spot welds (under 15 min)',
    ],
    extras: [
      'Rods, gas, sheet metal at cost',
      'Fabrication billed per piece',
    ],
  },
  Laundry: {
    includes: [
      'Pickup + standard wash',
      'Up to 5 kg per visit',
    ],
    extras: [
      'Dry cleaning billed per item',
      'Express turnaround billed extra',
    ],
  },
  Gardening: {
    includes: [
      'Up to 1 hour on-site work',
      'Customer-supplied tools',
    ],
    extras: [
      'Plants, soil, fertiliser at cost',
      'Tree felling quoted separately',
    ],
  },
  Cooking: {
    includes: [
      'Up to 1 hour on-site cooking',
      'Customer-supplied ingredients',
    ],
    extras: [
      'Ingredients sourced on request',
      'Event cooking quoted separately',
    ],
  },
  Driver: {
    includes: [
      'Up to 1 hour driving service',
      'Within-city travel only',
    ],
    extras: [
      'Inter-city trips billed per km',
      'Tolls / parking at cost',
    ],
  },
  Security: {
    includes: [
      'Up to 4 hour shift',
      'Standard unarmed posting',
    ],
    extras: [
      'Overtime billed hourly',
      'Specialist roles quoted separately',
    ],
  },
}

export function inclusionsFor (category) {
  return CATEGORY_INCLUSIONS[category] || FALLBACK
}

// Estimate range: base price ± 50%, rounded to nearest 50 for display.
// Returns null when basePrice is falsy so callers can hide the line
// entirely rather than show "₹0–₹0".
const roundTo50 = (n) => Math.round(n / 50) * 50
export function estimateRange (basePrice) {
  const p = Number(basePrice)
  if (!Number.isFinite(p) || p <= 0) return null
  const low  = Math.max(50, roundTo50(p * 0.5))
  const high = roundTo50(p * 1.5)
  return { low, high }
}
