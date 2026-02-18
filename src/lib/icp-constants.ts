// =====================================================
// ICP BUILDER CONSTANTS
// =====================================================

// Section 1: Product Categories (grouped)
export const PRODUCT_CATEGORIES = [
  {
    group: 'Payments & Fintech',
    options: [
      'Payment Processing',
      'Payment Orchestration',
      'Banking-as-a-Service',
      'Lending Platform',
      'Fraud Prevention',
      'Crypto / Web3',
      'Insurance Tech',
      'Wealth Management',
    ],
  },
  {
    group: 'Marketing & Sales',
    options: [
      'CRM',
      'Marketing Automation',
      'Sales Enablement',
      'ABM Platform',
      'Email Marketing',
      'Social Media Management',
      'SEO / Content',
      'Advertising Tech',
    ],
  },
  {
    group: 'Software & Technology',
    options: [
      'API Platform',
      'DevOps / CI-CD',
      'Cloud Infrastructure',
      'Cybersecurity',
      'Data Analytics',
      'AI / ML Platform',
      'Low-Code / No-Code',
      'Communication / Messaging',
    ],
  },
  {
    group: 'HR & Operations',
    options: [
      'HRIS / Payroll',
      'Recruiting / ATS',
      'Project Management',
      'ERP',
      'Supply Chain',
      'Procurement',
    ],
  },
  {
    group: 'E-commerce & Retail',
    options: [
      'E-commerce Platform',
      'Marketplace Software',
      'Shipping / Logistics',
      'POS / Retail Tech',
      'Inventory Management',
    ],
  },
  {
    group: 'Other',
    options: [
      'Healthcare / MedTech',
      'EdTech',
      'PropTech / Real Estate',
      'Travel Tech',
      'Gaming',
      'Media / Entertainment',
      'Other',
    ],
  },
]

// Section 2: Business Models
export const BUSINESS_MODELS = [
  'B2C',
  'B2B',
  'B2B2C',
  'B2C2B',
  'Marketplace',
  'Platform',
  'SaaS',
  'D2C',
]

// Section 2: Industries (grouped)
export const INDUSTRIES = [
  {
    group: 'Technology',
    options: [
      'SaaS',
      'Fintech',
      'AI / Machine Learning',
      'Cybersecurity',
      'Cloud Computing',
      'Developer Tools',
      'IoT',
      'Blockchain / Web3',
    ],
  },
  {
    group: 'Commerce & Retail',
    options: [
      'E-commerce',
      'Marketplace',
      'Retail',
      'Fashion & Apparel',
      'Beauty & Personal Care',
      'Grocery / Food Delivery',
      'D2C Brands',
    ],
  },
  {
    group: 'Financial Services',
    options: [
      'Banking',
      'Insurance',
      'Payments',
      'Lending',
      'Wealth Management',
      'Accounting / Tax',
    ],
  },
  {
    group: 'Mobility & Logistics',
    options: [
      'Ride-hailing / Mobility',
      'Last-mile Delivery',
      'Freight / Shipping',
      'Supply Chain',
      'Fleet Management',
    ],
  },
  {
    group: 'Healthcare & Life Sciences',
    options: [
      'HealthTech',
      'Telemedicine',
      'Pharma',
      'Medical Devices',
      'Mental Health',
    ],
  },
  {
    group: 'Media & Entertainment',
    options: [
      'Gaming',
      'Streaming / OTT',
      'Digital Media',
      'Sports Tech',
      'Music Tech',
    ],
  },
  {
    group: 'Travel & Hospitality',
    options: [
      'Travel / OTA',
      'Airlines',
      'Hotels / Hospitality',
      'Tourism Platforms',
    ],
  },
  {
    group: 'Education',
    options: [
      'EdTech',
      'Online Learning',
      'Corporate Training',
    ],
  },
  {
    group: 'Real Estate & PropTech',
    options: [
      'PropTech',
      'Real Estate Marketplace',
      'Construction Tech',
    ],
  },
  {
    group: 'Other',
    options: [
      'Food & Beverage',
      'Agriculture / AgTech',
      'Energy / CleanTech',
      'Manufacturing',
      'Telecom',
      'Government / GovTech',
      'Non-profit',
    ],
  },
]

// Section 2: Company Sizes
export const COMPANY_SIZES = [
  { value: 'startup', label: 'Startup', range: '1-50 employees' },
  { value: 'smb', label: 'SMB', range: '51-200 employees' },
  { value: 'mid-market', label: 'Mid-Market', range: '201-1,000 employees' },
  { value: 'enterprise', label: 'Enterprise', range: '1,001-5,000 employees' },
  { value: 'large-enterprise', label: 'Large Enterprise', range: '5,000+ employees' },
]

// Section 2: Revenue Ranges
export const REVENUE_RANGES = [
  '< $1M',
  '$1M - $5M',
  '$5M - $10M',
  '$10M - $50M',
  '$50M - $100M',
  '$100M - $500M',
  '$500M - $1B',
  '> $1B',
]

// Section 2: Company Stages
export const COMPANY_STAGES = [
  'Pre-seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C+',
  'Growth',
  'Public',
  'Bootstrapped',
  'Private Equity',
]

