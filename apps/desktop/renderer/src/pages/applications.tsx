import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { FolderOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { getApplicationRunsPage, getApplicationRunsStats } from '@renderer/lib/api';
import type { ApplicationRunSummary } from '@renderer/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
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
    case 'completed':
      return 'success';
    case 'failed':
    case 'blocked':
    case 'cancelled':
      return 'destructive';
    case 'running':
    case 'pending':
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
    day: 'numeric'
  });
}

export function ApplicationsPage() {
  const [runs, setRuns] = useState<ApplicationRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ successCount: 0, blockedCount: 0 });

  const refresh = async (nextPage = page) => {
    setLoading(true);
    try {
      const [data, statsData] = await Promise.all([
        getApplicationRunsPage({ page: nextPage, pageSize }),
        getApplicationRunsStats()
      ]);
      setRuns(data.runs);
      setTotal(data.total);
      setPage(data.page);
      setStats({
        successCount: statsData.completedCount,
        blockedCount: statsData.failedCount + statsData.cancelledCount + statsData.skippedCount
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const successRate = total > 0 ? Math.round((stats.successCount / total) * 100) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {!loading && runs.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                Total Runs
              </p>
              <p className="font-headline text-2xl font-bold">{total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                Success Rate
              </p>
              <p className="font-headline text-2xl font-bold text-emerald-800 dark:text-emerald-400">
                {successRate}%
              </p>
              <Progress value={successRate} className="h-1.5 mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                Blocked
              </p>
              <p className="font-headline text-2xl font-bold text-red-800 dark:text-red-400">
                {stats.blockedCount}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Application Runs
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh(page)}
              aria-label="Refresh applications list"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="p-12 text-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No application runs yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Run the Autopilot to start applying
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
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map(({ run, job }) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium max-w-[220px] truncate">
                      {job.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {job.companyName}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(run.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(run.status)} className="capitalize">
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <Link
                          to={`/applications/${run.id}`}
                          aria-label={`View run for ${job.title}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
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
    </div>
  );
}
