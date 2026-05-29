import type { ApplicantProfile, AutopilotConfig, JobListFilters } from '@jobautomation/core';

/** Same default filters as the dashboard Jobs page (My matches when a keyword profile exists). */
export function defaultJobListFiltersFromApplicant(
  profile: ApplicantProfile | null
): JobListFilters {
  const meaningful = profile?.jobKeywordProfile != null;

  return {
    sourceKind: undefined,
    status: undefined,
    remoteType: undefined,
    title: undefined,
    location: undefined,
    companyName: undefined,
    locationCountries: undefined,
    matchProfile: meaningful ? 'me' : 'all'
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

  return merged;
}
