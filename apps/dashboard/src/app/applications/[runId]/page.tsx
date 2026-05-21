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
import { buildArtifactFileUrl, getApplicationRun } from '@/lib/api';

type ParsedLogDetails = Record<string, unknown> & {
  classification?: string;
  questionLabel?: string;
  blockedRequiredFields?: Array<{ label?: string }>;
  errorMessage?: string;
  event?: string;
};

type MatchAudit = {
  decision?: string;
  score?: number;
  reasons?: string[];
  signals?: string[];
  roleFamily?: { name?: string; matched?: boolean };
  evidence?: { matchedKeywords?: string[]; missingMustHaveKeywords?: string[] };
  seniority?: {
    profile?: string | null;
    minYearsRequired?: number | null;
    softExperienceCap?: boolean;
  };
  llm?: { reviewed?: boolean; pass?: boolean | null; rationale?: string | null };
};

function statusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'success' as const;
    case 'failed':
      return 'destructive' as const;
    case 'running':
    case 'paused':
      return 'warning' as const;
    case 'skipped':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

function authFailureSummary(detail: Awaited<ReturnType<typeof getApplicationRun>>): string | null {
  if (!detail || detail.run.stopReason !== 'auth_failed') {
    return null;
  }

  for (let index = detail.logs.length - 1; index >= 0; index -= 1) {
    const log = detail.logs[index];
    const details = parseLogDetails(log.detailsJson);
    if (details?.event !== 'gmail_poll_auth_failed') {
      continue;
    }

    if (typeof details.errorMessage === 'string' && details.errorMessage.trim().length > 0) {
      return details.errorMessage;
    }
  }

  return null;
}

function statusSummary(
  status: string,
  stopReason: string | null,
  detail?: Awaited<ReturnType<typeof getApplicationRun>> | null
): string {
  if (status === 'paused' && stopReason === 'manual_review_required') {
    return 'Paused because required answers still need manual intervention.';
  }
  if (status === 'paused' && stopReason === 'not_configured') {
    return 'Greenhouse reached email verification, but Gmail OAuth is incomplete.';
  }
  if (status === 'paused' && stopReason === 'submit_button_not_found') {
    return 'Final submit button was not found.';
  }
  if (status === 'paused' && stopReason === 'challenge_not_visible') {
    return 'Greenhouse submit was attempted, but verification challenge did not appear.';
  }
  if (status === 'paused' && stopReason === 'code_input_not_found') {
    return 'Greenhouse verification challenge appeared, but code input was not found.';
  }
  if (status === 'paused' && stopReason === 'timeout') {
    return 'Greenhouse verification email was not found before timeout.';
  }
  if (status === 'paused' && stopReason === 'auth_failed') {
    return (
      authFailureSummary(detail) ??
      'Greenhouse verification email retrieval failed during Gmail OAuth token exchange.'
    );
  }
  if (status === 'paused' && stopReason === 'email_verification_code_entered') {
    return 'Greenhouse verification code was entered and run paused before final resubmit.';
  }
  if (status === 'paused' && stopReason === 'submission_confirmation_missing') {
    return 'Submit clicked, but the post-submit confirmation was not visible.';
  }

  switch (status) {
    case 'paused':
      return 'Automation is paused.';
    case 'skipped':
      return 'Skipped before browser automation started.';
    case 'running':
      return 'Automation is still in progress.';
    case 'completed':
      return 'Application submitted successfully.';
    case 'failed':
      return 'Automation failed before completion.';
    default:
      return 'Queued for automation.';
  }
}

function parseLogDetails(detailsJson: string | null): ParsedLogDetails | null {
  if (!detailsJson) {
    return null;
  }

  try {
    return JSON.parse(detailsJson) as ParsedLogDetails;
  } catch {
    return null;
  }
}

function parseMatchAudit(raw: string | null): MatchAudit | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { signals: parsed.filter((value): value is string => typeof value === 'string') };
    }
    return parsed && typeof parsed === 'object' ? (parsed as MatchAudit) : null;
  } catch {
    return null;
  }
}

