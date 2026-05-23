import { describe, expect, test } from 'vitest';

import type { ApplicantProfile } from '../../../packages/core/src/applicant-profile';
import { minimalAutofillProfileSchema } from '../../../packages/core/src/autofill-profile';
import { generateJobKeywordProfile } from '../../../packages/discovery/src/services/generate-job-keyword-profile';

const baseApplicant = (overrides: Partial<ApplicantProfile> = {}): ApplicantProfile => ({
  id: 'default',
  fullName: 'Test',
  email: 't@example.com',
  phone: '',
  location: '',
  summary: 'Embedded software engineer with C and RTOS experience.',
  reusableContext: '',
  linkedinUrl: '',
  websiteUrl: '',
  baseResumeFileName: '',
  baseResumeTex: '\\section{Skills} C, Rust',
  preferredCountries: [],
  jobKeywordProfile: null,
  jobKeywordProfileGeneratedAt: null,
  autofillProfile: minimalAutofillProfileSchema.parse({}),
  updatedAt: new Date('2026-03-15T10:00:00.000Z'),
  ...overrides
});

describe('generateJobKeywordProfile', () => {
  test('throws not_configured when api key missing', async () => {
    await expect(
      generateJobKeywordProfile({
        applicantProfile: baseApplicant(),
        openRouter: { apiKey: '', baseUrl: 'https://openrouter.example/api/v1', model: 'x' }
      })
    ).rejects.toMatchObject({ code: 'not_configured' });
  });

  test('throws insufficient_context when no text sources', async () => {
    await expect(
      generateJobKeywordProfile({
        applicantProfile: baseApplicant({
          summary: '',
          reusableContext: '',
          baseResumeTex: ''
        }),
        openRouter: { apiKey: 'k', baseUrl: 'https://openrouter.example/api/v1', model: 'x' }
      })
    ).rejects.toMatchObject({ code: 'insufficient_context' });
  });

  test('parses and returns validated structured output', async () => {
    const result = await generateJobKeywordProfile({
      applicantProfile: baseApplicant(),
      openRouter: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.example/api/v1',
        model: 'openrouter/test',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      target_titles: ['embedded engineer', 'software engineer'],
                      positive_keywords: ['c', 'rtos'],
                      negative_keywords: ['sales'],
                      seniority: 'mid'
                    })
                  }
                }
              ]
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      }
    });

    expect(result.seniority).toBe('mid');
    expect(result.negative_keywords).toContain('sales');
    expect(result.target_titles.length).toBeGreaterThan(0);
  });

  test('asks for balanced-recall seniority-aware filter keywords', async () => {
    let systemPrompt = '';
    await generateJobKeywordProfile({
      applicantProfile: baseApplicant({
        summary: 'New graduate software engineer focused on TypeScript and React.'
      }),
      openRouter: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.example/api/v1',
        model: 'openrouter/test',
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(String(init?.body)) as {
            messages: Array<{ role: string; content: string }>;
          };
          systemPrompt = body.messages.find((message) => message.role === 'system')?.content ?? '';

          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      target_titles: ['new graduate software engineer', 'software engineer'],
                      positive_keywords: ['typescript', 'react'],
                      negative_keywords: ['senior', 'staff', 'principal', 'lead', 'manager'],
                      seniority: 'new_grad'
                    })
                  }
                }
              ]
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
      }
    });

    expect(systemPrompt.toLowerCase()).not.toContain('precision-first');
    expect(systemPrompt.toLowerCase()).not.toContain('avoid broad generic keyword bloat');
    expect(systemPrompt.toLowerCase()).toContain('balanced recall');
    expect(systemPrompt.toLowerCase()).toContain('adjacent');
    expect(systemPrompt.toLowerCase()).toContain('credible');
    expect(systemPrompt.toLowerCase()).toContain('synonyms');
    expect(systemPrompt.toLowerCase()).toContain('spelling variants');
    expect(systemPrompt).toContain('15-30');
    expect(systemPrompt).toContain('35-70');
    expect(systemPrompt).toContain('8-15');
    expect(systemPrompt).toContain('20-40');
    expect(systemPrompt.toLowerCase()).toContain('do not invent');
    expect(systemPrompt.toLowerCase()).toContain('seniority-aware');
    expect(systemPrompt.toLowerCase()).toContain('senior');
    expect(systemPrompt.toLowerCase()).toContain('wrong-track');
  });

  test('throws invalid_output when model JSON does not match schema', async () => {
    await expect(
      generateJobKeywordProfile({
        applicantProfile: baseApplicant(),
        openRouter: {
          apiKey: 'test-key',
          baseUrl: 'https://openrouter.example/api/v1',
          model: 'openrouter/test',
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        target_titles: [],
                        positive_keywords: [],
                        negative_keywords: [],
                        seniority: 'principal'
                      })
                    }
                  }
                ]
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
        }
      })
    ).rejects.toMatchObject({ code: 'invalid_output' });
  });
});
