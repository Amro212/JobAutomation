import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Search, Filter, ExternalLink, RefreshCw } from 'lucide-react';

import type { JobListFilters } from '@jobautomation/core';
import { getJobs } from '@renderer/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@renderer/lib/utils';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'discovered', label: 'Discovered' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'applied', label: 'Applied' },
  { value: 'rejected', label: 'Rejected' }
];

const MATCH_OPTIONS = [
  { value: 'all', label: 'All Jobs' },
  { value: 'me', label: 'Matching Me' }
];

function statusVariant(
  status: string
): 'default' | 'success' | 'warning' | 'destructive' | 'outline' | 'info' {
  switch (status) {
    case 'applied':
      return 'success';
    case 'shortlisted':
      return 'info';
    case 'rejected':
      return 'destructive';
    case 'discovered':
      return 'outline';
    default:
      return 'secondary' as never;
  }
}

export function JobsPage() {
  const [filters, setFilters] = useState({
    title: '',
    companyName: '',
    location: '',
    status: '',
    matchProfile: 'me' // Default to "Matching Me" for instant, relevant load times
  });
  const [jobs, setJobs] = useState<
    Array<{ id: string; title: string; company: string; location: string; status: string; sourceUrl: string }>
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50); // Fetch 50 items per page

  const refresh = async (nextFilters: Partial<JobListFilters> = {}, targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await getJobs({
        ...nextFilters,
        page: targetPage,
        pageSize
      } as any);
      setTotal(response.total);
      setJobs(
        response.jobs.map((job) => ({
          id: job.id,
          title: job.title,
          company: job.companyName,
          location: job.location,
          status: job.status,
          sourceUrl: job.sourceUrl
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh({ matchProfile: 'me' }, 1);
  }, []);

  const applyFilters = async () => {
    setPage(1);
    const next: Partial<JobListFilters> = {};
    if (filters.title) next.title = filters.title;
    if (filters.companyName) next.companyName = filters.companyName;
    if (filters.location) next.location = filters.location;
    if (filters.status) next.status = filters.status as JobListFilters['status'];
    if (filters.matchProfile === 'me') next.matchProfile = 'me';
    await refresh(next as JobListFilters, 1);
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filters
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              aria-label="Refresh jobs list"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="jobs-filter-title"
                placeholder="Job title..."
                value={filters.title}
                onChange={(e) => setFilters({ ...filters, title: e.target.value })}
                className="pl-9"
              />
            </div>

            <Input
              id="jobs-filter-company"
              placeholder="Company..."
              value={filters.companyName}
              onChange={(e) => setFilters({ ...filters, companyName: e.target.value })}
            />

            <Input
              id="jobs-filter-location"
              placeholder="Location..."
              value={filters.location}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })}
            />

            <Select
              value={filters.status || 'all'}
              onValueChange={(v) => setFilters({ ...filters, status: v === 'all' ? '' : v })}
            >
              <SelectTrigger id="jobs-filter-status" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.matchProfile || 'all'}
              onValueChange={(v) => setFilters({ ...filters, matchProfile: v === 'all' ? '' : v })}
            >
              <SelectTrigger id="jobs-filter-profile" aria-label="Filter by match profile">
                <SelectValue placeholder="Profile Match" />
              </SelectTrigger>
              <SelectContent>
                {MATCH_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end mt-3">
            <Button onClick={() => void applyFilters()} size="sm">
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Jobs
              {!loading && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({total} total)
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div
              role="alert"
              className="p-8 text-center text-sm text-destructive"
            >
              {error}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 block mx-auto"
                onClick={() => void refresh()}
              >
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No jobs found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Configure discovery sources to start finding jobs
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium max-w-[220px] truncate">
                        {job.title}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{job.company}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{job.location}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(job.status)} className="capitalize">
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 transition-transform hover:scale-105 active:scale-95"
                          asChild={!!job.sourceUrl}
                          disabled={!job.sourceUrl}
                          title={job.sourceUrl ? `View posting for ${job.title}` : 'Job posting URL is unavailable'}
                        >
                          {job.sourceUrl ? (
                            <a
                              href={job.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`View posting for ${job.title}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5 opacity-50" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination Footer */}
              <div className="flex items-center justify-between p-4 border-t border-border bg-card/30">
                <span className="text-xs text-muted-foreground">
                  Showing page {page} of {Math.max(1, Math.ceil(total / pageSize))} ({total} total jobs)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={async () => {
                      const prevPage = Math.max(1, page - 1);
                      if (prevPage !== page) {
                        setPage(prevPage);
                        const next: Partial<JobListFilters> = {};
                        if (filters.title) next.title = filters.title;
                        if (filters.companyName) next.companyName = filters.companyName;
                        if (filters.location) next.location = filters.location;
                        if (filters.status) next.status = filters.status as JobListFilters['status'];
                        if (filters.matchProfile === 'me') next.matchProfile = 'me';
                        await refresh(next as JobListFilters, prevPage);
                      }
                    }}
                    disabled={page === 1 || loading}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={async () => {
                      const nextPage = Math.min(Math.ceil(total / pageSize), page + 1);
                      if (nextPage !== page) {
                        setPage(nextPage);
                        const next: Partial<JobListFilters> = {};
                        if (filters.title) next.title = filters.title;
                        if (filters.companyName) next.companyName = filters.companyName;
                        if (filters.location) next.location = filters.location;
                        if (filters.status) next.status = filters.status as JobListFilters['status'];
                        if (filters.matchProfile === 'me') next.matchProfile = 'me';
                        await refresh(next as JobListFilters, nextPage);
                      }
                    }}
                    disabled={page >= Math.ceil(total / pageSize) || loading}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
