import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { uploadArtifactFile } from '../../../packages/automation/src/apply/file-upload';
import type { ArtifactRecord } from '../../../packages/core/src/artifact';

describe('file upload helper', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  test('uploads the persisted artifact path through a locator target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jobautomation-upload-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'resume.pdf');
    writeFileSync(filePath, Buffer.from('pdf'));

    const artifact: ArtifactRecord = {
      id: 'artifact-1',
      jobId: 'job-1',
      discoveryRunId: null,
      applicantProfileId: 'default',
      applicantProfileUpdatedAt: new Date('2026-03-13T10:00:00.000Z'),
      version: 1,
      kind: 'resume-variant',
      format: 'pdf',
      fileName: 'resume.pdf',
      storagePath: filePath,
      createdAt: new Date('2026-03-13T10:05:00.000Z')
    };
    const locator = {
      setInputFiles: vi.fn().mockResolvedValue(undefined)
    };

    const uploaded = await uploadArtifactFile({
      artifact,
      locator
    });

    expect(uploaded).toBe(true);
    expect(locator.setInputFiles).toHaveBeenCalledWith(filePath);
  });

  test('throws when a required artifact is missing', async () => {
    await expect(
      uploadArtifactFile({
        artifact: null,
        required: true,
        locator: {
          setInputFiles: vi.fn()
        }
      })
    ).rejects.toThrow('Required upload artifact is missing.');
  });
});
