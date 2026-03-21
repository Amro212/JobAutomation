import type { ReactNode } from 'react';
import Link from 'next/link';

import type { JobListItem } from '@jobautomation/core';

import { Badge } from '@/components/ui/badge';
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
  emptyMessage = 'No jobs have been discovered yet.',
  footer
}: {
  jobs: JobListItem[];
  emptyMessage?: string;
  footer?: ReactNode;
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
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[150px]">Company</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-[105px]">Source</TableHead>
            <TableHead className="w-[min(320px,32%)] min-w-[200px]">
              Location
            </TableHead>
            <TableHead className="w-[85px]">Remote</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="truncate">{job.companyName}</TableCell>
              <TableCell className="overflow-hidden font-medium">
                <Link
                  href={`/jobs/${job.id}`}
                  className="block truncate hover:underline underline-offset-4"
                >
                  {job.title}
                </Link>
              </TableCell>
              <TableCell className="capitalize">{job.sourceKind}</TableCell>
              <TableCell className="whitespace-normal break-words align-top text-left">
                {job.location || 'Unspecified'}
              </TableCell>
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
      {footer}
    </div>
  );
}
