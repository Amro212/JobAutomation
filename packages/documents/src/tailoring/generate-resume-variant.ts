import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ApplicantProfile, ArtifactRecord, JobRecord } from '@jobautomation/core';
import type { ArtifactsRepository } from '@jobautomation/db';
import { buildTailoringPrompt, tailoringOutputSchema, type TailoringOutput } from '@jobautomation/llm';

import { storeArtifact } from '../artifacts/store-artifact';
import { compileLatexDocument } from '../compiler/tectonic';
import { renderTemplate } from '../tokens/render-template';
import { buildTailoringInput } from './build-tailoring-input';
import { loadApplicantContext } from './load-applicant-context';
import { loadBaseResume } from './load-base-resume';

export type GenerateResumeVariantInput = {
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

function applyTargetedResumeEdits(
  baseResumeTex: string,
  jobKeywords: string[],
  editHints: TailoringOutput | null
): string {
  let nextResume = baseResumeTex;
  const keywords = (editHints?.resumeKeywords.length ? editHints.resumeKeywords : jobKeywords).slice(0, 3);

  for (const edit of editHints?.resumeEdits ?? []) {
    nextResume = nextResume.includes(edit.search)
      ? nextResume.replace(edit.search, edit.replacement)
      : nextResume;
  }

  if (keywords.length > 0) {
    const keywordLine = keywords.join(', ');
    nextResume = nextResume.replace(/(\\item\s+[^\n]+)/, (match) => {
      if (match.includes(keywordLine)) {
        return match;
      }

      return `${match} with emphasis on ${keywordLine}`;
    });
  }

  return nextResume;
}

async function loadOptionalLLMEdits(
  input: ReturnType<typeof buildTailoringInput>,
  openRouter?: GenerateResumeVariantInput['openRouter']
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
    baseResumeFileName: input.baseResumeFileName
  });

  const raw = await openRouter.generateStructuredObject({
    schemaName: 'tailoring-output',
    schema: tailoringOutputSchema,
    systemPrompt: prompt.systemPrompt,
    prompt: prompt.prompt
  });

  return tailoringOutputSchema.parse(raw);
}

export async function generateResumeVariant(
  input: GenerateResumeVariantInput
): Promise<ArtifactRecord[]> {
  const baseResume = loadBaseResume(input.applicantProfile);
  loadApplicantContext(input.applicantProfile);
  const tailoringInput = buildTailoringInput({
    job: input.job,
    applicantProfile: input.applicantProfile
  });
  const llmOutput = await loadOptionalLLMEdits(tailoringInput, input.openRouter ?? null);
  const outputRoot = resolve(input.outputRoot ?? 'output');
  const version = await input.artifactsRepository.nextVersionForJobAndKind(
    input.job.id,
    'resume-variant'
  );
  const jobDir = join(outputRoot, 'artifacts', input.job.id, 'resume-variant', `v${version}`);
  const texPath = join(jobDir, 'resume.tex');
  const pdfPath = join(jobDir, 'resume.pdf');
  const tailoredResumeTex = applyTargetedResumeEdits(
    renderTemplate(baseResume.baseResumeTex, {
      job_title: input.job.title,
      company_name: input.job.companyName,
      job_location: input.job.location,
      job_keywords: tailoringInput.jobKeywords.join(', '),
      applicant_summary: input.applicantProfile.summary,
      applicant_context: input.applicantProfile.reusableContext
    }),
    tailoringInput.jobKeywords,
    llmOutput
  );

  await mkdir(jobDir, { recursive: true });
  await writeFile(texPath, tailoredResumeTex, 'utf8');

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
      kind: 'resume-variant',
      format: 'tex',
      fileName: 'resume.tex',
      storagePath: texPath,
      content: tailoredResumeTex
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
        kind: 'resume-variant',
        format: 'pdf',
        fileName: 'resume.pdf',
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
        kind: 'resume-variant',
        format: 'log',
        fileName: 'tectonic.log',
        storagePath: compileResult.diagnosticsPath,
        content: `${compileResult.stdout}\n${compileResult.stderr}`.trim()
      })
    );
  }

  return artifacts;
}
