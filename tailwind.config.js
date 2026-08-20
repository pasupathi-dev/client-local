/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Font families — `font-sans` (Plus Jakarta Sans) is the default body
      // face; `font-display` (Bricolage Grotesque) for headings; `font-serif`
      // (Instrument Serif) for italic flourishes; `font-mono` (JetBrains Mono)
      // for numbers / coordinates / job ids.
      fontFamily: {
        sans:    ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        serif:   ['Instrument Serif', 'Georgia', 'serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Existing tokens — kept stable so all existing class usages keep working
        brand:    'var(--brand)',
        brand2:   'var(--brand2)',
        accent:   'var(--accent)',
        accent2:  'var(--accent2)',
        'accent-deep': 'var(--accent-deep)',
        surface:  'var(--surface)',
        card:     'var(--card)',
        border:   'var(--border)',
        text:     'var(--text)',
        muted:    'var(--muted)',
        light:    'var(--light)',
        success:  'var(--success)',
        warn:     'var(--warn)',
        info:     'var(--info)',
        danger:   'var(--danger)',
        // New tokens for the warm-beige system
        ink:           'var(--ink)',
        ink2:          'var(--ink2)',
        'brand-soft':  'var(--brand-soft)',
        'border-strong':'var(--border-strong)',
        'surface-2':   'var(--surface-2)',
        'success-soft':'var(--success-soft)',
      },
      borderRadius: {
        // Legacy aliases — keep working
        r:  'var(--r)',
        rs: 'var(--rs)',
        // Full design-system scale
        'ds-sm': 'var(--r-sm)',
        'ds-md': 'var(--r-md)',
        'ds-lg': 'var(--r-lg)',
        'ds-xl': 'var(--r-xl)',
      },
      boxShadow: {
        // Legacy aliases — keep working
        card:   'var(--shadow-md)',
        cardLg: 'var(--shadow-lg)',
        // Full design-system scale
        'ds-sm': 'var(--shadow-sm)',
        'ds-md': 'var(--shadow-md)',
        'ds-lg': 'var(--shadow-lg)',
        // Brand-orange focus ring / glow
        glow:   '0 12px 28px -10px var(--brand-glow), 0 4px 10px -4px var(--brand-glow)',
      },
      backgroundImage: {
        'ink-gradient':   'linear-gradient(135deg, var(--ink) 0%, #1F2530 100%)',
        'brand-gradient': 'linear-gradient(135deg, var(--brand) 0%, var(--accent2) 100%)',
        'warm-wash':      'linear-gradient(135deg, #FFF8F2 0%, #FFEFE3 100%)',
      },
      // Skeleton shimmer — a highlight sweep that travels left→right across a
      // skeleton placeholder. Used by the Skeleton component library.
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}
