import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Search, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { getDiscoveryRuns } from '@renderer/lib/api';
import type { DiscoveryRunRecord } from '@jobautomation/core';
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

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function RunsPage() {
  const [runs, setRuns] = useState<DiscoveryRunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getDiscoveryRuns();
      setRuns(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load discovery runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Discovery Runs
            {!loading && (
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({runs.length})
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            aria-label="Refresh discovery runs"
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
        ) : runs.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No discovery runs yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Run the Autopilot to trigger a discovery pass
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link to="/autopilot">Go to Autopilot</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run ID</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {run.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(run.startedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(run.completedAt ?? null)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run.status)} className="capitalize">
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <Link to={`/runs/${run.id}`} aria-label={`View run ${run.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
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
