import { z } from 'zod';

/**
 * Minimal applicant facts used to answer recurring job-board questions deterministically.
 * Large per-question forms are intentionally not stored; mapping derives answers from these fields.
 */
export const minimalAutofillProfileSchema = z.object({
  /** Free-text work authorization (e.g. "U.S. citizen — authorized to work in the United States without restriction"). */
  workAuthorization: z.string().default(''),
  /** Comma-separated ISO 3166-1 alpha-2 codes (e.g. "US, CA") for forms that ask country-specific authorization. */
  workAuthorizationCountriesCsv: z.string().default(''),
  requiresSponsorship: z.enum(['', 'yes', 'no']).default(''),
  clearanceStatus: z.enum(['', 'none', 'held', 'eligible', 'unsure']).default(''),
  relocation: z.enum(['', 'yes', 'no']).default(''),
  workPreference: z.enum(['', 'remote', 'hybrid', 'onsite']).default(''),
  startDate: z.string().default('')
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
