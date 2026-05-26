import type {
  AutopilotApplySiteKey,
  AutopilotConfigInput,
  DiscoverySourceRecord
} from '@jobautomation/core';

function trimValues(values: FormDataEntryValue[]): string[] {
  return values
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

function parsePreferredCountries(formData: FormData): string[] {
  return trimValues(formData.getAll('preferredCountry'))
    .filter((value) => value.length === 2)
    .map((value) => value.toUpperCase());
}

function isApplySiteSourceKind(
  value: DiscoverySourceRecord['sourceKind']
): value is AutopilotApplySiteKey {
  return value === 'greenhouse' || value === 'lever' || value === 'ashby';
}

export function sourceIdsForApplySites(
  sources: DiscoverySourceRecord[],
  siteKeys: AutopilotApplySiteKey[]
): string[] {
  const selectedSites = new Set(siteKeys);
  return sources
    .filter(
      (source) =>
        isApplySiteSourceKind(source.sourceKind) &&
        selectedSites.has(source.sourceKind)
    )
    .map((source) => source.id);
}

export function parseAutopilotSettingsFormData(
  formData: FormData
): AutopilotConfigInput {
  const maxJobsRaw = String(formData.get('maxJobsPerRun') ?? '').trim();
  const matchProfileRaw = String(formData.get('matchProfile') ?? '').trim();
  const preferredCountries = parsePreferredCountries(formData);
  const discoveryCacheHoursRaw = String(
    formData.get('discoveryCacheHours') ?? ''
  ).trim();
  const sourceScope = String(formData.get('sourceScope') ?? 'all');

  const parsedMaxJobs =
    maxJobsRaw.length > 0 && Number.isFinite(Number(maxJobsRaw))
      ? Math.trunc(Number(maxJobsRaw))
      : null;
  const parsedDiscoveryCacheHours =
    discoveryCacheHoursRaw.length > 0 &&
    Number.isFinite(Number(discoveryCacheHoursRaw))
      ? Number(discoveryCacheHoursRaw)
      : undefined;
  const artifactModeRaw = String(formData.get('artifactMode') ?? 'both');

  return {
    discoverySourceIds:
      sourceScope === 'custom'
        ? trimValues(formData.getAll('discoverySourceId'))
        : [],
    applySiteKeys: trimValues(formData.getAll('applySiteKey')) as Array<
      'greenhouse' | 'lever' | 'ashby'
    >,
    maxJobsPerRun: parsedMaxJobs,
    matchProfile: matchProfileRaw === 'me' ? 'me' : null,
    forceFreshDiscovery: formData.get('forceFreshDiscovery') === 'on',
    discoveryCacheHours: parsedDiscoveryCacheHours,
    artifactMode:
      artifactModeRaw === 'resume'
        ? 'resume'
        : artifactModeRaw === 'cover-letter'
          ? 'cover-letter'
          : 'both',
    jobFilters: {
      locationCountries: preferredCountries
    }
  };
}

export function parseAutopilotPreferredCountries(formData: FormData): string[] {
  return parsePreferredCountries(formData);
}
