import { z } from 'zod';

export const tailoringResumeEditSchema = z.object({
  search: z.string().trim().min(1).max(500),
  replacement: z.string().trim().min(1).max(600),
  rationale: z.string().trim().max(400).optional().default('')
});

const lenientResumeEditSchema = z.object({
  search: z.string().trim().max(500).default(''),
  replacement: z.string().trim().max(600).default(''),
  rationale: z.string().trim().max(400).optional().default('')
});

export const tailoringOutputSchema = z.object({
  resumeKeywords: z
    .array(z.string().trim().min(1).max(60))
    .default([])
    .transform((arr) => arr.slice(0, 15)),
  resumeEdits: z
    .array(lenientResumeEditSchema)
    .default([])
    .transform((arr) =>
      arr
        .filter((edit) => edit.search.length > 0 && edit.replacement.length > 0)
        .slice(0, 12)
    )
});

export type TailoringOutput = z.infer<typeof tailoringOutputSchema>;

export const tailoringOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['resumeKeywords', 'resumeEdits'],
  properties: {
    resumeKeywords: {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 60
      },
    },
    resumeEdits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['search', 'replacement'],
        properties: {
          search: {
            type: 'string',
            minLength: 1,
            maxLength: 500
          },
          replacement: {
            type: 'string',
            minLength: 1,
            maxLength: 600
          },
          rationale: {
            type: 'string',
            maxLength: 400
          }
        }
      }
    }
  }
} as const;

export const coverLetterOutputSchema = z.object({
  coverLetterParagraphs: z.array(z.string().trim().min(1).max(2000)).min(2).max(8)
});

export type CoverLetterOutput = z.infer<typeof coverLetterOutputSchema>;

export const coverLetterOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['coverLetterParagraphs'],
  properties: {
    coverLetterParagraphs: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 2000
      }
    }
  }
} as const;
