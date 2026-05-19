import {
  prefilterContextFromApplicant,
  prefilterMatchesMeaningful,
  type ApplicantProfile,
  type JobListFilters
} from '@jobautomation/core';

/** Same default filters as the dashboard Jobs page (My matches + Setup countries). */
export function defaultJobListFiltersFromApplicant(
  profile: ApplicantProfile | null
): JobListFilters {
  const meaningful = prefilterMatchesMeaningful(prefilterContextFromApplicant(profile));
  const preferredCountries = profile?.preferredCountries ?? [];

  return {
    matchProfile: meaningful ? 'me' : 'all',
    ...(preferredCountries.length > 0
      ? { locationCountries: preferredCountries }
      : {})
  };
}
