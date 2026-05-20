'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createAutopilotRun, updateAutopilotSettings } from '@/lib/api';
import { parseAutopilotSettingsFormData } from '@/lib/autopilot-settings-form';

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function saveAutopilotSettingsAction(
  formData: FormData
): Promise<void> {
  try {
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
