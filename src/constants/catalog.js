// Mirror of server/src/config/constants.js — used when the API list isn't
// loaded yet. Taxonomy v2: CATEGORIES are parent groupings (browse only),
// WORKS are the bookable leaf (each points at its parent via `category`).
export const CATEGORIES = [
  { name: 'Electric & Electronic',   icon: '⚡' },
  { name: 'Plumbing & Water',        icon: '🚿' },
  { name: 'Cleaning & Pest Control', icon: '🧹' },
  { name: 'Construction & Repair',   icon: '🔨' },
  { name: 'Auto & Transport',        icon: '🚗' },
  { name: 'Home & Lifestyle',        icon: '🏠' },
]

export const WORKS = [
  { name: 'Electrician',  category: 'Electric & Electronic',   icon: '⚡' },
  { name: 'AC Repair',    category: 'Electric & Electronic',   icon: '❄️' },
  { name: 'TV Repair',    category: 'Electric & Electronic',   icon: '📺' },
  { name: 'Plumber',      category: 'Plumbing & Water',        icon: '🚿' },
  { name: 'Cleaning',     category: 'Cleaning & Pest Control', icon: '🧹' },
  { name: 'Pest Control', category: 'Cleaning & Pest Control', icon: '🐛' },
  { name: 'Laundry',      category: 'Cleaning & Pest Control', icon: '👕' },
  { name: 'Carpenter',    category: 'Construction & Repair',   icon: '🔨' },
  { name: 'Welding',      category: 'Construction & Repair',   icon: '🔩' },
  { name: 'Tiling',       category: 'Construction & Repair',   icon: '🔲' },
  { name: 'Painter',      category: 'Construction & Repair',   icon: '🎨' },
  { name: 'Mechanic',     category: 'Auto & Transport',        icon: '🔧' },
  { name: 'Driver',       category: 'Auto & Transport',        icon: '🚗' },
  { name: 'Cooking',      category: 'Home & Lifestyle',        icon: '🍳' },
  { name: 'Gardening',    category: 'Home & Lifestyle',        icon: '🌱' },
  { name: 'Security',     category: 'Home & Lifestyle',        icon: '🔒' },
]

export const JOB_STATE_LABEL = {
  accepted:       'Accepted',
  priceConfirmed: 'Price confirmed',
  travelling:     'On the way',
  arrived:        'Arrived',
  working:        'In progress',
  completed:      'Waiting for payment',
  paid:           'Paid',
  cancelled:      'Cancelled',
}

export const AVAIL_DAYS     = ['Mon-Sat','Mon-Sun','Mon-Fri','Weekends only']
export const AVAIL_HOURS    = ['8am-8pm','6am-10pm','9am-6pm','24/7']
export const EXP_LABELS     = [0,1,2,3,5,7,10,15,20,30]
