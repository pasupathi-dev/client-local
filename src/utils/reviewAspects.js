// H60 — Aspect chip vocabulary. Mirrored on the server at
// `server/src/utils/reviewAspects.js`. Keep both lists in sync.

export const POSITIVE = [
  { slug: 'on_time',     label: 'On time' },
  { slug: 'clean_work',  label: 'Clean work' },
  { slug: 'fair_price',  label: 'Fair price' },
  { slug: 'friendly',    label: 'Friendly' },
  { slug: 'prepared',    label: 'Prepared' },
]
export const NEGATIVE = [
  { slug: 'late',         label: 'Late' },
  { slug: 'overcharged',  label: 'Overcharged' },
  { slug: 'untidy',       label: 'Untidy' },
]

export const ALL = [...POSITIVE, ...NEGATIVE]

// >= 4★ → positive chips, anything else → negative chips.
export const chipsFor = (stars) => (Number(stars) >= 4 ? POSITIVE : NEGATIVE)

const LABEL_BY_SLUG = Object.fromEntries(ALL.map((c) => [c.slug, c.label]))
export const labelFor = (slug) => LABEL_BY_SLUG[slug] || slug
