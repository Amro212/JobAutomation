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

async function updateAutopilotPreferredCountries(formData: FormData): Promise<void> {
  const preferredCountries = parseAutopilotPreferredCountries(formData);
  const { profile } = await getApplicantProfile();
  if (!profile) {
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
    await updateAutopilotPreferredCountries(formData);
    await updateAutopilotSettings(parseAutopilotSettingsFormData(formData));
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
    await updateAutopilotPreferredCountries(formData);
    result = await createAutopilotRun(parseAutopilotSettingsFormData(formData));
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
