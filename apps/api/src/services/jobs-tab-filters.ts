import {
  prefilterContextFromApplicant,
  prefilterMatchesMeaningful,
  type ApplicantProfile,
  type AutopilotConfig,
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

/**
 * Apply batch job pool: Jobs tab "My matches" filters plus discovered-only rows
 * (the actionable queue — excludes jobs already marked applied in the list).
 */
export function autopilotJobPoolFilters(
  profile: ApplicantProfile | null,
  config: AutopilotConfig
): JobListFilters {
  const tabDefaults = defaultJobListFiltersFromApplicant(profile);
  const merged: JobListFilters = {
    ...tabDefaults,
    ...config.jobFilters,
    status: config.jobFilters.status ?? 'discovered'
  };

  if (tabDefaults.matchProfile === 'me') {
    merged.matchProfile = 'me';
  } else if (config.matchProfile) {
    merged.matchProfile = config.matchProfile;
  }

  if (tabDefaults.locationCountries && tabDefaults.locationCountries.length > 0) {
    merged.locationCountries = tabDefaults.locationCountries;
  }

  return merged;
}
