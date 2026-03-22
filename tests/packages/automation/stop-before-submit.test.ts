import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { stopBeforeSubmit } from '../../../packages/automation/src/apply/stop-before-submit';

describe('stop before submit', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  test('captures screenshot and trace evidence, then pauses the run for manual review', async () => {
    const artifactsRootDir = mkdtempSync(join(tmpdir(), 'jobautomation-apply-'));
    tempDirs.push(artifactsRootDir);

    const screenshotBuffer = Buffer.from('fake-png');
    const page = {
      screenshot: vi.fn().mockResolvedValue(screenshotBuffer),
      url: vi
        .fn()
        .mockReturnValue('https://job-boards.greenhouse.io/example/jobs/1/application')
    };
    const finalizeTrace = vi.fn(async (tracePath: string) => {
      await import('node:fs/promises').then(({ mkdir, writeFile }) =>
        mkdir(join(tracePath, '..'), { recursive: true }).then(() =>
          writeFile(tracePath, Buffer.from('fake-trace'))
        )
      );
    });
    const update = vi.fn().mockImplementation(async (_id, patch) => ({
      id: 'run-1',
      jobId: 'job-1',
      siteKey: 'greenhouse',
      status: patch.status,
      currentStep: patch.currentStep,
      stopReason: patch.stopReason,
      prefilterReasons: [],
      reviewUrl: patch.reviewUrl,
      resumeArtifactId: 'resume-1',
      coverLetterArtifactId: 'cover-1',
      createdAt: new Date('2026-03-13T10:10:00.000Z'),
      startedAt: new Date('2026-03-13T10:10:05.000Z'),
      completedAt: new Date('2026-03-13T10:11:00.000Z'),
      updatedAt: new Date('2026-03-13T10:11:00.000Z')
    }));
    const createArtifact = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'artifact-screenshot',
        kind: 'application-screenshot'
      })
      .mockResolvedValueOnce({
        id: 'artifact-trace',
        kind: 'application-trace'
      });
    const createLogEvent = vi.fn().mockResolvedValue(undefined);

    const result = await stopBeforeSubmit({
      run: {
        id: 'run-1',
        jobId: 'job-1',
        siteKey: 'greenhouse',
        status: 'running',
        currentStep: 'review_ready',
        stopReason: null,
        prefilterReasons: [],
        reviewUrl: null,
        resumeArtifactId: 'resume-1',
        coverLetterArtifactId: 'cover-1',
        createdAt: new Date('2026-03-13T10:10:00.000Z'),
        startedAt: new Date('2026-03-13T10:10:05.000Z'),
        completedAt: null,
        updatedAt: new Date('2026-03-13T10:10:30.000Z')
      },
      page,
      step: 'review_ready',
      siteKey: 'greenhouse',
      artifactsRootDir,
      applicationRunsRepository: {
        update
      },
      artifactsRepository: {
        create: createArtifact
      },
      logEventsRepository: {
        create: createLogEvent
      },
      finalizeTrace
    });

    expect(result.status).toBe('paused');
    expect(update).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'paused',
        currentStep: 'review_ready',
        stopReason: 'manual_review_required',
        reviewUrl: 'https://job-boards.greenhouse.io/example/jobs/1/application'
      })
    );
    expect(createArtifact).toHaveBeenCalledTimes(2);
    expect(createLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationRunId: 'run-1',
        level: 'info',
        message: 'Paused before final submit.',
        detailsJson: expect.any(String)
      })
    );

    const screenshotPath = createArtifact.mock.calls[0]?.[0]?.storagePath as string;
    const tracePath = createArtifact.mock.calls[1]?.[0]?.storagePath as string;
    expect(existsSync(screenshotPath)).toBe(true);
    expect(existsSync(tracePath)).toBe(true);
    expect(readFileSync(screenshotPath)).toEqual(screenshotBuffer);
    expect(readFileSync(tracePath)).toEqual(Buffer.from('fake-trace'));
  });
});
