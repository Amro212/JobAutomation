import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, describe, expect, test } from 'vitest';

import {
  ApplicantProfileRepository,
  ArtifactsRepository,
  JobsRepository,
  createDatabaseClient
} from '../../../packages/db/src';
import {
  generateCoverLetterVariant,
  generateResumeVariant
} from '../../../packages/documents/src';

const migrationsFolder = fileURLToPath(
  new URL('../../../packages/db/drizzle', import.meta.url)
);
const createdPaths: string[] = [];
const trackedClients: Array<{ close: () => Promise<void> | void }> = [];

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  createdPaths.push(path);
  return path;
}

function createTempOutputRoot(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}/output`, import.meta.url)
  );
  mkdirSync(path, { recursive: true });
  createdPaths.push(path);
  return path;
}

afterEach(async () => {
  for (const client of trackedClients.splice(0)) {
    await client.close();
  }

  for (const path of createdPaths.splice(0)) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup errors.
    }
  }
});

describe('tailoring', () => {
  test('preserves the uploaded resume structure and stores versioned artifacts', async () => {
    const stubPath = fileURLToPath(
      new URL('../../fixtures/documents/tectonic-stub.mjs', import.meta.url)
    );
    const originalCommand = process.env.JOB_AUTOMATION_TECTONIC_COMMAND;
    const originalArgs = process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON;

    try {
      process.env.JOB_AUTOMATION_TECTONIC_COMMAND = 'node';
      process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON = JSON.stringify([stubPath]);

      const dbPath = createTestDatabasePath();
      const outputRoot = createTempOutputRoot();
      const db = createDatabaseClient(dbPath);
      trackedClients.push(db.$client);
      await migrate(db, { migrationsFolder });

      const applicantProfilesRepository = new ApplicantProfileRepository(db);
      const jobsRepository = new JobsRepository(db);
      const artifactsRepository = new ArtifactsRepository(db);

      const profile = await applicantProfilesRepository.save({
        id: 'default',
        fullName: 'Taylor Example',
        email: 'taylor@example.com',
        phone: '555-0100',
        location: 'Toronto, ON',
        summary: 'TypeScript engineer focused on local-first automation.',
        reusableContext: 'Prefers inspectable pipelines and careful release hygiene.',
        linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
        websiteUrl: 'https://example.com',
        baseResumeFileName: 'resume.tex',
        preferredCountries: [],
        baseResumeTex: String.raw`\documentclass{article}
