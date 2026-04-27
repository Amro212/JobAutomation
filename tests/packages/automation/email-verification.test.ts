import { describe, expect, test, vi } from 'vitest';

import {
  extractGreenhouseVerificationCode,
  pollGmailForGreenhouseVerificationCode,
} from '../../../packages/automation/src/apply/email-verification/gmail-provider';
import { resolveEmailVerificationConfig } from '../../../packages/automation/src/apply/email-verification/env-config';
import { submitGreenhouseApplicationAndEnterVerificationCode } from '../../../packages/automation/src/apply/email-verification/greenhouse-verification';

const sampleHtml = `
  <p>Hi Amro,</p>
  <p>Copy and paste this code into the security code field on your application:</p>
  <h1>KDpjDhqX</h1>
  <p>After you enter the code, resubmit your application.</p>
`;

describe('greenhouse email verification', () => {
  test('extracts 8-character alphanumeric security code from Greenhouse email body', () => {
    expect(extractGreenhouseVerificationCode(sampleHtml)).toBe('KDpjDhqX');
  });

  test('accepts verification email when internalDate is slightly before submittedAt (Gmail vs click skew)', async () => {
    const submittedAt = new Date('2026-04-22T01:40:25.000Z');
    const gmail = {
      users: {
        messages: {
          list: vi.fn().mockResolvedValue({
            data: {
              messages: [{ id: 'message-skew', threadId: 'thread-1' }]
            }
          }),
          get: vi.fn().mockResolvedValue({
            data: {
              id: 'message-skew',
              threadId: 'thread-1',
              internalDate: String(submittedAt.getTime() - 4_000),
              payload: {
                mimeType: 'text/html',
                body: {
                  data: Buffer.from(sampleHtml, 'utf8')
                    .toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=+$/g, '')
                },
                headers: [
                  { name: 'From', value: 'Greenhouse <no-reply@us.greenhouse-mail.io>' },
                  { name: 'Subject', value: 'Security code for your application to Capco' }
                ]
              }
            }
          })
        }
      }
    };

    await expect(
      pollGmailForGreenhouseVerificationCode({
        gmail,
        userEmail: 'amromousa8@gmail.com',
        submittedAt,
        timeoutMs: 5,
        pollIntervalMs: 1
      })
    ).resolves.toMatchObject({
      status: 'matched',
      code: 'KDpjDhqX',
      messageId: 'message-skew'
    });
  });

  test('polls Gmail messages and returns first matching Greenhouse security code', async () => {
    const gmail = {
      users: {
        messages: {
          list: vi.fn().mockResolvedValue({
            data: {
              messages: [{ id: 'message-1', threadId: 'thread-1' }]
            }
          }),
          get: vi.fn().mockResolvedValue({
            data: {
              id: 'message-1',
              threadId: 'thread-1',
              internalDate: String(new Date('2026-04-22T01:40:25.000Z').getTime()),
              payload: {
                mimeType: 'text/html',
                body: {
                  data: Buffer.from(sampleHtml, 'utf8')
                    .toString('base64')
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=+$/g, '')
                },
                headers: [
                  { name: 'From', value: 'Greenhouse <no-reply@us.greenhouse-mail.io>' },
                  { name: 'Subject', value: 'Security code for your application to Capco' }
                ]
              }
            }
          })
        }
      }
    };

    await expect(
      pollGmailForGreenhouseVerificationCode({
        gmail,
        userEmail: 'amromousa8@gmail.com',
        submittedAt: new Date('2026-04-22T01:40:00.000Z'),
        timeoutMs: 5,
        pollIntervalMs: 1
      })
    ).resolves.toMatchObject({
      status: 'matched',
      code: 'KDpjDhqX',
      messageId: 'message-1'
    });
  });

  test('classifies unauthorized_client as OAuth client and refresh token mismatch', async () => {
    const gmail = {
      users: {
        messages: {
          list: vi.fn().mockRejectedValue(
            Object.assign(new Error('unauthorized_client'), {
              response: {
                status: 401,
                data: {
                  error: 'unauthorized_client',
                  error_description: 'Unauthorized'
                }
              }
            })
          ),
          get: vi.fn()
        }
      }
    };

    await expect(
      pollGmailForGreenhouseVerificationCode({
        gmail,
        userEmail: 'amromousa8@gmail.com',
        submittedAt: new Date('2026-04-22T01:40:00.000Z'),
        timeoutMs: 5,
        pollIntervalMs: 1
      })
    ).resolves.toEqual({
      status: 'auth_failed',
      message:
        'Gmail OAuth rejected this client. The refresh token does not belong to the configured OAuth client ID/secret. Re-generate the refresh token using this exact Google OAuth client.'
    });
  });

  test('clicks Greenhouse submit, enters retrieved code, then stops before final resubmit', async () => {
    const submitButton = {
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
      textContent: vi.fn().mockResolvedValue('Submit Application')
    };
    const codeInput = {
      isVisible: vi.fn().mockResolvedValue(true),
      fill: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      inputValue: vi.fn().mockResolvedValue(''),
      textContent: vi.fn().mockResolvedValue('')
    };
    const segmentedInputs = {
      count: vi.fn().mockResolvedValue(8),
      evaluateAll: vi.fn().mockResolvedValue(['K', 'D', 'p', 'j', 'D', 'h', 'q', 'X'])
    };
    const page = {
      locator: vi.fn((selector: string) => {
        if (selector === 'input[id^="security-input-"]') {
          return segmentedInputs;
        }
        if (selector.includes('submit')) {
          return { first: () => submitButton };
        }
        return { first: () => codeInput };
      }),
      getByRole: vi.fn((_role: string, options?: { name?: RegExp }) => ({
        first: () =>
          options?.name && /submit|apply/i.test(String(options.name))
            ? submitButton
            : codeInput,
      })),
      getByLabel: vi.fn(() => ({ first: () => codeInput })),
      getByText: vi.fn(() => ({ first: () => ({ isVisible: vi.fn().mockResolvedValue(true) }) })),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      keyboard: {
        press: vi.fn().mockResolvedValue(undefined),
        type: vi.fn().mockResolvedValue(undefined)
      }
    };

    await expect(
      submitGreenhouseApplicationAndEnterVerificationCode({
        page: page as never,
        retrieveCode: vi.fn().mockResolvedValue({
          status: 'matched',
          code: 'KDpjDhqX',
          messageId: 'message-1',
          subject: 'Security code for your application to Capco'
        })
      })
    ).resolves.toMatchObject({
      status: 'code_entered',
      codeLength: 8
    });

    expect(submitButton.click).toHaveBeenCalledTimes(1);
    expect(page.keyboard.type).toHaveBeenCalledWith('KDpjDhqX', expect.anything());
  });

  test('merges missing Gmail OAuth fields from env when profile config is enabled but incomplete', () => {
    process.env.JOBAUTOMATION_GREENHOUSE_EMAIL_VERIFICATION_ENABLED = '1';
    process.env.JOBAUTOMATION_GMAIL_USER_EMAIL = 'amromousa8@gmail.com';
    process.env.JOBAUTOMATION_GMAIL_CLIENT_ID = 'env-client-id';
    process.env.JOBAUTOMATION_GMAIL_CLIENT_SECRET = 'env-client-secret';
    process.env.JOBAUTOMATION_GMAIL_REFRESH_TOKEN = 'env-refresh-token';

    expect(
      resolveEmailVerificationConfig({
        enabled: true,
        provider: 'gmail_oauth',
        gmailUserEmail: 'amromousa8@gmail.com',
        gmailClientId: '',
        gmailClientSecret: '',
        gmailRefreshToken: '',
      })
    ).toEqual({
      enabled: true,
      provider: 'gmail_oauth',
      gmailUserEmail: 'amromousa8@gmail.com',
      gmailClientId: 'env-client-id',
      gmailClientSecret: 'env-client-secret',
      gmailRefreshToken: 'env-refresh-token',
    });

    delete process.env.JOBAUTOMATION_GREENHOUSE_EMAIL_VERIFICATION_ENABLED;
    delete process.env.JOBAUTOMATION_GMAIL_USER_EMAIL;
    delete process.env.JOBAUTOMATION_GMAIL_CLIENT_ID;
    delete process.env.JOBAUTOMATION_GMAIL_CLIENT_SECRET;
    delete process.env.JOBAUTOMATION_GMAIL_REFRESH_TOKEN;
  });
});
