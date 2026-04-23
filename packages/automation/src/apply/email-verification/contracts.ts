import type { ApplicantEmailVerificationConfig } from '@jobautomation/core';

export type GreenhouseVerificationCodeMatch = {
  status: 'matched';
  code: string;
  messageId: string;
  threadId: string | null;
  subject: string;
  receivedAt: string | null;
};

export type GreenhouseVerificationCodeMiss = {
  status:
    | 'timeout'
    | 'not_configured'
    | 'auth_failed'
    | 'ambiguous'
    | 'challenge_not_visible'
    | 'code_input_not_found'
    | 'submit_button_not_found';
  message: string;
};

export type GreenhouseVerificationCodeResult =
  | GreenhouseVerificationCodeMatch
  | GreenhouseVerificationCodeMiss;

export type GmailMessageListResponse = {
  data?: {
    messages?: Array<{
      id?: string | null;
      threadId?: string | null;
    }>;
  };
};

export type GmailHeader = {
  name?: string | null;
  value?: string | null;
};

export type GmailMessagePart = {
  mimeType?: string | null;
  body?: {
    data?: string | null;
  } | null;
  headers?: GmailHeader[] | null;
  parts?: GmailMessagePart[] | null;
};

export type GmailMessageGetResponse = {
  data?: {
    id?: string | null;
    threadId?: string | null;
    internalDate?: string | null;
    payload?: GmailMessagePart | null;
  };
};

export type GmailMessagesApi = {
  list: (input: {
    userId: string;
    q?: string;
    maxResults?: number;
  }) => Promise<GmailMessageListResponse>;
  get: (input: {
    userId: string;
    id: string;
    format?: string;
  }) => Promise<GmailMessageGetResponse>;
};

export type GmailApiClient = {
  users: {
    messages: GmailMessagesApi;
  };
};

export function isConfiguredForGmailVerification(
  config: ApplicantEmailVerificationConfig | undefined | null
): config is ApplicantEmailVerificationConfig {
  return Boolean(
    config?.enabled &&
      config.provider === 'gmail_oauth' &&
      config.gmailUserEmail.trim() &&
      config.gmailClientId.trim() &&
      config.gmailClientSecret.trim() &&
      config.gmailRefreshToken.trim()
  );
}
