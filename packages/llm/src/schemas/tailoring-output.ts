import { z } from 'zod';

export const tailoringResumeEditSchema = z.object({
  search: z.string().trim().min(1).max(240),
  replacement: z.string().trim().min(1).max(400),
  rationale: z.string().trim().min(1).max(400)
});

export const tailoringOutputSchema = z.object({
  resumeKeywords: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  resumeEdits: z.array(tailoringResumeEditSchema).max(8).default([]),
  coverLetterParagraphs: z.array(z.string().trim().min(1).max(1200)).min(2).max(4)
});

export type TailoringOutput = z.infer<typeof tailoringOutputSchema>;

export const tailoringOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['resumeKeywords', 'resumeEdits', 'coverLetterParagraphs'],
  properties: {
    resumeKeywords: {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 60
      },
      maxItems: 12
    },
    resumeEdits: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['search', 'replacement', 'rationale'],
        properties: {
          search: {
            type: 'string',
            minLength: 1,
            maxLength: 240
          },
          replacement: {
            type: 'string',
            minLength: 1,
            maxLength: 400
          },
          rationale: {
            type: 'string',
            minLength: 1,
            maxLength: 400
          }
        }
      }
    },
    coverLetterParagraphs: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 1200
      }
    }
  }
} as const;
