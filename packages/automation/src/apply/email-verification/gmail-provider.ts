import { google } from 'googleapis';

import type { ApplicantEmailVerificationConfig } from '@jobautomation/core';

import type {
  GmailApiClient,
  GmailHeader,
  GmailMessagePart,
  GreenhouseVerificationCodeResult
} from './contracts';

const GREENHOUSE_MESSAGE_QUERY =
  'from:no-reply@us.greenhouse-mail.io subject:"Security code for your application"';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

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

export function extractGreenhouseVerificationCode(body: string): string | null {
  const normalized = stripHtml(body);
  const contextualMatch = normalized.match(
    /(security code|verification code|copy and paste this code|enter the code)[^A-Za-z0-9]{0,120}([A-Za-z0-9]{8})/i
  );
  if (contextualMatch?.[2] && looksLikeVerificationCode(contextualMatch[2])) {
    return contextualMatch[2];
  }

  const matches = Array.from(
    new Set(
      (normalized.match(/\b[A-Za-z0-9]{8}\b/g) ?? []).filter((candidate) =>
        looksLikeVerificationCode(candidate)
      )
    )
  );
  return matches.length === 1 ? matches[0] ?? null : null;
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
}): Promise<GreenhouseVerificationCodeResult> {
  const deadline = Date.now() + (input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const seenMessageIds = new Set<string>();

  while (Date.now() <= deadline) {
    try {
      const listResponse = await input.gmail.users.messages.list({
        userId: input.userEmail || 'me',
        q: GREENHOUSE_MESSAGE_QUERY,
        maxResults: 10
      });
      const messageRefs = listResponse.data?.messages ?? [];
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
        if (Number.isFinite(internalDateMs) && internalDateMs < input.submittedAt.getTime()) {
          continue;
        }

        const subject = headerValue(message?.payload?.headers, 'subject');
        const bodies = collectMessageBodies(message?.payload);
        const codes = Array.from(
          new Set(
            bodies
              .map((body) => extractGreenhouseVerificationCode(body))
              .filter((value): value is string => Boolean(value))
          )
        );

        if (codes.length === 1) {
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
          return {
            status: 'ambiguous',
            message: 'Greenhouse email contained multiple verification code candidates.'
          };
        }
      }

      if (matches.length === 1) {
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
          return {
            status: 'ambiguous',
            message: 'Multiple Greenhouse verification emails produced different codes.'
          };
        }

        const latestMatch = matches
          .slice()
          .sort((left, right) => (right.receivedAt ?? '').localeCompare(left.receivedAt ?? ''))[0];
        if (latestMatch) {
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
      return {
        status: 'auth_failed',
        message: error instanceof Error ? error.message : 'Gmail API request failed.'
      };
    }

    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1, input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS))
    );
  }

  return {
    status: 'timeout',
    message: 'Timed out waiting for Greenhouse verification email.'
  };
}
