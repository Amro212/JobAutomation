import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { Search, ChevronLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { getDiscoveryRun } from '@renderer/lib/api';
import type { DiscoveryRunDetail } from '@renderer/lib/api';
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
    case 'completed':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'warning';
    default:
      return 'outline';
  }
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function DiscoveryRunDetailPage() {
  const { runId = '' } = useParams();
  const [detail, setDetail] = useState<DiscoveryRunDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getDiscoveryRun(runId);
      setDetail(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load run');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [runId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!detail) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Discovery run not found</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link to="/runs">Back to Runs</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <Button variant="ghost" size="sm" asChild>
        <Link to="/runs" className="flex items-center gap-1.5">
          <ChevronLeft className="h-4 w-4" /> Discovery Runs
        </Link>
      </Button>

      {/* Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-mono">
              Run {detail.run.id.slice(0, 12)}…
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(detail.run.status)} className="capitalize">
                {detail.run.status}
              </Badge>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void load()} aria-label="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Started</p>
              <p className="font-medium mt-0.5">{formatDate(detail.run.startedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Completed</p>
              <p className="font-medium mt-0.5">{formatDate(detail.run.completedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Kind</p>
              <p className="font-medium mt-0.5 capitalize">{detail.run.runKind}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Logs</p>
              <p className="font-medium mt-0.5">{detail.logs.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Source Summaries */}
      {detail.sourceSummaries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Source Summaries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jobs</TableHead>
                  <TableHead>New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.sourceSummaries.map((s, i) => (
                  <TableRow key={`${s.sourceKind}-${i}`}>
                    <TableCell className="text-xs font-medium">{s.label}</TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{s.sourceKind}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(s.status)} className="capitalize text-[10px]">
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{s.jobCount}</TableCell>
                    <TableCell className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                      +{s.newJobCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Logs */}
      {detail.logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Log Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-xs text-muted-foreground space-y-1.5 max-h-64 overflow-y-auto">
              {detail.logs.map((log) => (
                <div key={log.id} className="flex gap-2">
                  <span className="text-primary shrink-0">[{log.level}]</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
