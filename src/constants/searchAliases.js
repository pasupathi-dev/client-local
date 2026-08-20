// Curated synonyms and "common query" phrases that map onto a canonical
// category, and optionally a skill / sub-service the partner offers.
// Used by the customer search bar to surface results for queries the
// category names alone wouldn't catch (e.g. "ac gas refill" → AC Repair).
//
// Keep entries lowercase. Matching is substring-based, longest-match wins.
export const COMMON_QUERIES = [
  // AC Repair
  { q: 'ac gas refill',     category: 'AC Repair',   skill: 'Gas refill' },
  { q: 'ac gas',            category: 'AC Repair',   skill: 'Gas refill' },
  { q: 'ac service',        category: 'AC Repair',   skill: 'Servicing' },
  { q: 'ac repair',         category: 'AC Repair' },
  { q: 'air conditioner',   category: 'AC Repair' },
  { q: 'split ac',          category: 'AC Repair' },
  { q: 'window ac',         category: 'AC Repair' },

  // Electrician
  { q: 'switch board',      category: 'Electrician', skill: 'Switch board' },
  { q: 'switchboard',       category: 'Electrician', skill: 'Switch board' },
  { q: 'wiring',            category: 'Electrician', skill: 'Wiring' },
  { q: 'fan installation',  category: 'Electrician', skill: 'Fan installation' },
  { q: 'mcb',               category: 'Electrician', skill: 'MCB / fuse' },
  { q: 'inverter',          category: 'Electrician', skill: 'Inverter' },

  // Plumber
  { q: 'tap leak',          category: 'Plumber',     skill: 'Tap repair' },
  { q: 'leakage',           category: 'Plumber',     skill: 'Leakage' },
  { q: 'water tank',        category: 'Plumber',     skill: 'Water tank' },
  { q: 'pipe burst',        category: 'Plumber',     skill: 'Pipe burst' },
  { q: 'toilet repair',     category: 'Plumber',     skill: 'Toilet repair' },

  // Carpenter
  { q: 'door repair',       category: 'Carpenter',   skill: 'Door repair' },
  { q: 'furniture',         category: 'Carpenter',   skill: 'Furniture' },
  { q: 'modular kitchen',   category: 'Carpenter',   skill: 'Modular kitchen' },

  // Painter
  { q: 'wall painting',     category: 'Painter',     skill: 'Wall painting' },
  { q: 'house painting',    category: 'Painter',     skill: 'House painting' },
  { q: 'texture',           category: 'Painter',     skill: 'Texture finish' },

  // Cleaning
  { q: 'deep cleaning',     category: 'Cleaning',    skill: 'Deep cleaning' },
  { q: 'sofa cleaning',     category: 'Cleaning',    skill: 'Sofa cleaning' },
  { q: 'kitchen cleaning',  category: 'Cleaning',    skill: 'Kitchen cleaning' },
  { q: 'bathroom cleaning', category: 'Cleaning',    skill: 'Bathroom cleaning' },

  // Pest Control
  { q: 'cockroach',         category: 'Pest Control', skill: 'Cockroach' },
  { q: 'termite',           category: 'Pest Control', skill: 'Termite' },
  { q: 'mosquito',          category: 'Pest Control', skill: 'Mosquito' },
  { q: 'rat',               category: 'Pest Control', skill: 'Rodent' },

  // TV Repair
  { q: 'tv repair',         category: 'TV Repair' },
  { q: 'led tv',            category: 'TV Repair' },

  // Mechanic
  { q: 'bike service',      category: 'Mechanic',    skill: 'Bike service' },
  { q: 'puncture',          category: 'Mechanic',    skill: 'Puncture' },
]

// Returns up to `limit` { type:'common', category, skill, score } matches for
// the given query, ranked by best substring fit (longest match wins, then
// startsWith). Falls back to [] when q is empty.
export function searchCommonQueries (q, limit = 5) {
  const needle = String(q || '').trim().toLowerCase()
  if (!needle) return []
  const out = []
  for (const entry of COMMON_QUERIES) {
    const target = entry.q
    let score = -1
    if (target === needle)            score = 0
    else if (target.startsWith(needle)) score = 1
    else if (needle.startsWith(target)) score = 2
    else if (target.includes(needle))   score = 3
    else if (needle.includes(target))   score = 4
    if (score >= 0) out.push({ ...entry, score })
  }
  out.sort((a, b) => a.score - b.score || a.q.length - b.q.length)
  return out.slice(0, limit).map((e) => ({
    type: 'common',
    label: e.q.replace(/\b\w/g, (c) => c.toUpperCase()),
    category: e.category,
    skill: e.skill || null,
  }))
}
