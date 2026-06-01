import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Send, ExternalLink, RefreshCw, FileText } from 'lucide-react';
import { toast } from 'sonner';

import { getApplicationRunsPage, buildArtifactFileUrl } from '@renderer/lib/api';
import type { ApplicationRunSummary } from '@renderer/lib/api';
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

function statusVariant(status: string): 'success' | 'destructive' | 'warning' | 'outline' {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
    case 'blocked':
      return 'destructive';
    case 'running':
      return 'warning';
    default:
      return 'outline';
  }
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function SubmittedPage() {
  const [runs, setRuns] = useState<ApplicationRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const refresh = async (nextPage = page) => {
    setLoading(true);
    try {
      const data = await getApplicationRunsPage({
        page: nextPage,
        pageSize,
        status: ['completed']
      });
      setRuns(data.runs);
      setTotal(data.total);
      setPage(data.page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load submitted applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleArtifactClick = async (artifactId: string, label: string) => {
    const url = await buildArtifactFileUrl(artifactId);
    window.open(url, '_blank');
    toast.success(`Opening ${label}...`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Submitted Applications
            {!loading && (
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({total})
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh(page)}
            aria-label="Refresh submitted list"
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
        ) : total === 0 ? (
          <div className="p-12 text-center">
            <Send className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No applications submitted yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Run the Autopilot to start applying to shortlisted jobs
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link to="/autopilot">Go to Autopilot</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Artifacts</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map(({ run, job, resumeArtifact, coverLetterArtifact }) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium max-w-[220px] truncate">
                    {job.title}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{job.companyName}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(run.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run.status)} className="capitalize">
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {resumeArtifact && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            void handleArtifactClick(resumeArtifact.id, 'Resume PDF')
                          }
                          aria-label={`Open resume for ${job.title}`}
                        >
                          <FileText className="h-3 w-3" />
                          Resume
                        </Button>
                      )}
                      {coverLetterArtifact && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() =>
                            void handleArtifactClick(coverLetterArtifact.id, 'Cover Letter')
                          }
                          aria-label={`Open cover letter for ${job.title}`}
                        >
                          <FileText className="h-3 w-3" />
                          Cover
                        </Button>
                      )}
                    </div>
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
        )}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => void refresh(page - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => void refresh(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
