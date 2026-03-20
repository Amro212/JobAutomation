import Link from 'next/link';

import type { JobRecord } from '@jobautomation/core';

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

function statusVariant(status: string) {
  switch (status) {
    case 'shortlisted':
      return 'success' as const;
    case 'reviewing':
      return 'warning' as const;
    case 'archived':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

export function JobsTable({
  jobs,
  emptyMessage = 'No jobs have been discovered yet.'
}: {
  jobs: JobRecord[];
  emptyMessage?: string;
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-sm text-muted-foreground shadow-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Company</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Remote</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>{job.companyName}</TableCell>
              <TableCell className="font-medium">
                <Button variant="link" className="h-auto p-0 text-foreground" asChild>
                  <Link href={`/jobs/${job.id}`}>{job.title}</Link>
                </Button>
              </TableCell>
              <TableCell className="capitalize">{job.sourceKind}</TableCell>
              <TableCell>{job.location || 'Unspecified'}</TableCell>
              <TableCell className="capitalize">{job.remoteType}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(job.status)} className="capitalize">
                  {job.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
