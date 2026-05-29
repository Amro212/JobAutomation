import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import type { JobListFilters } from '@jobautomation/core';
import { getJobs } from '@renderer/lib/api';

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
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Jobs</h1>
        <p className="section-copy">
          Jobs now support basic filtering in the desktop shell and drill into the same detail records as the current dashboard.
        </p>
      </section>

      <section className="card">
        <div className="form-grid">
          <label className="field">
            <span className="label-copy">Title</span>
            <input
              className="input"
              value={filters.title}
              onChange={(event) =>
                setFilters((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span className="label-copy">Company</span>
            <input
              className="input"
              value={filters.companyName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, companyName: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span className="label-copy">Location</span>
            <input
              className="input"
              value={filters.location}
              onChange={(event) =>
                setFilters((current) => ({ ...current, location: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span className="label-copy">Status</span>
            <select
              className="input"
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
          <label className="field">
            <span className="label-copy">Match profile</span>
            <select
              className="input"
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

        <div className="inline-actions">
          <button className="button" onClick={() => void applyFilters()}>
            Apply Filters
          </button>
          <button
            className="button ghost"
            onClick={() => {
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
          </button>
        </div>
      </section>

      <section className="card">
        <p className="section-copy">Showing {jobs.length} of {total} matching jobs.</p>
        {jobs.length === 0 ? (
          <p className="section-copy">No jobs have been discovered yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link className="table-link" to={`/jobs/${job.id}`}>
                      {job.title}
                    </Link>
                  </td>
                  <td>{job.company}</td>
                  <td>{job.location || 'Unspecified'}</td>
                  <td>{job.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
