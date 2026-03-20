import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ApplicantProfile, ArtifactRecord, JobRecord } from '@jobautomation/core';
import type { ArtifactsRepository } from '@jobautomation/db';
import { buildTailoringPrompt, tailoringOutputJsonSchema, tailoringOutputSchema, type TailoringOutput } from '@jobautomation/llm';

import { storeArtifact } from '../artifacts/store-artifact';
import { compileLatexDocument } from '../compiler/tectonic';
import { escapeLatex } from '../tokens/escape-latex';
import { renderTemplate } from '../tokens/render-template';
import { buildTailoringInput } from './build-tailoring-input';
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

async function loadOptionalCoverLetterDraft(
  input: ReturnType<typeof buildTailoringInput>,
  openRouter?: GenerateCoverLetterVariantInput['openRouter']
): Promise<TailoringOutput | null> {
  if (!openRouter) {
    return null;
  }

  const prompt = buildTailoringPrompt({
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
    schemaName: 'tailoring-output',
    schema: tailoringOutputJsonSchema as Record<string, unknown>,
    systemPrompt: prompt.systemPrompt,
    prompt: prompt.prompt
  });

  return tailoringOutputSchema.parse(raw);
}

function buildCoverLetterParagraphs(
  input: ReturnType<typeof buildTailoringInput>,
  draft: TailoringOutput | null
): string[] {
  const resumeReference = input.applicantProfile.baseResumeFileName || 'the uploaded LaTeX resume';
  const contextReference =
    input.applicantProfile.reusableContext.trim().length > 0
      ? input.applicantProfile.reusableContext
      : 'the reusable applicant context';

  const fallbackParagraphs = [
    `I am applying for the ${input.job.title} role at ${input.job.companyName} using my canonical LaTeX resume (${resumeReference}) and my reusable applicant context so the application stays aligned with the profile I keep for job search work.`,
    `The role stands out because it matches my experience with ${input.jobKeywords.slice(0, 3).join(', ') || 'local-first automation, TypeScript, and operational tooling'}. I keep the resume structure intact and only adapt the targeted details that matter for this job.`,
    `The reusable applicant context I keep for applications emphasizes ${contextReference}. I would welcome a conversation about how that background fits your team and the problems this role needs to solve.`
  ];

  if (!draft) {
    return fallbackParagraphs;
  }

  const extraParagraphs = draft.coverLetterParagraphs.slice(0, 3);
  return [
    fallbackParagraphs[0],
    ...extraParagraphs,
    fallbackParagraphs[2]
  ].slice(0, 4);
}

export async function generateCoverLetterVariant(
  input: GenerateCoverLetterVariantInput
): Promise<ArtifactRecord[]> {
  const baseResume = loadBaseResume(input.applicantProfile);
  loadApplicantContext(input.applicantProfile);
  const tailoringInput = buildTailoringInput({
    job: input.job,
    applicantProfile: input.applicantProfile
  });
  const draft = await loadOptionalCoverLetterDraft(tailoringInput, input.openRouter ?? null);
  const outputRoot = resolve(input.outputRoot ?? 'output');
  const version = await input.artifactsRepository.nextVersionForJobAndKind(
    input.job.id,
    'cover-letter'
  );
  const jobDir = join(outputRoot, 'artifacts', input.job.id, 'cover-letter', `v${version}`);
  const texPath = join(jobDir, 'cover-letter.tex');
  const pdfPath = join(jobDir, 'cover-letter.pdf');
  const paragraphs = buildCoverLetterParagraphs(tailoringInput, draft);
  const coverLetterTemplate = await readFile(
    new URL('../templates/cover-letter/base.tex', import.meta.url),
    'utf8'
  );
  const coverLetterTex = renderTemplate(
    coverLetterTemplate,
    {
      company_name: input.job.companyName,
      candidate_name: input.applicantProfile.fullName || 'Applicant',
      cover_letter_body: paragraphs.map((paragraph) => `${escapeLatex(paragraph)}\n\n`).join(''),
      resume_reference: baseResume.baseResumeFileName
    },
    {
      rawTokens: ['cover_letter_body']
    }
  );

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