// Section 3: Regions (hierarchical)
export const REGIONS = [
  {
    region: 'North America',
    countries: ['United States', 'Canada', 'Mexico'],
  },
  {
    region: 'Latin America',
    countries: [
      'Brazil',
      'Mexico',
      'Colombia',
      'Argentina',
      'Chile',
      'Peru',
      'Ecuador',
      'Costa Rica',
      'Panama',
      'Dominican Republic',
      'Uruguay',
      'Guatemala',
    ],
  },
  {
    region: 'Europe',
    countries: [
      'United Kingdom',
      'Germany',
      'France',
      'Spain',
      'Netherlands',
      'Italy',
      'Sweden',
      'Switzerland',
      'Poland',
      'Portugal',
      'Ireland',
      'Norway',
      'Denmark',
      'Finland',
      'Belgium',
    ],
  },
  {
    region: 'Asia Pacific',
    countries: [
      'China',
      'India',
      'Japan',
      'South Korea',
      'Australia',
      'Singapore',
      'Indonesia',
      'Thailand',
      'Vietnam',
      'Philippines',
      'Malaysia',
      'New Zealand',
    ],
  },
  {
    region: 'Middle East & Africa',
    countries: [
      'UAE',
      'Saudi Arabia',
      'Israel',
      'South Africa',
      'Nigeria',
      'Egypt',
      'Kenya',
      'Turkey',
      'Qatar',
    ],
  },
]

// Section 4: Digital Presence Signals
export const DIGITAL_PRESENCE_SIGNALS = [
  { value: 'mobile_app', label: 'Has a mobile app' },
  { value: 'ecommerce', label: 'Has e-commerce / online store' },
  { value: 'digital_payments', label: 'Processes digital payments' },
  { value: 'subscription', label: 'Has subscription/recurring billing' },
  { value: 'marketplace', label: 'Has marketplace or platform model' },
  { value: 'international_online', label: 'Operates internationally online' },
  { value: 'high_volume', label: 'High digital transaction volume' },
  { value: 'api_driven', label: 'Offers public APIs / developer platform' },
]

// Section 4: Tech Signals (grouped)
export const TECH_SIGNALS = [
  {
    group: 'Payments',
    options: ['Stripe', 'PayPal', 'Adyen', 'Braintree', 'Square', 'Checkout.com', 'dLocal'],
  },
  {
    group: 'E-commerce',
    options: ['Shopify', 'Magento', 'WooCommerce', 'BigCommerce', 'VTEX', 'Salesforce Commerce'],
  },
  {
    group: 'CRM & Sales',
    options: ['Salesforce', 'HubSpot', 'Pipedrive', 'Zoho CRM', 'Monday CRM'],
  },
  {
    group: 'Marketing',
    options: ['Mailchimp', 'Klaviyo', 'Braze', 'Segment', 'Mixpanel', 'Amplitude'],
  },
  {
    group: 'Cloud & DevOps',
    options: ['AWS', 'Google Cloud', 'Azure', 'Vercel', 'Cloudflare', 'Datadog'],
  },
  {
    group: 'Communication',
    options: ['Twilio', 'SendGrid', 'Intercom', 'Zendesk', 'Slack'],
  },
]

// Section 5: Buying Signals
export const BUYING_SIGNALS = [
  { value: 'recent_funding', label: 'Recent funding round', description: 'Raised capital in the last 12 months' },
  { value: 'geographic_expansion', label: 'Geographic expansion', description: 'Announced expansion to new markets' },
  { value: 'hiring_relevant', label: 'Hiring for relevant roles', description: 'Posting jobs related to your product area' },
  { value: 'tech_migration', label: 'Technology migration', description: 'Switching platforms or rebuilding tech stack' },
  { value: 'rapid_growth', label: 'Rapid growth', description: 'Showing signs of fast revenue or user growth' },
  { value: 'new_product', label: 'New product launch', description: 'Recently launched new digital products or services' },
  { value: 'pain_reviews', label: 'Pain points in reviews', description: 'Negative reviews about areas your product solves' },
  { value: 'competitor_customer', label: 'Competitor customer', description: 'Currently using a competing solution' },
]

// Section 6: Exclusion Criteria
export const EXCLUSION_CRITERIA = [
  { value: 'has_inhouse', label: 'Already has an in-house solution' },
  { value: 'competitor', label: 'Is a direct competitor' },
  { value: 'pre_revenue', label: 'Is pre-revenue / too early stage' },
  { value: 'declining', label: 'Is in a declining industry' },
  { value: 'no_digital', label: 'Has no digital/online presence' },
  { value: 'too_small', label: 'Is too small for our product' },
  { value: 'too_large', label: 'Is too large / enterprise-only deals' },
]

// Score breakdown categories (for results display)
export const SCORE_CATEGORIES = [
  { key: 'industry_match', label: 'Industry Match' },
  { key: 'company_size', label: 'Company Size' },
  { key: 'geography', label: 'Geography' },
  { key: 'business_model', label: 'Business Model' },
  { key: 'digital_presence', label: 'Digital Presence' },
  { key: 'buying_signals', label: 'Buying Signals' },
  { key: 'exclusion_check', label: 'Exclusion Check' },
]
