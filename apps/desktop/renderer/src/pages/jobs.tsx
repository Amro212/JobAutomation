import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import type { JobListFilters } from '@jobautomation/core';
import { getJobs } from '@renderer/lib/api';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';

const EMPTY_FILTERS: JobListFilters = {};

export function JobsPage() {
  const [filters, setFilters] = useState({
    title: '',
    companyName: '',
    location: '',
    status: '',
    matchProfile: ''
  });
  const [jobs, setJobs] = useState<Array<{ id: string; title: string; company: string; location: string; status: string }>>([]);
  const [total, setTotal] = useState(0);

  const refresh = async (nextFilters: JobListFilters = EMPTY_FILTERS) => {
    const response = await getJobs(nextFilters);
    setTotal(response.total);
    setJobs(
      response.jobs.slice(0, 25).map((job) => ({
        id: job.id,
        title: job.title,
        company: job.companyName,
        location: job.location,
        status: job.status
      }))
    );
  };

  useEffect(() => {
    void refresh();
  }, []);

  const applyFilters = async () => {
    const nextFilters: JobListFilters = {
      title: filters.title || undefined,
      companyName: filters.companyName || undefined,
      location: filters.location || undefined,
      status:
        filters.status === ''
          ? undefined
          : (filters.status as NonNullable<JobListFilters['status']>),
      matchProfile:
        filters.matchProfile === ''
          ? undefined
          : (filters.matchProfile as NonNullable<JobListFilters['matchProfile']>)
    };
    await refresh(nextFilters);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-2xl font-semibold mb-2">Jobs</h1>
        <p className="text-muted-foreground">
          Jobs now support basic filtering in the desktop shell and drill into the same detail records as the current dashboard.
        </p>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Title</span>
            <Input
              value={filters.title}
              onChange={(event) =>
                setFilters((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Company</span>
            <Input
              value={filters.companyName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, companyName: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Location</span>
            <Input
              value={filters.location}
              onChange={(event) =>
                setFilters((current) => ({ ...current, location: event.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Status</span>
            <select
              className="flex h-10 w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
            >
              <option value="">All</option>
              <option value="discovered">Discovered</option>
              <option value="reviewing">Reviewing</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="applied">Applied</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Match profile</span>
            <select
              className="flex h-10 w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={filters.matchProfile}
              onChange={(event) =>
                setFilters((current) => ({ ...current, matchProfile: event.target.value }))
              }
            >
              <option value="">All</option>
              <option value="me">Prefilter pass only</option>
              <option value="all">All jobs</option>
            </select>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="default" onPress={() => void applyFilters()}>
            Apply Filters
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setFilters({
                title: '',
                companyName: '',
                location: '',
                status: '',
                matchProfile: ''
              });
              void refresh();
            }}
          >
            Reset
          </Button>
        </div>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <p className="text-sm text-muted-foreground mb-6">Showing {jobs.length} of {total} matching jobs.</p>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs have been discovered yet.</p>
        ) : (
          <div className="w-full overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-card/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <Link className="text-sky-400 hover:text-sky-300 transition-colors font-medium" to={`/jobs/${job.id}`}>
                        {job.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{job.company}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.location || 'Unspecified'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-slate-500/10 text-slate-300">
                        {job.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
