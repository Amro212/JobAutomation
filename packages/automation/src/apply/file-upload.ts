import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

import type { ArtifactRecord } from '@jobautomation/core';
import type { Locator, Page } from 'playwright';

async function assertReadable(path: string): Promise<void> {
  await access(path, constants.R_OK);
}

export async function uploadArtifactFile(input: {
  artifact: ArtifactRecord | null;
  locator?: Locator;
  page?: Page;
  selector?: string;
  required?: boolean;
}): Promise<boolean> {
  if (!input.artifact) {
    if (input.required) {
      throw new Error('Required upload artifact is missing.');
    }
    return false;
  }

  await assertReadable(input.artifact.storagePath);

  if (input.locator) {
    await input.locator.setInputFiles(input.artifact.storagePath);
    return true;
  }

  if (input.page && input.selector) {
    await input.page.setInputFiles(input.selector, input.artifact.storagePath);
    return true;
  }

  throw new Error('Upload target is missing. Provide a locator or a page + selector.');
}
