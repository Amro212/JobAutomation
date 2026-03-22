import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ApplicantProfile, ArtifactRecord, JobRecord } from '@jobautomation/core';
import type { ArtifactsRepository } from '@jobautomation/db';
import {
  buildCoverLetterPrompt,
  coverLetterOutputJsonSchema,
  coverLetterOutputSchema,
  type CoverLetterOutput
} from '@jobautomation/llm';

import { storeArtifact } from '../artifacts/store-artifact';
import { compileLatexDocument } from '../compiler/tectonic';
import { escapeLatex } from '../tokens/escape-latex';
import { buildTailoringInput } from './build-tailoring-input';
import {
  buildCoverLetterContactRow,
  buildCoverLetterMailingLines
} from './cover-letter-tokens';
import { loadApplicantContext } from './load-applicant-context';
import { loadBaseResume } from './load-base-resume';

export type GenerateCoverLetterVariantInput = {
  job: JobRecord;
  applicantProfile: ApplicantProfile;
  artifactsRepository: ArtifactsRepository;
  outputRoot?: string;
  openRouter?: {
    generateStructuredObject(input: {
      schemaName: string;
      schema: Record<string, unknown>;
      systemPrompt: string;
      prompt: string;
    }): Promise<unknown>;
  } | null;
};

async function generateCoverLetterContent(
  input: ReturnType<typeof buildTailoringInput>,
  openRouter?: GenerateCoverLetterVariantInput['openRouter']
): Promise<CoverLetterOutput | null> {
  if (!openRouter) {
    return null;
  }

  const prompt = buildCoverLetterPrompt({
    jobTitle: input.job.title,
    companyName: input.job.companyName,
    location: input.job.location,
    descriptionText: input.job.descriptionText,
    applicantSummary: input.applicantProfile.summary,
    applicantContext: input.applicantContext,
    baseResumeFileName: input.baseResumeFileName,
    baseResumeTex: input.baseResumeTex
  });

  const raw = await openRouter.generateStructuredObject({
    schemaName: 'cover-letter-output',
    schema: coverLetterOutputJsonSchema as Record<string, unknown>,
    systemPrompt: prompt.systemPrompt,
    prompt: prompt.prompt
  });

  return coverLetterOutputSchema.parse(raw);
}

function buildCoverLetterBody(
  input: ReturnType<typeof buildTailoringInput>,
  draft: CoverLetterOutput | null
): string {
  if (draft && draft.coverLetterParagraphs.length > 0) {
    return draft.coverLetterParagraphs
      .map((p) => escapeLatex(p))
      .join('\n\n');
  }

  return [
    escapeLatex(
      `I am writing to express my interest in the ${input.job.title} position at ${input.job.companyName}. ` +
      `My background in software development and hands-on experience with automation and tooling align well with the responsibilities outlined in the job posting.`
    ),
    escapeLatex(
      `Through my work experience, I have developed skills in building automation workflows, integrating APIs, and creating tools that improve efficiency. ` +
      `I am confident these experiences have prepared me to contribute meaningfully to your team.`
    ),
    escapeLatex(
      `I would welcome the opportunity to discuss how my background and skills can support ${input.job.companyName}'s goals. ` +
      `Thank you for considering my application.`
    )
  ].join('\n\n');
}

export async function generateCoverLetterVariant(
  input: GenerateCoverLetterVariantInput
): Promise<ArtifactRecord[]> {
  loadBaseResume(input.applicantProfile);
  loadApplicantContext(input.applicantProfile);
  const tailoringInput = buildTailoringInput({
    job: input.job,
    applicantProfile: input.applicantProfile
  });
  const draft = await generateCoverLetterContent(tailoringInput, input.openRouter ?? null);
  const outputRoot = resolve(input.outputRoot ?? 'output');
  const version = await input.artifactsRepository.nextVersionForJobAndKind(
    input.job.id,
    'cover-letter'
  );
  const jobDir = join(outputRoot, 'artifacts', input.job.id, 'cover-letter', `v${version}`);
  const texPath = join(jobDir, 'cover-letter.tex');
  const pdfPath = join(jobDir, 'cover-letter.pdf');

  const body = buildCoverLetterBody(tailoringInput, draft);

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const coverLetterTemplate = await readFile(
    new URL('../templates/cover-letter/base.tex', import.meta.url),
    'utf8'
  );

  const addressee = 'Hiring Manager';
  const tokens: Record<string, string> = {
    '{{candidate_name}}': escapeLatex(input.applicantProfile.fullName || 'Applicant'),
    '{{contact_row}}': buildCoverLetterContactRow(input.applicantProfile),
    '{{letter_date}}': escapeLatex(dateStr),
    '{{recipient_line}}': escapeLatex(addressee),
    '{{company_line}}': escapeLatex(input.job.companyName),
    '{{mailing_lines}}': buildCoverLetterMailingLines(input.job),
    '{{greeting_line}}': escapeLatex(`Dear ${addressee},`),
    '{{cover_letter_body}}': body,
    '{{closer_line}}': escapeLatex('Sincerely'),
    '{{signoff_name}}': escapeLatex(input.applicantProfile.fullName || 'Applicant'),
    '{{signoff_title}}': ''
  };

  let coverLetterTex = coverLetterTemplate;
  for (const [token, value] of Object.entries(tokens)) {
    coverLetterTex = coverLetterTex.replaceAll(token, value);
  }

  await mkdir(jobDir, { recursive: true });
  await writeFile(texPath, coverLetterTex, 'utf8');

  const compileResult = await compileLatexDocument({
    texPath,
    outDir: jobDir
  });

  const artifacts: ArtifactRecord[] = [];
  artifacts.push(
    await storeArtifact({
      artifactsRepository: input.artifactsRepository,
      jobId: input.job.id,
      applicantProfileId: input.applicantProfile.id,
      applicantProfileUpdatedAt: input.applicantProfile.updatedAt,
      version,
      kind: 'cover-letter',
      format: 'tex',
      fileName: 'cover-letter.tex',
      storagePath: texPath,
      content: coverLetterTex
    })
  );

  if (compileResult.ok) {
    artifacts.push(
      await storeArtifact({
        artifactsRepository: input.artifactsRepository,
        jobId: input.job.id,
        applicantProfileId: input.applicantProfile.id,
        applicantProfileUpdatedAt: input.applicantProfile.updatedAt,
        version,
        kind: 'cover-letter',
        format: 'pdf',
        fileName: 'cover-letter.pdf',
        storagePath: pdfPath,
        content: await readFile(compileResult.pdfPath)
      })
    );
  } else {
    artifacts.push(
      await storeArtifact({
        artifactsRepository: input.artifactsRepository,
        jobId: input.job.id,
        applicantProfileId: input.applicantProfile.id,
        applicantProfileUpdatedAt: input.applicantProfile.updatedAt,
        version,
        kind: 'cover-letter',
        format: 'log',
        fileName: 'tectonic.log',
        storagePath: compileResult.diagnosticsPath,
        content: `${compileResult.stdout}\n${compileResult.stderr}`.trim()
      })
    );
  }

  return artifacts;
}
