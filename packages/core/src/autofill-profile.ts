import { z } from 'zod';

/**
 * Minimal applicant facts used to answer recurring job-board questions deterministically.
 * Large per-question forms are intentionally not stored; mapping derives answers from these fields.
 */
export const minimalAutofillProfileSchema = z.object({
  /** Comma-separated ISO 3166-1 alpha-2 codes (e.g. "US, CA") for forms that ask country-specific authorization. */
  workAuthorizationCountriesCsv: z.string().default(''),
  requiresSponsorship: z.enum(['', 'yes', 'no']).default(''),
  requiresSponsorshipCountriesCsv: z.string().default(''),
  clearanceStatus: z.enum(['', 'none', 'held', 'eligible', 'unsure']).default(''),
  relocation: z.enum(['', 'yes', 'no']).default(''),
  workPreference: z.enum(['', 'no_preference', 'remote', 'hybrid', 'onsite']).default(''),
  startDate: z.string().default(''),
  genderPronouns: z.enum(['', 'male', 'female', 'non_binary', 'prefer_not_to_say', 'custom']).default(''),
  genderPronounsCustom: z.string().default(''),
  raceEthnicity: z
    .enum([
      '',
      'hispanic_or_latino',
      'white',
      'black_or_african_american',
      'asian',
      'native_hawaiian_or_pacific_islander',
      'american_indian_or_alaska_native',
      'two_or_more',
      'prefer_not_to_say'
    ])
    .default(''),
  veteranStatus: z.enum(['', 'not_veteran', 'veteran', 'protected_veteran', 'prefer_not_to_say']).default(''),
  disabilityStatus: z
    .enum(['', 'no', 'yes_prefer_not_to_specify', 'yes_specific_accommodation', 'prefer_not_to_say'])
    .default(''),
  driversLicense: z.enum(['', 'yes', 'no']).default(''),
  willingToTravel: z
    .enum(['', '0', '25', '50', '75', '100'])
    .default(''),
  yearsOfExperience: z.enum(['', 'lt_1', '1_3', '3_5', '5_10', '10_plus']).default(''),
  highestEducation: z
    .enum(['', 'high_school', 'associate', 'bachelor', 'master', 'phd', 'trade_vocational'])
    .default(''),
  highestEducationSchool: z.string().default(''),
  highestEducationProgram: z.string().default(''),
  highestEducationDiscipline: z.string().default(''),
  criminalBackground: z.enum(['', 'yes', 'no', 'disclose_if_required']).default(''),
  noticePeriod: z.enum(['', 'immediate', '2_weeks', '1_month', '2_plus_months']).default(''),
  currentlyEmployed: z.enum(['', 'yes', 'no']).default(''),
  salaryExpectations: z.string().default(''),
  salaryExpectationAmount: z.string().default(''),
  salaryExpectationCurrency: z.string().default('USD'),
  salaryExpectationPeriod: z.enum(['', 'yearly', 'hourly']).default(''),
  willingToWorkNightsWeekends: z.enum(['', 'yes', 'no', 'occasionally']).default(''),
  certificationsLicenses: z.string().default(''),
  languagesSpoken: z.string().default(''),
  knowsSomeoneAtCompany: z.enum(['', 'yes', 'no']).default('')
});

export type MinimalAutofillProfile = z.infer<typeof minimalAutofillProfileSchema>;

export const defaultMinimalAutofillProfile: MinimalAutofillProfile =
  minimalAutofillProfileSchema.parse({});

/** Split "US, ca, GB" → ["US","CA","GB"]. */
export function parseWorkAuthorizationCountriesCsv(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length === 2);
}
