/**
 * ISO 3166-1 alpha-2 country list with display labels, lowercase search aliases,
 * and static subdivision → parent-country tokens for text-based location matching.
 *
 * All tokens are **lowercase**; callers must lower() the DB column for comparison.
 */

export type CountryEntry = {
  code: string;
  label: string;
};

/** Countries surfaced in the multi-select filter (curated, job-market-relevant). */
export const FILTER_COUNTRIES: readonly CountryEntry[] = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'IE', label: 'Ireland' },
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NO', label: 'Norway' },
  { code: 'DK', label: 'Denmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'PT', label: 'Portugal' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'AT', label: 'Austria' },
  { code: 'BE', label: 'Belgium' },
  { code: 'PL', label: 'Poland' },
  { code: 'CZ', label: 'Czech Republic' },
  { code: 'IL', label: 'Israel' },
  { code: 'SG', label: 'Singapore' },
  { code: 'JP', label: 'Japan' },
  { code: 'KR', label: 'South Korea' },
  { code: 'IN', label: 'India' },
  { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' },
  { code: 'AR', label: 'Argentina' },
  { code: 'CO', label: 'Colombia' },
  { code: 'CL', label: 'Chile' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'BH', label: 'Bahrain' },
  { code: 'KW', label: 'Kuwait' },
  { code: 'OM', label: 'Oman' },
  { code: 'QA', label: 'Qatar' },
  { code: 'JO', label: 'Jordan' },
  { code: 'LB', label: 'Lebanon' },
  { code: 'IQ', label: 'Iraq' },
  { code: 'TR', label: 'Turkey' },
  { code: 'IR', label: 'Iran' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'NG', label: 'Nigeria' },
  { code: 'KE', label: 'Kenya' },
  { code: 'EG', label: 'Egypt' },
  { code: 'PH', label: 'Philippines' },
  { code: 'TW', label: 'Taiwan' },
  { code: 'RO', label: 'Romania' },
  { code: 'UA', label: 'Ukraine' },
  { code: 'HU', label: 'Hungary' },
  { code: 'GR', label: 'Greece' },
  { code: 'MY', label: 'Malaysia' },
  { code: 'TH', label: 'Thailand' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'VN', label: 'Vietnam' },
  { code: 'HK', label: 'Hong Kong' },
  { code: 'LU', label: 'Luxembourg' }
];

const COUNTRY_ALIASES: Record<string, string[]> = {
  US: [
    'united states', 'united states of america', 'usa', 'u.s.a.', 'u.s.', 'america',
    'namer', 'north america'
  ],
  CA: ['canada', 'canadian'],
  GB: [
    'united kingdom', 'uk', 'u.k.', 'great britain', 'england', 'scotland', 'wales',
    'northern ireland', 'emea'
  ],
  DE: ['germany', 'deutschland', 'emea'],
  FR: ['france', 'emea'],
  NL: ['netherlands', 'holland', 'emea'],
  IE: ['ireland', 'emea'],
  AU: ['australia', 'apac'],
  NZ: ['new zealand', 'apac'],
  SE: ['sweden', 'emea'],
  NO: ['norway', 'emea'],
  DK: ['denmark', 'emea'],
  FI: ['finland', 'emea'],
  ES: ['spain', 'emea'],
  IT: ['italy', 'emea'],
  PT: ['portugal', 'emea'],
  CH: ['switzerland', 'emea'],
  AT: ['austria', 'emea'],
  BE: ['belgium', 'emea'],
  PL: ['poland', 'emea'],
  CZ: ['czech republic', 'czechia', 'emea'],
  IL: ['israel'],
  SG: ['singapore', 'apac'],
  JP: ['japan', 'apac'],
  KR: ['south korea', 'korea', 'apac'],
  IN: ['india', 'apac'],
  BR: ['brazil', 'latam'],
  MX: ['mexico', 'latam'],
  AR: ['argentina', 'latam'],
  CO: ['colombia', 'latam'],
  CL: ['chile', 'latam'],
  AE: [
    'united arab emirates',
    'uae',
    'emirates',
    'dubai',
    'abu dhabi',
    'sharjah',
    'ajman',
    'ras al khaimah',
    'rak',
    'fujairah',
    'umm al quwain',
    'gcc',
    'gulf cooperation council',
    'mena'
  ],
  SA: [
    'saudi arabia',
    'saudi',
    'ksa',
    'kingdom of saudi arabia',
    'riyadh',
    'jeddah',
    'dammam',
    'khobar',
    'dhahran',
    'mecca',
    'medina',
    'gcc',
    'gulf',
    'gulf cooperation council',
    'mena'
  ],
  BH: [
    'bahrain',
    'kingdom of bahrain',
    'manama',
    'gcc',
    'gulf cooperation council',
    'mena'
  ],
  KW: [
    'kuwait',
    'state of kuwait',
    'kuwait city',
    'gcc',
    'gulf cooperation council',
    'mena'
  ],
  OM: [
    'oman',
    'sultanate of oman',
    'muscat',
    'salalah',
    'gcc',
    'gulf cooperation council',
    'mena'
  ],
  QA: [
    'qatar',
    'state of qatar',
    'doha',
    'gcc',
    'gulf cooperation council',
    'mena'
  ],
  JO: ['jordan', 'hashemite kingdom of jordan', 'amman', 'mena', 'middle east'],
  LB: ['lebanon', 'republic of lebanon', 'beirut', 'mena', 'middle east'],
  IQ: ['iraq', 'republic of iraq', 'baghdad', 'basra', 'erbil', 'mena', 'middle east'],
  TR: ['turkey', 'türkiye', 'turkiye', 'istanbul', 'ankara', 'izmir', 'mena', 'emea'],
  IR: ['iran', 'islamic republic of iran', 'persia', 'tehran', 'isfahan', 'shiraz', 'middle east'],
  ZA: ['south africa'],
  NG: ['nigeria'],
  KE: ['kenya'],
  EG: ['egypt'],
  PH: ['philippines', 'apac'],
  TW: ['taiwan', 'apac'],
  RO: ['romania', 'emea'],
  UA: ['ukraine', 'emea'],
  HU: ['hungary', 'emea'],
  GR: ['greece', 'emea'],
  MY: ['malaysia', 'apac'],
  TH: ['thailand', 'apac'],
  ID: ['indonesia', 'apac'],
  VN: ['vietnam', 'apac'],
  HK: ['hong kong', 'apac'],
  LU: ['luxembourg', 'emea']
};

/**
 * Static subdivision → parent country tokens.
 * Full names only for safety; short abbreviations deferred to avoid false positives.
 */
const US_STATES: string[] = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
  'connecticut', 'delaware', 'district of columbia', 'florida',
  'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky',
  'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
  'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota',
  'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
  'atlanta', 'austin', 'boston', 'chicago', 'dallas', 'denver', 'detroit',
  'houston', 'las vegas', 'los angeles', 'miami', 'minneapolis',
  'nashville', 'new york city', 'nyc', 'philadelphia', 'phoenix', 'pittsburgh',
  'portland', 'raleigh', 'salt lake city', 'san antonio', 'san diego',
  'san francisco', 'san jose', 'seattle', 'st. louis', 'tampa',
  'washington, d.c.', 'washington d.c.'
];

