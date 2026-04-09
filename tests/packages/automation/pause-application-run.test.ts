import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { pauseApplicationRun } from '../../../packages/automation/src/apply/pause-application-run';

describe('pause application run', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  test('persists a readable JSON artifact alongside the pause evidence', async () => {
    const artifactsRootDir = mkdtempSync(join(tmpdir(), 'jobautomation-pause-'));
    tempDirs.push(artifactsRootDir);

    const screenshotBuffer = Buffer.from('fake-png');
    const page = {
      screenshot: vi.fn().mockResolvedValue(screenshotBuffer),
      url: vi.fn().mockReturnValue('https://job-boards.greenhouse.io/example/jobs/1/application')
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
      })
      .mockResolvedValueOnce({
        id: 'artifact-json',
        kind: 'application-evidence-json'
      });
    const createLogEvent = vi.fn().mockResolvedValue(undefined);

    const result = await pauseApplicationRun({
      run: {
        id: 'run-1',
        jobId: 'job-1',
        siteKey: 'greenhouse',
        status: 'running',
        currentStep: 'fill_plan_ready',
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
      step: 'fill_plan_ready',
      siteKey: 'greenhouse',
      message: 'Paused after generating the fill plan.',
      artifactsRootDir,
      details: {
        promptVersion: 'stage4-fill-plan-v1',
        rawResponseLength: 123,
        responseJson: {
          items: [
            {
              fieldId: 'first_name',
              action: 'fill',
              value: 'Taylor',
              confidence: 0.99,
              skipReason: ''
            }
          ]
        },
        fillPlan: [
          {
            fieldId: 'first_name',
            action: 'fill',
            value: 'Taylor',
            confidence: 0.99,
            skipReason: ''
          }
        ]
      },
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
    expect(createArtifact).toHaveBeenCalledTimes(3);

    const jsonPath = createArtifact.mock.calls[2]?.[0]?.storagePath as string;
    expect(existsSync(jsonPath)).toBe(true);

    const jsonContents = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, unknown>;
    expect(jsonContents).toMatchObject({
      applicationRunId: 'run-1',
      siteKey: 'greenhouse',
      step: 'fill_plan_ready',
      pageUrl: 'https://job-boards.greenhouse.io/example/jobs/1/application',
      promptVersion: 'stage4-fill-plan-v1',
      rawResponseLength: 123,
      responseJson: {
        items: [
          {
            fieldId: 'first_name',
            action: 'fill',
            value: 'Taylor',
            confidence: 0.99,
            skipReason: ''
          }
        ]
      }
    });
    expect(jsonContents).toMatchObject({
      fillPlan: [
        {
          fieldId: 'first_name',
          action: 'fill',
          value: 'Taylor',
          confidence: 0.99,
          skipReason: ''
        }
      ]
    });

    expect(createLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationRunId: 'run-1',
        level: 'info',
        message: 'Paused after generating the fill plan.',
        detailsJson: expect.any(String)
      })
    );

    expect(readFileSync(jsonPath, 'utf8')).toContain('responseJson');
    expect(readFileSync(jsonPath, 'utf8')).toContain('fillPlan');
  });
});
