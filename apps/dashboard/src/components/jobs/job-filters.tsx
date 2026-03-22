import Link from 'next/link';

import type { JobListFilters } from '@jobautomation/core';

import { CompanyNameCombobox } from '@/components/jobs/company-name-combobox';
import { LocationCountryCombobox } from '@/components/jobs/location-country-combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const sourceKindOptions = [
  { value: '', label: 'Any source' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'ashby', label: 'Ashby' }
];

const statusOptions = [
  { value: '', label: 'Any status' },
  { value: 'discovered', label: 'Discovered' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'archived', label: 'Archived' }
];

const remoteTypeOptions = [
  { value: '', label: 'Any remote type' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'unknown', label: 'Unknown' }
];

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function JobFilters({
  filters,
  resetHref,
  companyOptions,
  showMatchScope,
  matchScopeLinks
}: {
  filters: JobListFilters;
  resetHref: string;
  companyOptions: string[];
  showMatchScope?: boolean;
  matchScopeLinks?: { meHref: string; allHref: string };
}) {
  return (
    <form
      method="get"
      className="rounded-xl border bg-card p-6 shadow-sm"
    >
      <input type="hidden" name="matchProfile" value={filters.matchProfile ?? 'all'} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Review Filters
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Filter persisted discovery results without leaving the current workflow.
          </p>
          {showMatchScope && matchScopeLinks ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">Scope:</span>{' '}
              <Link
                href={matchScopeLinks.meHref}
                className={
                  filters.matchProfile === 'me'
                    ? 'font-medium text-foreground'
                    : 'text-primary underline-offset-4 hover:underline'
                }
              >
                My matches
              </Link>
              <span className="mx-2 text-muted-foreground" aria-hidden>
                ·
              </span>
              <Link
                href={matchScopeLinks.allHref}
                className={
                  filters.matchProfile === 'all'
                    ? 'font-medium text-foreground'
                    : 'text-primary underline-offset-4 hover:underline'
                }
              >
                All jobs
              </Link>
            </p>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={resetHref}>Reset</Link>
        </Button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <label className="space-y-2 text-sm">
          <span className="font-medium">Filter source kind</span>
          <select
            name="sourceKind"
            aria-label="Filter source kind"
            defaultValue={filters.sourceKind ?? ''}
            className={selectClassName}
          >
            {sourceKindOptions.map((option) => (
              <option key={option.value || 'any-source'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Filter status</span>
          <select
            name="status"
            aria-label="Filter status"
            defaultValue={filters.status ?? ''}
            className={selectClassName}
          >
            {statusOptions.map((option) => (
              <option key={option.value || 'any-status'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Filter remote type</span>
          <select
            name="remoteType"
            aria-label="Filter remote type"
            defaultValue={filters.remoteType ?? ''}
            className={selectClassName}
          >
            {remoteTypeOptions.map((option) => (
              <option key={option.value || 'any-remote-type'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Filter title</span>
          <Input
            type="text"
            name="title"
            aria-label="Filter title"
            defaultValue={filters.title ?? ''}
            placeholder="Platform"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Filter location</span>
          <LocationCountryCombobox
            name="country"
            defaultValue={filters.locationCountries ?? []}
            aria-label="Filter location country"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Filter company</span>
          <CompanyNameCombobox
            name="companyName"
            options={companyOptions}
            defaultValue={filters.companyName ?? ''}
            aria-label="Filter company name"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="submit">Apply filters</Button>
      </div>
    </form>
  );
}
