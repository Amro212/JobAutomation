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

/**
 * All ISO 3166-1 alpha-2 countries for the multi-select filter.
 * Curated, job-market-relevant countries are listed first for priority display
 * when the user has not entered a search query. Remaining countries follow in
 * alphabetical order by label.
 */
export const FILTER_COUNTRIES: readonly CountryEntry[] = [
  // ── Curated: high job-market relevance ─────────────────────────────
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
  { code: 'LU', label: 'Luxembourg' },

  // ── Remaining countries (alphabetical by label) ────────────────────
  { code: 'AF', label: 'Afghanistan' },
  { code: 'AL', label: 'Albania' },
  { code: 'DZ', label: 'Algeria' },
  { code: 'AS', label: 'American Samoa' },
  { code: 'AD', label: 'Andorra' },
  { code: 'AO', label: 'Angola' },
  { code: 'AI', label: 'Anguilla' },
  { code: 'AQ', label: 'Antarctica' },
  { code: 'AG', label: 'Antigua and Barbuda' },
  { code: 'AM', label: 'Armenia' },
  { code: 'AW', label: 'Aruba' },
  { code: 'AZ', label: 'Azerbaijan' },
  { code: 'BS', label: 'Bahamas' },
  { code: 'BD', label: 'Bangladesh' },
  { code: 'BB', label: 'Barbados' },
  { code: 'BY', label: 'Belarus' },
  { code: 'BZ', label: 'Belize' },
  { code: 'BJ', label: 'Benin' },
  { code: 'BM', label: 'Bermuda' },
  { code: 'BT', label: 'Bhutan' },
  { code: 'BO', label: 'Bolivia' },
  { code: 'BA', label: 'Bosnia and Herzegovina' },
  { code: 'BW', label: 'Botswana' },
  { code: 'BN', label: 'Brunei' },
  { code: 'BG', label: 'Bulgaria' },
  { code: 'BF', label: 'Burkina Faso' },
  { code: 'BI', label: 'Burundi' },
  { code: 'CV', label: 'Cabo Verde' },
  { code: 'KH', label: 'Cambodia' },
  { code: 'CM', label: 'Cameroon' },
  { code: 'KY', label: 'Cayman Islands' },
  { code: 'CF', label: 'Central African Republic' },
  { code: 'TD', label: 'Chad' },
  { code: 'CN', label: 'China' },
  { code: 'KM', label: 'Comoros' },
  { code: 'CG', label: 'Congo' },
  { code: 'CD', label: 'Congo (DRC)' },
  { code: 'CK', label: 'Cook Islands' },
  { code: 'CR', label: 'Costa Rica' },
  { code: 'CI', label: "Cote d'Ivoire" },
  { code: 'HR', label: 'Croatia' },
  { code: 'CU', label: 'Cuba' },
  { code: 'CW', label: 'Curacao' },
  { code: 'CY', label: 'Cyprus' },
  { code: 'DJ', label: 'Djibouti' },
  { code: 'DM', label: 'Dominica' },
  { code: 'DO', label: 'Dominican Republic' },
  { code: 'EC', label: 'Ecuador' },
  { code: 'SV', label: 'El Salvador' },
  { code: 'GQ', label: 'Equatorial Guinea' },
  { code: 'ER', label: 'Eritrea' },
  { code: 'EE', label: 'Estonia' },
  { code: 'SZ', label: 'Eswatini' },
  { code: 'ET', label: 'Ethiopia' },
  { code: 'FK', label: 'Falkland Islands' },
  { code: 'FO', label: 'Faroe Islands' },
  { code: 'FJ', label: 'Fiji' },
  { code: 'GF', label: 'French Guiana' },
  { code: 'PF', label: 'French Polynesia' },
  { code: 'GA', label: 'Gabon' },
  { code: 'GM', label: 'Gambia' },
  { code: 'GE', label: 'Georgia' },
  { code: 'GH', label: 'Ghana' },
  { code: 'GI', label: 'Gibraltar' },
  { code: 'GL', label: 'Greenland' },
  { code: 'GD', label: 'Grenada' },
  { code: 'GP', label: 'Guadeloupe' },
  { code: 'GU', label: 'Guam' },
  { code: 'GT', label: 'Guatemala' },
  { code: 'GG', label: 'Guernsey' },
  { code: 'GN', label: 'Guinea' },
  { code: 'GW', label: 'Guinea-Bissau' },
  { code: 'GY', label: 'Guyana' },
  { code: 'HT', label: 'Haiti' },
  { code: 'HN', label: 'Honduras' },
  { code: 'IS', label: 'Iceland' },
  { code: 'IM', label: 'Isle of Man' },
  { code: 'JM', label: 'Jamaica' },
  { code: 'JE', label: 'Jersey' },
  { code: 'KZ', label: 'Kazakhstan' },
  { code: 'KI', label: 'Kiribati' },
  { code: 'XK', label: 'Kosovo' },
  { code: 'KG', label: 'Kyrgyzstan' },
  { code: 'LA', label: 'Laos' },
  { code: 'LV', label: 'Latvia' },
  { code: 'LS', label: 'Lesotho' },
  { code: 'LR', label: 'Liberia' },
  { code: 'LY', label: 'Libya' },
  { code: 'LI', label: 'Liechtenstein' },
  { code: 'LT', label: 'Lithuania' },
  { code: 'MO', label: 'Macau' },
  { code: 'MG', label: 'Madagascar' },
  { code: 'MW', label: 'Malawi' },
  { code: 'MV', label: 'Maldives' },
  { code: 'ML', label: 'Mali' },
  { code: 'MT', label: 'Malta' },
  { code: 'MH', label: 'Marshall Islands' },
  { code: 'MQ', label: 'Martinique' },
  { code: 'MR', label: 'Mauritania' },
  { code: 'MU', label: 'Mauritius' },
  { code: 'YT', label: 'Mayotte' },
  { code: 'FM', label: 'Micronesia' },
  { code: 'MD', label: 'Moldova' },
  { code: 'MC', label: 'Monaco' },
  { code: 'MN', label: 'Mongolia' },
  { code: 'ME', label: 'Montenegro' },
  { code: 'MS', label: 'Montserrat' },
  { code: 'MA', label: 'Morocco' },
  { code: 'MZ', label: 'Mozambique' },
  { code: 'MM', label: 'Myanmar' },
  { code: 'NA', label: 'Namibia' },
  { code: 'NR', label: 'Nauru' },
  { code: 'NP', label: 'Nepal' },
  { code: 'NC', label: 'New Caledonia' },
  { code: 'NI', label: 'Nicaragua' },
  { code: 'NE', label: 'Niger' },
  { code: 'NU', label: 'Niue' },
  { code: 'KP', label: 'North Korea' },
  { code: 'MK', label: 'North Macedonia' },
  { code: 'MP', label: 'Northern Mariana Islands' },
  { code: 'PK', label: 'Pakistan' },
  { code: 'PW', label: 'Palau' },
  { code: 'PS', label: 'Palestine' },
  { code: 'PA', label: 'Panama' },
  { code: 'PG', label: 'Papua New Guinea' },
  { code: 'PY', label: 'Paraguay' },
  { code: 'PE', label: 'Peru' },
  { code: 'PR', label: 'Puerto Rico' },
  { code: 'RE', label: 'Reunion' },
  { code: 'RU', label: 'Russia' },
  { code: 'RW', label: 'Rwanda' },
  { code: 'BL', label: 'Saint Barthelemy' },
  { code: 'SH', label: 'Saint Helena' },
  { code: 'KN', label: 'Saint Kitts and Nevis' },
  { code: 'LC', label: 'Saint Lucia' },
  { code: 'MF', label: 'Saint Martin' },
  { code: 'PM', label: 'Saint Pierre and Miquelon' },
  { code: 'VC', label: 'Saint Vincent and the Grenadines' },
  { code: 'WS', label: 'Samoa' },
  { code: 'SM', label: 'San Marino' },
  { code: 'ST', label: 'Sao Tome and Principe' },
  { code: 'SN', label: 'Senegal' },
  { code: 'RS', label: 'Serbia' },
  { code: 'SC', label: 'Seychelles' },
  { code: 'SL', label: 'Sierra Leone' },
  { code: 'SX', label: 'Sint Maarten' },
  { code: 'SK', label: 'Slovakia' },
  { code: 'SI', label: 'Slovenia' },
  { code: 'SB', label: 'Solomon Islands' },
  { code: 'SO', label: 'Somalia' },
  { code: 'SS', label: 'South Sudan' },
  { code: 'LK', label: 'Sri Lanka' },
  { code: 'SD', label: 'Sudan' },
  { code: 'SR', label: 'Suriname' },
  { code: 'SY', label: 'Syria' },
  { code: 'TJ', label: 'Tajikistan' },
  { code: 'TZ', label: 'Tanzania' },
  { code: 'TL', label: 'Timor-Leste' },
  { code: 'TG', label: 'Togo' },
  { code: 'TO', label: 'Tonga' },
  { code: 'TT', label: 'Trinidad and Tobago' },
  { code: 'TN', label: 'Tunisia' },
  { code: 'TM', label: 'Turkmenistan' },
  { code: 'TC', label: 'Turks and Caicos Islands' },
  { code: 'TV', label: 'Tuvalu' },
  { code: 'UG', label: 'Uganda' },
  { code: 'UY', label: 'Uruguay' },
  { code: 'UZ', label: 'Uzbekistan' },
  { code: 'VU', label: 'Vanuatu' },
  { code: 'VA', label: 'Vatican City' },
  { code: 'VE', label: 'Venezuela' },
  { code: 'VG', label: 'Virgin Islands (British)' },
  { code: 'VI', label: 'Virgin Islands (U.S.)' },
  { code: 'WF', label: 'Wallis and Futuna' },
  { code: 'EH', label: 'Western Sahara' },
  { code: 'YE', label: 'Yemen' },
  { code: 'ZM', label: 'Zambia' },
  { code: 'ZW', label: 'Zimbabwe' }
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