const CA_PROVINCES: string[] = [
  'alberta', 'british columbia', 'manitoba', 'new brunswick',
  'newfoundland', 'newfoundland and labrador', 'nova scotia',
  'northwest territories', 'nunavut', 'ontario', 'prince edward island',
  'quebec', 'saskatchewan', 'yukon',
  'toronto', 'montreal', 'vancouver', 'calgary', 'edmonton', 'ottawa',
  'winnipeg', 'quebec city', 'hamilton', 'kitchener', 'waterloo'
];

const AU_SUBDIVISIONS: string[] = [
  'new south wales', 'queensland', 'south australia', 'tasmania',
  'victoria', 'western australia', 'northern territory',
  'australian capital territory',
  'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra'
];

const GB_SUBDIVISIONS: string[] = [
  'london', 'manchester', 'birmingham', 'glasgow', 'edinburgh',
  'bristol', 'leeds', 'liverpool', 'cambridge', 'oxford', 'belfast', 'cardiff'
];

/** Major cities / regions for Gulf and wider Middle East job postings. */
const AE_CITIES: string[] = ['al ain', 'khalifa city'];
const SA_CITIES: string[] = ['neom', 'tabuk', 'abha', 'taif'];
const BH_CITIES: string[] = ['muharraq', 'riffa'];
const KW_CITIES: string[] = ['al jahra', 'hawalli', 'salmiya'];
const OM_CITIES: string[] = ['nizwa', 'sohar'];
const QA_CITIES: string[] = ['al rayyan', 'al wakrah', 'lusail'];
const JO_CITIES: string[] = ['zarqa', 'irbid', 'aqaba'];
const LB_CITIES: string[] = ['tripoli', 'sidon', 'tyre'];
const IQ_CITIES: string[] = ['mosul', 'kirkuk', 'najaf'];
const TR_CITIES: string[] = ['bursa', 'antalya', 'gaziantep'];
const IR_CITIES: string[] = ['mashhad', 'tabriz'];

const SUBDIVISIONS: Record<string, string[]> = {
  US: US_STATES,
  CA: CA_PROVINCES,
  AU: AU_SUBDIVISIONS,
  GB: GB_SUBDIVISIONS,
  AE: AE_CITIES,
  SA: SA_CITIES,
  BH: BH_CITIES,
  KW: KW_CITIES,
  OM: OM_CITIES,
  QA: QA_CITIES,
  JO: JO_CITIES,
  LB: LB_CITIES,
  IQ: IQ_CITIES,
  TR: TR_CITIES,
  IR: IR_CITIES
};

/**
 * Return all lowercase LIKE tokens for a given ISO2 country code.
 * Each token is a substring: the caller wraps it in `%token%` for SQL LIKE.
 */
export function getCountrySearchTokens(code: string): string[] {
  const upper = code.toUpperCase();
  const aliases = COUNTRY_ALIASES[upper] ?? [upper.toLowerCase()];
  const subdivisions = SUBDIVISIONS[upper] ?? [];
  return [...aliases, ...subdivisions];
}

/**
 * Build a flat list of `%token%` patterns for one or more ISO2 codes.
 * Used by the repository to construct `OR(lower(location) LIKE ...)` clauses.
 */
export function buildLocationLikePatterns(codes: string[]): string[] {
  const patterns: string[] = [];

  for (const code of codes) {
    for (const token of getCountrySearchTokens(code)) {
      patterns.push(`%${token}%`);
    }
  }

  return patterns;
}
