import Link from 'next/link';

import type { JobListFilters } from '@jobautomation/core';

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

export function JobFilters({
  filters,
  resetHref
}: {
  filters: JobListFilters;
  resetHref: string;
}) {
  return (
    <form
      method="get"
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Review Filters
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Filter persisted discovery results without leaving the current workflow.
          </p>
        </div>
        <Link href={resetHref} className="text-sm font-medium text-slate-600 underline">
          Reset
        </Link>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-5">
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Filter source kind</span>
          <select
            name="sourceKind"
            aria-label="Filter source kind"
            defaultValue={filters.sourceKind ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            {sourceKindOptions.map((option) => (
              <option key={option.value || 'any-source'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Filter status</span>
          <select
            name="status"
            aria-label="Filter status"
            defaultValue={filters.status ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            {statusOptions.map((option) => (
              <option key={option.value || 'any-status'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Filter remote type</span>
          <select
            name="remoteType"
            aria-label="Filter remote type"
            defaultValue={filters.remoteType ?? ''}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            {remoteTypeOptions.map((option) => (
              <option key={option.value || 'any-remote-type'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Filter title</span>
          <input
            type="text"
            name="title"
            aria-label="Filter title"
            defaultValue={filters.title ?? ''}
            placeholder="Platform"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          <span className="font-medium">Filter location</span>
          <input
            type="text"
            name="location"
            aria-label="Filter location"
            defaultValue={filters.location ?? ''}
            placeholder="Canada"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}
