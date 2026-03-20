import Link from 'next/link';

import type { DiscoveryRunRecord } from '@jobautomation/core';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatDate(value: Date | null): string {
  if (!value) {
    return 'In progress';
  }

  return value.toLocaleString();
}

function statusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'success' as const;
    case 'failed':
      return 'destructive' as const;
    case 'running':
      return 'warning' as const;
    default:
      return 'secondary' as const;
  }
}

export function RunsTable({ runs }: { runs: DiscoveryRunRecord[] }) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-sm text-muted-foreground shadow-sm">
        No discovery runs have been recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Source</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>New Jobs</TableHead>
            <TableHead>Updated Jobs</TableHead>
            <TableHead>Finished</TableHead>
            <TableHead>Inspect</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="capitalize">{run.sourceKind}</TableCell>
              <TableCell className="capitalize">{run.triggerKind}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(run.status)} className="capitalize">
                  {run.status}
                </Badge>
              </TableCell>
              <TableCell>{run.newJobCount}</TableCell>
              <TableCell>{run.updatedJobCount}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(run.completedAt)}</TableCell>
              <TableCell>
                <Button variant="link" size="sm" className="h-auto p-0" asChild>
                  <Link href={`/runs/${run.id}`}>Open run</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
