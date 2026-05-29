import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { LocalDateTime } from '@/components/local-datetime';
import { buildArtifactFileUrl, getApplicationRuns } from '@/lib/api';

export default async function SubmittedPage() {
  const runs = await getApplicationRuns();
  const submittedRuns = runs.filter((entry) => entry.run.status === 'completed');

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Submitted
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">Successful submissions</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This tab tracks applications that were confirmed submitted, along with the exact resume,
          cover letter, and posting context used.
        </p>
      </div>

      {submittedRuns.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-sm text-muted-foreground shadow-sm">
          No applications have been confirmed submitted yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Posting</TableHead>
                <TableHead>Resume</TableHead>
                <TableHead>Cover letter</TableHead>
                <TableHead>Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submittedRuns.map((entry) => (
                <TableRow key={entry.run.id}>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      <p className="font-medium">{entry.job.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {entry.job.companyName} · {entry.job.location || 'Unspecified'} ·{' '}
                        <span className="capitalize">{entry.job.sourceKind}</span>
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="success">submitted</Badge>
                  </TableCell>
                  <TableCell className="align-top text-sm text-muted-foreground">
                    <LocalDateTime value={entry.run.completedAt ?? entry.run.updatedAt} />
                  </TableCell>
                  <TableCell className="align-top">
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <a href={entry.job.sourceUrl} target="_blank" rel="noreferrer">
                        Open posting
                      </a>
                    </Button>
                  </TableCell>
                  <TableCell className="align-top">
                    {entry.resumeArtifact ? (
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <a
                          href={buildArtifactFileUrl(entry.resumeArtifact.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open PDF
                        </a>
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">Missing</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {entry.coverLetterArtifact ? (
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <a
                          href={buildArtifactFileUrl(entry.coverLetterArtifact.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open PDF
                        </a>
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">Missing</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <Button variant="link" size="sm" className="h-auto p-0" asChild>
                      <Link href={`/applications/${entry.run.id}`}>Open run</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
