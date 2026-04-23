import { describe, expect, test, vi } from 'vitest';

import {
  extractGreenhouseVerificationCode,
  pollGmailForGreenhouseVerificationCode,
} from '../../../packages/automation/src/apply/email-verification/gmail-provider';
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
    const page = {
      locator: vi.fn((selector: string) => {
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
});
