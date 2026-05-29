'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { LocalDateTime } from '@/components/local-datetime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { autopilotStatusLabel, autopilotStatusVariant } from '@/lib/autopilot-status';
import type { AutopilotRunSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

const COMPACT_VISIBLE_COUNT = 5;

function formatCount(label: string, count: number): string {
  return `${count} ${label}`;
}

function batchInspectLabel(entry: AutopilotRunSummary): string {
  const status = autopilotStatusLabel(entry.run.status);
  return `View batch, ${status}, ${entry.run.eligibleJobCount} eligible, ${entry.run.submittedCount} submitted`;
}

type AutopilotBatchesListProps = {
  runs: AutopilotRunSummary[];
};

export function AutopilotBatchesList({ runs }: AutopilotBatchesListProps) {
  const [expanded, setExpanded] = useState(false);
  const hasHiddenRows = runs.length > COMPACT_VISIBLE_COUNT;
  const visibleRuns =
    expanded || !hasHiddenRows ? runs : runs.slice(0, COMPACT_VISIBLE_COUNT);
  const hiddenCount = runs.length - COMPACT_VISIBLE_COUNT;

  return (
    <>
      <div
        className={cn(
          'overflow-y-auto overscroll-contain border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          expanded && hasHiddenRows
            ? 'max-h-[min(28rem,50vh)]'
            : 'max-h-[min(20rem,40vh)]'
        )}
        tabIndex={0}
        role="region"
        aria-labelledby="autopilot-batches-heading"
        aria-describedby={hasHiddenRows ? 'autopilot-batches-compact-hint' : undefined}
      >
        <table className="w-full caption-bottom text-sm">
          <TableCaption className="sr-only">
            Autopilot batch runs with status, outcome counts, discovery link, and last updated time.
          </TableCaption>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Counts</TableHead>
              <TableHead scope="col">Discovery</TableHead>
              <TableHead scope="col">Updated</TableHead>
              <TableHead scope="col">
                <span className="sr-only">Inspect</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRuns.map((entry) => (
              <TableRow key={entry.run.id}>
                <TableCell>
                  <Badge
                    variant={autopilotStatusVariant(entry.run.status)}
                    aria-label={`Status: ${autopilotStatusLabel(entry.run.status)}`}
                  >
                    {autopilotStatusLabel(entry.run.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span aria-label={`${entry.run.eligibleJobCount} eligible, ${entry.run.submittedCount} submitted, ${entry.run.blockedCount} blocked`}>
                    {[
                      formatCount('eligible', entry.run.eligibleJobCount),
                      formatCount('submitted', entry.run.submittedCount),
                      formatCount('blocked', entry.run.blockedCount)
                    ].join(' · ')}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {entry.discoveryRun ? (
                    <Link
                      href={`/runs/${entry.discoveryRun.id}`}
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Open discovery run
                    </Link>
                  ) : (
                    <span aria-label="Discovery run pending">Pending</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <LocalDateTime value={entry.run.updatedAt} />
                </TableCell>
                <TableCell>
                  <Button variant="link" size="sm" className="h-auto p-0" asChild>
                    <Link
                      href={`/autopilot?runId=${entry.run.id}`}
                      aria-label={batchInspectLabel(entry)}
                    >
                      Open batch
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      {hasHiddenRows ? (
        <div
          id="autopilot-batches-compact-hint"
          className="flex items-center justify-between gap-3 border-t px-6 py-3"
        >
          <p className="text-sm text-muted-foreground">
            {expanded
              ? `Showing all ${runs.length} batches.`
              : `Showing ${COMPACT_VISIBLE_COUNT} of ${runs.length} batches.`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <>
                <ChevronUp aria-hidden className="size-4" />
                Show fewer
              </>
            ) : (
              <>
                <ChevronDown aria-hidden className="size-4" />
                Show all {runs.length} batches
              </>
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
