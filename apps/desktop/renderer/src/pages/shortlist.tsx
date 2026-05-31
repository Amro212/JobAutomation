import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Star, StarOff, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import type { JobListFilters } from '@jobautomation/core';
import { getJobs, removeJobFromShortlist } from '@renderer/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

export function ShortlistPage() {
  const [jobs, setJobs] = useState<
    Array<{ id: string; title: string; company: string; location: string; status: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const filters: Partial<JobListFilters> = { status: 'shortlisted' };
      const response = await getJobs(filters as JobListFilters);
      setJobs(
        response.jobs.map((job) => ({
          id: job.id,
          title: job.title,
          company: job.companyName,
          location: job.location,
          status: job.status
        }))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load shortlist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleRemove = async (jobId: string, jobTitle: string) => {
    setRemoving(jobId);
    try {
      await removeJobFromShortlist(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast.success(`Removed "${jobTitle}" from shortlist`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove from shortlist');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Shortlist
            {!loading && (
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({jobs.length} jobs)
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            aria-label="Refresh shortlist"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center">
            <Star className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No shortlisted jobs</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Star jobs from the Jobs page to add them here
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link to="/jobs">Browse Jobs</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium max-w-[260px] truncate">{job.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{job.company}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{job.location}</TableCell>
                  <TableCell>
                    <Badge variant="info" className="capitalize">
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <Link to={`/jobs/${job.id}`} aria-label={`View ${job.title}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${job.title} from shortlist`}
                        disabled={removing === job.id}
                        onClick={() => void handleRemove(job.id, job.title)}
                      >
                        <StarOff className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
