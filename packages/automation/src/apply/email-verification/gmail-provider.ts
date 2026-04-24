import { google } from 'googleapis';

import type { ApplicantEmailVerificationConfig } from '@jobautomation/core';

import type {
  EmailVerificationDebugLog,
  GmailApiClient,
  GmailHeader,
  GmailMessagePart,
  GreenhouseVerificationCodeResult
} from './contracts';

const GREENHOUSE_MESSAGE_QUERY =
  'from:no-reply@us.greenhouse-mail.io subject:"Security code for your application"';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
/** Greenhouse / Gmail: message internalDate can be slightly before the submit click (send path, Date header). */
const GMAIL_INTERNAL_DATE_SLACK_MS = 120_000;
const UNAUTHORIZED_CLIENT_MESSAGE =
  'Gmail OAuth rejected this client. The refresh token does not belong to the configured OAuth client ID/secret. Re-generate the refresh token using this exact Google OAuth client.';

function maskCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }

  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function previewText(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

async function emitDebugLog(
  logger: EmailVerificationDebugLog | undefined,
  event: string,
  details?: Record<string, unknown>
): Promise<void> {
  await logger?.(event, details);
}

function parseGoogleApiError(error: unknown): {
  message: string;
  errorCode: string | null;
  errorDescription: string | null;
  status: number | null;
} {
  const fallbackMessage =
    error instanceof Error ? error.message : 'Gmail API request failed.';
  if (!error || typeof error !== 'object') {
    return {
      message: fallbackMessage,
      errorCode: null,
      errorDescription: null,
      status: null
    };
  }

  const response = 'response' in error ? error.response : null;
  const responseObject =
    response && typeof response === 'object'
      ? (response as {
          status?: unknown;
          data?: {
            error?: unknown;
            error_description?: unknown;
          } | null;
        })
      : null;

  const errorCode =
    typeof responseObject?.data?.error === 'string' ? responseObject.data.error : null;
  const errorDescription =
    typeof responseObject?.data?.error_description === 'string'
      ? responseObject.data.error_description
      : null;
  const status =
    typeof responseObject?.status === 'number' ? responseObject.status : null;

  return {
    message: fallbackMessage,
    errorCode,
    errorDescription,
    status
  };
}

function classifyGoogleApiError(error: unknown): {
  message: string;
  errorCode: string | null;
  errorDescription: string | null;
  status: number | null;
} {
  const parsed = parseGoogleApiError(error);
  if (parsed.errorCode === 'unauthorized_client') {
    return {
      ...parsed,
      message: UNAUTHORIZED_CLIENT_MESSAGE
    };
  }

  return parsed;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeVerificationCode(value: string): boolean {
  return (
    /^\d{8}$/.test(value) ||
    /[A-Z]/.test(value) && /[a-z]/.test(value) ||
    /[A-Za-z]/.test(value) && /\d/.test(value)
  );
}

function collectMessageBodies(part: GmailMessagePart | null | undefined): string[] {
  if (!part) {
    return [];
  }

  const bodies: string[] = [];
  const raw = part.body?.data ? decodeBase64Url(part.body.data) : '';
  if (raw.trim()) {
    bodies.push(part.mimeType?.includes('html') ? stripHtml(raw) : raw.trim());
  }

  for (const child of part.parts ?? []) {
    bodies.push(...collectMessageBodies(child));
  }

  return bodies;
}

function headerValue(headers: GmailHeader[] | null | undefined, name: string): string {
  const match = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return match?.value?.trim() ?? '';
}

function analyzeGreenhouseVerificationBody(body: string): {
  normalized: string;
  contextualCandidate: string | null;
  candidates: string[];
  selectedCode: string | null;
} {
  const normalized = stripHtml(body);
  const contextualMatch = normalized.match(
    /(security code|verification code|copy and paste this code|enter the code)[^A-Za-z0-9]{0,120}([A-Za-z0-9]{8})/i
  );
  const contextualCandidate =
    contextualMatch?.[2] && looksLikeVerificationCode(contextualMatch[2])
      ? contextualMatch[2]
      : null;
  if (contextualCandidate) {
    return {
      normalized,
      contextualCandidate,
      candidates: [contextualCandidate],
      selectedCode: contextualCandidate
    };
  }

  const matches = Array.from(
    new Set(
      (normalized.match(/\b[A-Za-z0-9]{8}\b/g) ?? []).filter((candidate) =>
        looksLikeVerificationCode(candidate)
      )
    )
  );
  return {
    normalized,
    contextualCandidate: null,
    candidates: matches,
    selectedCode: matches.length === 1 ? matches[0] ?? null : null
  };
}

export function extractGreenhouseVerificationCode(body: string): string | null {
  return analyzeGreenhouseVerificationBody(body).selectedCode;
}

export function createGmailApiClient(
  config: ApplicantEmailVerificationConfig
): GmailApiClient {
  const oauth2 = new google.auth.OAuth2(
    config.gmailClientId,
    config.gmailClientSecret
  );
  oauth2.setCredentials({
    refresh_token: config.gmailRefreshToken
  });

  return google.gmail({
    version: 'v1',
    auth: oauth2
  }) as unknown as GmailApiClient;
}

export async function pollGmailForGreenhouseVerificationCode(input: {
  gmail: GmailApiClient;
  userEmail: string;
  submittedAt: Date;
  timeoutMs?: number;
  pollIntervalMs?: number;
  debugLog?: EmailVerificationDebugLog;
}): Promise<GreenhouseVerificationCodeResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = Math.max(1, input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  const seenMessageIds = new Set<string>();
  let attempt = 0;

  await emitDebugLog(input.debugLog, 'gmail_poll_started', {
    userEmail: input.userEmail || 'me',
    submittedAt: input.submittedAt.toISOString(),
    timeoutMs,
    pollIntervalMs,
    query: GREENHOUSE_MESSAGE_QUERY
  });

  while (Date.now() <= deadline) {
    attempt += 1;
    try {
      const listResponse = await input.gmail.users.messages.list({
        userId: input.userEmail || 'me',
        q: GREENHOUSE_MESSAGE_QUERY,
        maxResults: 10
      });
      const messageRefs = listResponse.data?.messages ?? [];
      await emitDebugLog(input.debugLog, 'gmail_list_completed', {
        attempt,
        messageRefCount: messageRefs.length,
        messageIds: messageRefs.map((message) => message.id?.trim() || null).slice(0, 10)
      });
      const matches: Array<{
        code: string;
        messageId: string;
        threadId: string | null;
        subject: string;
        receivedAt: string | null;
      }> = [];

      for (const messageRef of messageRefs) {
        const messageId = messageRef.id?.trim();
        if (!messageId || seenMessageIds.has(messageId)) {
          continue;
        }
        seenMessageIds.add(messageId);

        const messageResponse = await input.gmail.users.messages.get({
          userId: input.userEmail || 'me',
          id: messageId,
          format: 'full'
        });
        const message = messageResponse.data;
        const internalDateMs = Number(message?.internalDate ?? 0);
        const subject = headerValue(message?.payload?.headers, 'subject');
        const from = headerValue(message?.payload?.headers, 'from');
        const minAcceptableInternalMs = input.submittedAt.getTime() - GMAIL_INTERNAL_DATE_SLACK_MS;
        await emitDebugLog(input.debugLog, 'gmail_message_loaded', {
          attempt,
          messageId,
          threadId: message?.threadId?.trim() || null,
          subject,
          from,
          internalDate:
            Number.isFinite(internalDateMs) && internalDateMs > 0
              ? new Date(internalDateMs).toISOString()
              : null,
          submittedAt: input.submittedAt.toISOString(),
          minAcceptableInternalMs: new Date(minAcceptableInternalMs).toISOString(),
          isOlderThanAcceptanceWindow:
            Number.isFinite(internalDateMs) && internalDateMs < minAcceptableInternalMs,
          payloadMimeType: message?.payload?.mimeType ?? null,
          partMimeTypes: (message?.payload?.parts ?? []).map((part) => part.mimeType ?? null)
        });
        if (Number.isFinite(internalDateMs) && internalDateMs < minAcceptableInternalMs) {
          await emitDebugLog(input.debugLog, 'gmail_message_skipped_old', {
            attempt,
            messageId,
            subject
          });
          continue;
        }

        const bodies = collectMessageBodies(message?.payload);
        const bodyAnalyses = bodies.map((body, index) => {
          const analysis = analyzeGreenhouseVerificationBody(body);
          return {
            index,
            bodyLength: body.length,
            preview: previewText(analysis.normalized),
            contextualCandidate: maskCode(analysis.contextualCandidate),
            candidates: analysis.candidates.map((candidate) => maskCode(candidate)),
            selectedCode: maskCode(analysis.selectedCode)
          };
        });
        await emitDebugLog(input.debugLog, 'gmail_message_parsed', {
          attempt,
          messageId,
          subject,
          bodyCount: bodies.length,
          bodyAnalyses
        });
        const codes = Array.from(
          new Set(
            bodyAnalyses
              .map((analysis, index) => analyzeGreenhouseVerificationBody(bodies[index] ?? '').selectedCode)
              .filter((value): value is string => Boolean(value))
          )
        );

        if (codes.length === 1) {
          await emitDebugLog(input.debugLog, 'gmail_message_match_found', {
            attempt,
            messageId,
            subject,
            code: maskCode(codes[0])
          });
          matches.push({
            code: codes[0]!,
            messageId,
            threadId: message?.threadId?.trim() || null,
            subject,
            receivedAt:
              Number.isFinite(internalDateMs) && internalDateMs > 0
                ? new Date(internalDateMs).toISOString()
                : null
          });
        }

        if (codes.length > 1) {
          await emitDebugLog(input.debugLog, 'gmail_message_ambiguous', {
            attempt,
            messageId,
            subject,
            codes: codes.map((code) => maskCode(code))
          });
          return {
            status: 'ambiguous',
            message: 'Greenhouse email contained multiple verification code candidates.'
          };
        }
      }

      if (matches.length === 1) {
        await emitDebugLog(input.debugLog, 'gmail_poll_matched_single', {
          attempt,
          messageId: matches[0]!.messageId,
          subject: matches[0]!.subject,
          code: maskCode(matches[0]!.code)
        });
        return {
          status: 'matched',
          code: matches[0]!.code,
          messageId: matches[0]!.messageId,
          threadId: matches[0]!.threadId,
          subject: matches[0]!.subject,
          receivedAt: matches[0]!.receivedAt
        };
      }

      if (matches.length > 1) {
        const uniqueCodes = Array.from(new Set(matches.map((match) => match.code)));
        if (uniqueCodes.length > 1) {
          await emitDebugLog(input.debugLog, 'gmail_poll_ambiguous_multiple_messages', {
            attempt,
            messageIds: matches.map((match) => match.messageId),
            codes: uniqueCodes.map((code) => maskCode(code))
          });
          return {
            status: 'ambiguous',
            message: 'Multiple Greenhouse verification emails produced different codes.'
          };
        }

        const latestMatch = matches
          .slice()
          .sort((left, right) => (right.receivedAt ?? '').localeCompare(left.receivedAt ?? ''))[0];
        if (latestMatch) {
          await emitDebugLog(input.debugLog, 'gmail_poll_matched_latest', {
            attempt,
            messageId: latestMatch.messageId,
            subject: latestMatch.subject,
            code: maskCode(latestMatch.code),
            receivedAt: latestMatch.receivedAt
          });
          return {
            status: 'matched',
            code: latestMatch.code,
            messageId: latestMatch.messageId,
            threadId: latestMatch.threadId,
            subject: latestMatch.subject,
            receivedAt: latestMatch.receivedAt
          };
        }
      }
    } catch (error) {
      const classifiedError = classifyGoogleApiError(error);
      await emitDebugLog(input.debugLog, 'gmail_poll_auth_failed', {
        attempt,
        errorMessage: classifiedError.message,
        errorCode: classifiedError.errorCode,
        errorDescription: classifiedError.errorDescription,
        status: classifiedError.status
      });
      return {
        status: 'auth_failed',
        message: classifiedError.message
      };
    }

    await emitDebugLog(input.debugLog, 'gmail_poll_waiting_next_attempt', {
      attempt,
      seenMessageCount: seenMessageIds.size,
      pollIntervalMs
    });
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  await emitDebugLog(input.debugLog, 'gmail_poll_timeout', {
    attempts: attempt,
    seenMessageCount: seenMessageIds.size,
    submittedAt: input.submittedAt.toISOString(),
    timeoutMs
  });
  return {
    status: 'timeout',
    message: 'Timed out waiting for Greenhouse verification email.'
  };
}