function matchDecision(
  prefilterPass: boolean | null,
  audit: MatchAudit | null
): 'pass' | 'reject' | 'unknown' {
  if (prefilterPass != null) {
    return prefilterPass ? 'pass' : 'reject';
  }

  return audit?.decision === 'pass' || audit?.decision === 'reject'
    ? audit.decision
    : 'unknown';
}

function failedAutomationErrorMessage(detail: Awaited<ReturnType<typeof getApplicationRun>>): string | null {
  if (!detail || detail.run.status !== 'failed') {
    return null;
  }

  for (let index = detail.logs.length - 1; index >= 0; index -= 1) {
    const log = detail.logs[index];
    if (log.level !== 'error') {
      continue;
    }

    const parsed = parseLogDetails(log.detailsJson);
    const message = parsed?.errorMessage;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return null;
}

function blockedFieldLabels(detail: Awaited<ReturnType<typeof getApplicationRun>>): string[] {
  if (!detail) {
    return [];
  }

  const labels = new Set<string>();

  for (const log of detail.logs) {
    const details = parseLogDetails(log.detailsJson);
    if (typeof details?.questionLabel === 'string' && String(details.classification).startsWith('blocked_')) {
      labels.add(details.questionLabel);
    }

    if (Array.isArray(details?.blockedRequiredFields)) {
      for (const entry of details.blockedRequiredFields) {
        if (typeof entry?.label === 'string' && entry.label.trim().length > 0) {
          labels.add(entry.label);
        }
      }
    }
  }

  return [...labels];
}

export default async function ApplicationRunDetailPage({
  params
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const detail = await getApplicationRun(runId);
  const blockedLabels = blockedFieldLabels(detail);
  const automationFailureMessage = failedAutomationErrorMessage(detail);
  const matchAudit = parseMatchAudit(detail?.job.prefilterSignalsJson ?? null);
  const decision = matchDecision(detail?.job.prefilterPass ?? null, matchAudit);

  if (!detail) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-8 text-sm text-muted-foreground shadow-sm">
        Application run not found. Return to{' '}
        <Button variant="link" className="h-auto p-0" asChild>
          <Link href="/applications">applications</Link>
        </Button>
        .
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Application Run
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">{detail.job.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {detail.job.companyName} - {detail.job.location || 'Unspecified'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/jobs/${detail.job.id}`}>View job</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={detail.job.sourceUrl} target="_blank" rel="noreferrer">
              Open source posting
            </a>
          </Button>
        </div>

        <dl className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1">
              <Badge variant={statusVariant(detail.run.status)}>{detail.run.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Source
            </dt>
            <dd className="mt-1 capitalize">{detail.job.sourceKind}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Created
            </dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {detail.run.createdAt.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Updated
            </dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {detail.run.updatedAt.toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
          Run State
        </p>
        <h3 className="mt-2 text-xl font-semibold text-foreground">
          {statusSummary(detail.run.status, detail.run.stopReason, detail)}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This read model stays explicit about auto-submit success, blocked outcomes, and skipped
          runs so the operator never has to infer what happened.
        </p>
        {detail.run.stopReason ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Stop reason: {detail.run.stopReason}
          </p>
        ) : null}
        {automationFailureMessage ? (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {automationFailureMessage}
          </p>
        ) : null}
        {detail.run.prefilterReasons.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Prefilter reasons: {detail.run.prefilterReasons.join(', ')}
          </p>
        ) : null}
        {matchAudit ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-white/60 px-3 py-2 text-sm text-muted-foreground">
            <p>
              Match: {decision}
              {detail.job.prefilterScore != null || matchAudit.score != null
                ? `, score ${detail.job.prefilterScore ?? matchAudit.score}`
                : ''}
              {matchAudit.roleFamily?.name ? `, role ${matchAudit.roleFamily.name}` : ''}
              {matchAudit.seniority?.profile ? `, seniority ${matchAudit.seniority.profile}` : ''}
            </p>
            {matchAudit.evidence?.matchedKeywords?.length ? (
              <p className="mt-1">Matched: {matchAudit.evidence.matchedKeywords.join(', ')}</p>
            ) : null}
            {matchAudit.llm?.reviewed ? (
              <p className="mt-1">
                LLM {matchAudit.llm.pass ? 'passed' : 'vetoed'}
                {matchAudit.llm.rationale ? `: ${matchAudit.llm.rationale}` : ''}
              </p>
            ) : null}
          </div>
        ) : null}
        {blockedLabels.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Manual review fields: {blockedLabels.join(', ')}
          </p>
        ) : null}
        {detail.run.status === 'paused' && detail.run.reviewUrl ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The link below is the <span className="font-medium">job posting</span> URL. Greenhouse keeps your
            answers in the <span className="font-medium">automation browser tab</span> until you submit—opening
            this link in Chrome or Edge starts a <span className="font-medium">new</span> session, so the form
            looks empty. With <span className="font-medium">JOBAUTOMATION_APPLICATION_BROWSER_HEADED=1</span>{' '}
                (and without <span className="font-medium">AUTO_CLOSE_BROWSER=1</span>), the Camoufox browser window from
            the run should stay open for you to finish custom questions; use screenshots in the log table if
            you need a record after closing.
          </p>
        ) : null}
        {detail.run.reviewUrl ? (
          <div className="mt-3">
            <Button variant="link" className="h-auto p-0" asChild>
              <a href={detail.run.reviewUrl} target="_blank" rel="noreferrer">
                Open job posting URL
              </a>
            </Button>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Submitted Artifacts
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Resume and cover letter</h3>
        </div>
        {!detail.resumeArtifact && !detail.coverLetterArtifact ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            No submitted resume or cover letter artifacts were linked to this run.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { label: 'Resume', artifact: detail.resumeArtifact },
                { label: 'Cover letter', artifact: detail.coverLetterArtifact }
              ].map(({ label, artifact }) =>
                artifact ? (
                  <TableRow key={artifact.id}>
                    <TableCell>{label}</TableCell>
                    <TableCell>v{artifact.version}</TableCell>
                    <TableCell>{artifact.fileName}</TableCell>
                    <TableCell>
                      <Button variant="link" size="sm" className="h-auto p-0" asChild>
                        <a href={buildArtifactFileUrl(artifact.id)} target="_blank" rel="noreferrer">
                          Open PDF
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : null
              )}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Logs
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Step visibility</h3>
        </div>
        {detail.logs.length === 0 ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            No application step logs were captured for this run.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Level</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="uppercase">{log.level}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p>{log.message}</p>
                      {(() => {
                        const details = parseLogDetails(log.detailsJson);
                        if (!details) {
                          return null;
                        }

                        if (
                          typeof details.questionLabel === 'string' &&
                          typeof details.classification === 'string'
                        ) {
                          return (
                            <p className="text-xs text-muted-foreground">
                              {details.questionLabel} - {details.classification}
                            </p>
                          );
                        }

                        if (Array.isArray(details.blockedRequiredFields) && details.blockedRequiredFields.length > 0) {
                          const labels = details.blockedRequiredFields
                            .map((entry) => entry?.label)
                            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

                          if (labels.length > 0) {
                            return (
                              <p className="text-xs text-muted-foreground">
                                Remaining required fields: {labels.join(', ')}
                              </p>
                            );
                          }
                        }

                        return null;
                      })()}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.createdAt.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Evidence
          </p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Run-scoped artifacts</h3>
        </div>
        {detail.artifacts.length === 0 ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">
            No run-scoped evidence artifacts have been captured for this run yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Kind</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Storage Path</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.artifacts.map((artifact) => (
                <TableRow key={artifact.id}>
                  <TableCell>{artifact.kind}</TableCell>
                  <TableCell className="uppercase text-muted-foreground">{artifact.format}</TableCell>
                  <TableCell>{artifact.fileName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {artifact.storagePath}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <div>
        <Button variant="link" className="h-auto p-0" asChild>
          <Link href="/applications">Return to applications</Link>
        </Button>
      </div>
    </section>
  );
}
