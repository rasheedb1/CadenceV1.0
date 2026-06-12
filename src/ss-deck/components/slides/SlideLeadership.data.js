// Data + layout constants for SlideLeadership.
// Kept in a separate module so the component file can export only components
// (required by react-refresh/only-export-components).

// Cache-busting version for team photos. Files in /public are served
// at fixed paths, so browsers and Railway's CDN cache them indefinitely
// — a byte-level change to /team/justo-benetti.png won't reach users
// until the URL changes. Bump this whenever build-team-photos.mjs
// regenerates any headshot.
export const TEAM_PHOTO_VERSION = '2026-04-24-5'
const v = (url) => `${url}?v=${TEAM_PHOTO_VERSION}`

// Tier 1 - Founders (emphasized with accent ring + slightly larger photo)
export const FOUNDERS = [
  {
    photo: v('/ss-deck-assets/team/juan-pablo-ortega.png'),
    name: 'Juan Pablo Ortega',
    role: 'Co-founder & CEO',
    pedigree: ['rappi'],
    pedigreeLabel: 'Founder of Rappi',
  },
  {
    photo: v('/ss-deck-assets/team/julian-nunez.png'),
    name: 'Julián Nuñez',
    role: 'Co-founder & COO',
    pedigree: ['rappi'],
    pedigreeLabel: 'Rappi Early Employee',
  },
]

// Tier 2 - Leadership (C-suite, GMs, heads of function, including merchant-facing heads)
export const LEADERS = [
  {
    photo: v('/ss-deck-assets/team/justo-benetti.png'),
    name: 'Justo Benetti',
    role: 'Chief Revenue Officer',
    pedigree: ['dlocal', 'worldpay'],
  },
  {
    photo: v('/ss-deck-assets/team/mauricio-schwartzmann.png'),
    name: 'Mau Schwartzmann',
    role: 'Chief Banking & FI Officer',
    pedigree: ['mastercard', 'rappi'],
  },
  {
    photo: v('/ss-deck-assets/team/chee-beh.png'),
    name: 'Chee Beh',
    role: 'General Manager, APAC',
    pedigree: ['jpmorgan', 'uber'],
  },
  {
    photo: v('/ss-deck-assets/team/walter-campos.png'),
    name: 'Walter Campos',
    role: 'General Manager, LatAm',
    pedigreeLabel: 'MercadoPago · Cielo',
  },
  {
    photo: v('/ss-deck-assets/team/briana-gargurevich.png'),
    name: 'Briana Gargurevich',
    role: 'VP, Global Sales North America',
  },
  {
    photo: v('/ss-deck-assets/team/melissa-pottenger.png'),
    name: 'Melissa Pottenger',
    role: 'VP, Enterprise Growth North America',
  },
  {
    photo: v('/ss-deck-assets/team/marco-santarelli.png'),
    name: 'Marco Santarelli',
    role: 'VP of Engineering',
    pedigreeLabel: '12+ yrs fintech',
  },
  {
    photo: v('/ss-deck-assets/team/juan-manuel-rebull.png'),
    name: 'Juan Manuel Rebull',
    role: 'SVP of Engineering',
  },
  {
    photo: v('/ss-deck-assets/team/simon-martinez.png'),
    name: 'Simon Martinez',
    role: 'Head of AI Solutions',
    pedigree: ['rappi'],
    pedigreeLabel: 'ex-Rappi',
  },
  {
    photo: v('/ss-deck-assets/team/daniel-rebelo.png'),
    name: 'Daniel Rebelo',
    role: 'Global Head of Customer Success',
    pedigree: ['worldpay', 'nuvei'],
  },
  {
    photo: v('/ss-deck-assets/team/martin-mexia.png'),
    name: 'Martin Mexia',
    role: 'Head of Product',
    pedigree: ['revolut', 'rappi'],
  },
  {
    photo: v('/ss-deck-assets/team/christo-papadopoulos.png'),
    name: 'Christo Papadopoulos',
    role: 'Head of Data',
    pedigree: ['paypal'],
    pedigreeLabel: 'PayPal (Settle)',
  },
  {
    photo: v('/ss-deck-assets/team/daniela-reyes.png'),
    name: 'Daniela Reyes',
    role: 'Global Head of Partnerships',
    pedigree: ['adyen'],
    pedigreeLabel: 'ex-Adyen',
  },
]

// Unified pedigree strip - deduped across both tiers,
// ordered for recognizability (most well-known consumer-facing brands first).
export const PEDIGREE_LOGOS = [
  'stripe',
  'mastercard',
  'visa',
  'jpmorgan',
  'citi',
  'paypal',
  'adyen',
  'checkout',
  'uber',
  'rappi',
  'worldpay',
  'fis',
  'dlocal',
  'revolut',
  'nuvei',
  'accenture',
  'worldline',
  'ntt-data',
]

// Per-logo visual weight normalization - compact marks (stacked, square)
// need to be rendered taller than wide wordmarks to read at equivalent
// optical size.
export const LOGO_SCALES = {
  mastercard: 1.55,
  adyen: 1.35,
  rappi: 1.2,
  paypal: 1.05,
  jpmorgan: 1.1,
  stripe: 1.0,
  uber: 1.0,
  dlocal: 1.0,
  worldpay: 1.0,
  revolut: 1.0,
  nuvei: 1.0,
  visa: 1.0,
  citi: 1.1,
  checkout: 0.95,
  fis: 1.3,
  accenture: 0.95,
  worldline: 0.95,
  'ntt-data': 1.1,
}

// Per-logo vertical nudge in px, applied as marginTop in StripLogo. Used
// for logos whose PNG has asymmetric top/bottom padding, which throws off
// visual baseline alignment when the row is center-aligned. Positive values
// push the logo DOWN.
export const LOGO_BASELINE_NUDGE = {}
