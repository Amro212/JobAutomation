import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { BatchDetailHeading } from '@/components/autopilot/batch-detail-focus';
import { LocalDateTime } from '@/components/local-datetime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { autopilotStatusLabel, autopilotStatusVariant } from '@/lib/autopilot-status';
import type { AutopilotRunDetail } from '@/lib/api';

type AutopilotBatchDetailProps = {
  selectedRun: AutopilotRunDetail;
};

export function AutopilotBatchDetail({ selectedRun }: AutopilotBatchDetailProps) {
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 h-auto gap-2 px-2 py-1.5" asChild>
            <Link href="/autopilot">
              <ArrowLeft aria-hidden className="size-4" />
              Back to batches
            </Link>
          </Button>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Batch detail
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <BatchDetailHeading>Autopilot batch</BatchDetailHeading>
            <Badge
              variant={autopilotStatusVariant(selectedRun.run.status)}
              aria-label={`Status: ${autopilotStatusLabel(selectedRun.run.status)}`}
            >
              {autopilotStatusLabel(selectedRun.run.status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Current step: {selectedRun.run.currentStep}
          </p>
          <p className="text-sm text-muted-foreground">
            Last updated{' '}
            <LocalDateTime value={selectedRun.run.updatedAt} />
          </p>
        </div>
        {selectedRun.discoveryRun ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/runs/${selectedRun.discoveryRun.id}`}>Open discovery run</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['Discovered', selectedRun.run.discoveredJobCount],
          ['Eligible', selectedRun.run.eligibleJobCount],
          ['Skipped', selectedRun.run.skippedJobCount],
          ['Submitted', selectedRun.run.submittedCount],
          ['Blocked', selectedRun.run.blockedCount],
          ['Failed', selectedRun.run.failedCount]
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 font-medium">{value}</p>
          </div>
        ))}
      </div>

      {selectedRun.run.errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {selectedRun.run.errorMessage}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border">
        <div className="border-b px-6 py-4">
          <h4 id="batch-child-runs-heading" className="text-lg font-semibold text-foreground">
            Child application runs
          </h4>
        </div>
        {selectedRun.applications.length === 0 ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            No child application runs have been recorded for this batch yet.
          </div>
        ) : (
          <div
            className="max-h-[min(24rem,45vh)] overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            tabIndex={0}
            role="region"
            aria-labelledby="batch-child-runs-heading"
          >
            <Table>
              <TableCaption className="sr-only">
                Application runs launched by this autopilot batch.
              </TableCaption>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col">Job</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Artifacts</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Inspect</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRun.applications.map((entry) => (
                  <TableRow key={entry.run.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{entry.job.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {entry.job.companyName} · {entry.job.location || 'Unspecified'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={autopilotStatusVariant(entry.run.status)}
                        aria-label={`Status: ${autopilotStatusLabel(entry.run.status)}`}
                      >
                        {autopilotStatusLabel(entry.run.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[
                        entry.resumeArtifact ? 'Resume' : null,
                        entry.coverLetterArtifact ? 'Cover letter' : null
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'None linked'}
                    </TableCell>
                    <TableCell>
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <Link
                          href={`/applications/${entry.run.id}`}
                          aria-label={`Open application run for ${entry.job.title} at ${entry.job.companyName}`}
                        >
                          Open run
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
