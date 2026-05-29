'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createAutopilotRun,
  getApplicantProfile,
  saveApplicantProfile,
  updateAutopilotSettings
} from '@/lib/api';
import {
  parseAutopilotPreferredCountries,
  parseAutopilotSettingsFormData
} from '@/lib/autopilot-settings-form';

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function updateAutopilotPreferredCountries(formData: FormData): Promise<void> {
  const preferredCountries = parseAutopilotPreferredCountries(formData);
  const { profile } = await getApplicantProfile();
  if (!profile) {
    return;
  }

  if (stringArraysEqual(profile.preferredCountries, preferredCountries)) {
    return;
  }

  const { updatedAt: _updatedAt, ...rest } = profile;
  await saveApplicantProfile({
    ...rest,
    preferredCountries
  });
}

export async function saveAutopilotSettingsAction(
  formData: FormData
): Promise<void> {
  try {
    const settings = parseAutopilotSettingsFormData(formData);
    await Promise.all([
      updateAutopilotPreferredCountries(formData),
      updateAutopilotSettings(settings)
    ]);
  } catch (error) {
    redirect(
      `/autopilot?error=${encodeURIComponent(
        messageFromError(error, 'Failed to save autopilot defaults.')
      )}`
    );
  }

  revalidatePath('/autopilot');
  redirect(
    `/autopilot?message=${encodeURIComponent('Autopilot settings saved. New launches will use these settings.')}`
  );
}

export async function launchAutopilotAction(formData: FormData): Promise<void> {
  let result: Awaited<ReturnType<typeof createAutopilotRun>>;

  try {
    const settings = parseAutopilotSettingsFormData(formData);
    await updateAutopilotPreferredCountries(formData);
    result = await createAutopilotRun(settings);
  } catch (error) {
    redirect(
      `/autopilot?error=${encodeURIComponent(
        messageFromError(error, 'Failed to launch autopilot.')
      )}`
    );
  }

  revalidatePath('/autopilot');
  revalidatePath('/applications');
  revalidatePath('/submitted');
  redirect(
    `/autopilot?runId=${result.run.id}&message=${encodeURIComponent('Autopilot launched with your selected settings.')}`
  );
}