\begin{document}
\section{Experience}
\begin{itemize}
\item Built TypeScript automation systems for internal tooling.
\item Designed operational workflows for local-first release work.
\end{itemize}
\end{document}`
      });

      const job = await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-123',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/123',
        companyName: 'Example Corp',
        title: 'Senior Platform Engineer',
        location: 'Remote - Canada',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: '$170k-$190k CAD',
        descriptionText: 'Build the local-first platform automation pipeline.',
        rawPayload: '{"id":"job-123"}',
        discoveryRunId: null,
        status: 'shortlisted',
        discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
        updatedAt: new Date('2026-03-15T09:00:00.000Z')
      });

      const resumeArtifacts = await generateResumeVariant({
        job,
        applicantProfile: profile,
        artifactsRepository,
        outputRoot
      });
      const coverLetterArtifacts = await generateCoverLetterVariant({
        job,
        applicantProfile: profile,
        artifactsRepository,
        outputRoot
      });
      const persistedArtifacts = await artifactsRepository.listByJob(job.id);

      const resumeTexPath = join(outputRoot, 'artifacts', job.id, 'resume-variant', 'v1', 'resume.tex');
      const coverLetterTexPath = join(
        outputRoot,
        'artifacts',
        job.id,
        'cover-letter',
        'v1',
        'cover-letter.tex'
      );

      expect(resumeArtifacts.some((artifact) => artifact.format === 'pdf')).toBe(true);
      expect(coverLetterArtifacts.some((artifact) => artifact.format === 'pdf')).toBe(true);
      expect(persistedArtifacts).toHaveLength(4);
      expect(persistedArtifacts[0]?.version).toBe(1);
      expect(persistedArtifacts[0]?.applicantProfileId).toBe('default');
      expect(readFileSync(resumeTexPath, 'utf8')).toContain('Built TypeScript automation systems');
      expect(readFileSync(resumeTexPath, 'utf8')).toContain('\\documentclass{article}');
      const coverLetterTex = readFileSync(coverLetterTexPath, 'utf8');
      expect(coverLetterTex).toContain('Dear Hiring Manager,');
      expect(coverLetterTex).toContain('Example Corp');
      expect(coverLetterTex).toContain('\\usepackage{fontawesome}');
      expect(coverLetterTex).toContain('\\faEnvelope');
      expect(coverLetterTex).toContain('\\faLinkedin');
      expect(coverLetterTex).toContain('\\faPhone');
      expect(coverLetterTex).toContain('\\faMapMarker');
      expect(coverLetterTex).toContain('\\scshape Taylor');
      expect(coverLetterTex).not.toContain('\\scshape Taylor Example');
      expect(coverLetterTex).not.toContain('Portfolio');
      expect(coverLetterTex).not.toContain('fontawesome5');

      const resumePdfPath = join(outputRoot, 'artifacts', job.id, 'resume-variant', 'v1', 'resume.pdf');
      const coverLetterPdfPath = join(
        outputRoot,
        'artifacts',
        job.id,
        'cover-letter',
        'v1',
        'cover-letter.pdf'
      );
      const resumePdf = readFileSync(resumePdfPath);
      const coverLetterPdf = readFileSync(coverLetterPdfPath);
      expect(resumePdf.toString('latin1').startsWith('%PDF-1.4')).toBe(true);
      expect(coverLetterPdf.toString('latin1').startsWith('%PDF-1.4')).toBe(true);
      expect(resumePdf.toString('latin1')).toContain('startxref');
      expect(coverLetterPdf.toString('latin1')).toContain('startxref');
    } finally {
      process.env.JOB_AUTOMATION_TECTONIC_COMMAND = originalCommand;
      process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON = originalArgs;
    }
  });

  test('applies job-relevant resume edits and skips generic no-op edits', async () => {
    const stubPath = fileURLToPath(
      new URL('../../fixtures/documents/tectonic-stub.mjs', import.meta.url)
    );
    const originalCommand = process.env.JOB_AUTOMATION_TECTONIC_COMMAND;
    const originalArgs = process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON;

    try {
      process.env.JOB_AUTOMATION_TECTONIC_COMMAND = 'node';
      process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON = JSON.stringify([stubPath]);

      const dbPath = createTestDatabasePath();
      const outputRoot = createTempOutputRoot();
      const db = createDatabaseClient(dbPath);
      trackedClients.push(db.$client);
      await migrate(db, { migrationsFolder });

      const applicantProfilesRepository = new ApplicantProfileRepository(db);
      const jobsRepository = new JobsRepository(db);
      const artifactsRepository = new ArtifactsRepository(db);

      const profile = await applicantProfilesRepository.save({
        id: 'default',
        fullName: 'Taylor Example',
        email: 'taylor@example.com',
        phone: '555-0100',
        location: 'Toronto, ON',
        summary: 'TypeScript engineer focused on testing automation and security dashboards.',
        reusableContext: 'Built distributed evaluation infrastructure for automated quality checks.',
        linkedinUrl: '',
        websiteUrl: '',
        baseResumeFileName: 'resume.tex',
        preferredCountries: [],
        baseResumeTex: String.raw`\documentclass{article}
\begin{document}
\section{Experience}
\begin{itemize}
\item Built TypeScript automation systems for internal tooling.
\item Designed operational workflows for local-first release work.
\end{itemize}
\end{document}`
      });

      const job = await jobsRepository.upsert({
        sourceKind: 'lever',
        sourceId: 'job-456',
        sourceUrl: 'https://jobs.lever.co/example/456',
        companyName: 'Example Security',
        title: 'Software Engineer, Evaluation Infrastructure',
        location: 'Remote - Canada',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText:
          'Build distributed testing automation and evaluation infrastructure for security systems.',
        rawPayload: '{"id":"job-456"}',
        discoveryRunId: null,
        status: 'shortlisted',
        discoveredAt: new Date('2026-05-20T09:00:00.000Z'),
        updatedAt: new Date('2026-05-20T09:00:00.000Z')
      });

      await generateResumeVariant({
        job,
        applicantProfile: profile,
        artifactsRepository,
        outputRoot,
        openRouter: {
          generateStructuredObject: async () => ({
            resumeKeywords: ['distributed', 'testing', 'evaluation infrastructure', 'security'],
            resumeEdits: [
              {
                search: 'Built TypeScript automation systems for internal tooling.',
                replacement:
                  'Built TypeScript testing automation systems for distributed evaluation infrastructure.',
                rationale: 'Adds supported job-specific terms.'
              },
              {
                search: 'Designed operational workflows for local-first release work.',
                replacement: 'Designed excellent operational workflows for thoughtful local-first release work.',
                rationale: 'No-op generic edit.'
              }
            ]
          })
        }
      });

      const resumeTexPath = join(outputRoot, 'artifacts', job.id, 'resume-variant', 'v1', 'resume.tex');
      const resumeTex = readFileSync(resumeTexPath, 'utf8');

      expect(resumeTex).toContain(
        'Built TypeScript testing automation systems for distributed evaluation infrastructure.'
      );
      expect(resumeTex).toContain('Designed operational workflows for local-first release work.');
      expect(resumeTex).not.toContain(
        'Designed excellent operational workflows for thoughtful local-first release work.'
      );
    } finally {
      process.env.JOB_AUTOMATION_TECTONIC_COMMAND = originalCommand;
      process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON = originalArgs;
    }
  });
});
