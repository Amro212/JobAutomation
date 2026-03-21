'use server';

import { revalidatePath } from 'next/cache';

import { generateApplicantJobKeywordProfile } from '@/lib/api';

export async function generateJobFilterProfileAction(): Promise<void> {
  await generateApplicantJobKeywordProfile();
  revalidatePath('/setup');
}
