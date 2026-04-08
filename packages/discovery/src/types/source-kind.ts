import { z } from 'zod';

export const sourceKindSchema = z.enum([
  'greenhouse',
  'lever',
  'ashby',
  'playwright',
  'manual'
]);

export type SourceKind = z.infer<typeof sourceKindSchema>;
