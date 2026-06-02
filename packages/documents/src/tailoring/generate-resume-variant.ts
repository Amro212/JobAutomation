import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { ApplicantProfile, ArtifactRecord, JobRecord } from '@jobautomation/core';
import type { ArtifactsRepository } from '@jobautomation/db';
import { buildResumeTailoringPrompt, tailoringOutputJsonSchema, tailoringOutputSchema, type TailoringOutput } from '@jobautomation/llm';

import { storeArtifact } from '../artifacts/store-artifact';
import { compileLatexDocument } from '../compiler/tectonic';
import { renderTemplate } from '../tokens/render-template';
import { balanceResumeSubHeadingLists } from './balance-resume-subheading-lists';
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

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function probeReplacementLatexRisk(replacement: string): {
  hasDoubleNewline: boolean;
  hasParMacro: boolean;
  hasLinebreakMacro: boolean;
  hasVspaceMacro: boolean;
  nonAsciiCount: number;
} {
  return {
    hasDoubleNewline: /\r?\n\s*\r?\n/.test(replacement),
    hasParMacro: /\\par\b/.test(replacement),
    hasLinebreakMacro: /\\\\/.test(replacement),
    hasVspaceMacro: /\\vspace\s*\{/.test(replacement),
    nonAsciiCount: [...replacement].filter((ch) => ch.charCodeAt(0) > 127).length
  };
}

type ResumeEditDiagnostic = {
  index: number;
  match: 'direct' | 'line' | 'miss' | 'skipped';
  replacementRisk: ReturnType<typeof probeReplacementLatexRisk>;
  skipReason?: 'replace-shorter' | 'body-shrink' | 'item-count' | 'generic-edit';
};

function normalizeSignalText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/[{}\\]/g, ' ')
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addsJobRelevantSignal(input: {
  search: string;
  replacement: string;
  jobKeywords: string[];
}): boolean {
  const searchText = normalizeSignalText(input.search);
  const replacementText = normalizeSignalText(input.replacement);

  if (searchText === replacementText) {
    return false;
  }

  return input.jobKeywords.some((keyword) => {
    const normalizedKeyword = normalizeSignalText(keyword);
    return (
      normalizedKeyword.length > 0 &&
      replacementText.includes(normalizedKeyword) &&
      !searchText.includes(normalizedKeyword)
    );
  });
}

function extractDocumentBody(tex: string): string {
  const beginIdx = tex.indexOf('\\begin{document}');
  const endIdx = tex.indexOf('\\end{document}');
  if (beginIdx === -1 || endIdx === -1) {
    return tex;
  }
  return tex.slice(beginIdx, endIdx + '\\end{document}'.length);
}

function countResumeItemOpensInBody(tex: string): number {
  const body = extractDocumentBody(tex);
  return (body.match(/\\resumeItem\{/g) ?? []).length;
}

function compactDocumentBodyLength(tex: string): number {
  return normalizeWhitespace(extractDocumentBody(tex)).length;
}

function applyOneResumeEdit(
  tex: string,
  edit: { search: string; replacement: string }
): { next: string; match: 'direct' | 'line' | 'miss' } {
  if (tex.includes(edit.search)) {
    return { next: tex.replace(edit.search, edit.replacement), match: 'direct' };
  }

  const normalizedSearch = normalizeWhitespace(edit.search);
  const lines = tex.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (normalizeWhitespace(lines[i]!).includes(normalizedSearch)) {
      const originalLine = lines[i]!;
      const leadingWs = originalLine.match(/^(\s*)/)?.[1] ?? '';
      const copy = [...lines];
      copy[i] = leadingWs + edit.replacement;
      return { next: copy.join('\n'), match: 'line' };
    }
  }

  return { next: tex, match: 'miss' };
}

/** Applies LLM edits one at a time; skips any edit that would drop bullets or materially shrink content. */
function applyTargetedResumeEdits(
  baseResumeTex: string,
  editHints: TailoringOutput | null,
  jobKeywords: string[]
): { tex: string; editDiagnostics: ResumeEditDiagnostic[] } {
  const editDiagnostics: ResumeEditDiagnostic[] = [];

  if (!editHints || editHints.resumeEdits.length === 0) {
    return { tex: baseResumeTex, editDiagnostics };
  }

  const originalItemOpens = countResumeItemOpensInBody(baseResumeTex);
  const originalCompactLen = compactDocumentBodyLength(baseResumeTex);
  const minCompactLen = Math.max(0, Math.floor(originalCompactLen * 0.9));

  let nextResume = baseResumeTex;

  editHints.resumeEdits.forEach((edit, index) => {
    const risk = probeReplacementLatexRisk(edit.replacement);

    if (edit.replacement.length < edit.search.length) {
      editDiagnostics.push({
        index,
        match: 'skipped',
        replacementRisk: risk,
        skipReason: 'replace-shorter'
      });
      return;
    }

    if (!addsJobRelevantSignal({ search: edit.search, replacement: edit.replacement, jobKeywords })) {
      editDiagnostics.push({
        index,
        match: 'skipped',
        replacementRisk: risk,
        skipReason: 'generic-edit'
      });
      return;
    }

    const { next: candidate, match } = applyOneResumeEdit(nextResume, edit);

    if (match === 'miss') {
      editDiagnostics.push({ index, match: 'miss', replacementRisk: risk });
      return;
    }

    if (countResumeItemOpensInBody(candidate) !== originalItemOpens) {
      editDiagnostics.push({
        index,
        match: 'skipped',
        replacementRisk: risk,
        skipReason: 'item-count'
      });
      return;
    }

    if (compactDocumentBodyLength(candidate) < minCompactLen) {
      editDiagnostics.push({
        index,
        match: 'skipped',
        replacementRisk: risk,
        skipReason: 'body-shrink'
      });
      return;
    }

    nextResume = candidate;
    editDiagnostics.push({
      index,
      match,
      replacementRisk: risk
    });
  });

  return { tex: nextResume, editDiagnostics };
}

async function loadOptionalLLMEdits(
  input: ReturnType<typeof buildTailoringInput>,
  openRouter?: GenerateResumeVariantInput['openRouter']
): Promise<TailoringOutput | null> {
  if (!openRouter) {
    return null;
  }

  const resumeBody = extractDocumentBody(input.baseResumeTex);

  const prompt = buildResumeTailoringPrompt({
    jobTitle: input.job.title,
    companyName: input.job.companyName,
    location: input.job.location,
    descriptionText: input.job.descriptionText,
    applicantSummary: input.applicantProfile.summary,
    applicantContext: input.applicantContext,
    baseResumeFileName: input.baseResumeFileName,
    baseResumeTex: resumeBody,
    jobKeywordHints: input.jobKeywords
  });

  const raw = await openRouter.generateStructuredObject({
    schemaName: 'tailoring-output',
    schema: tailoringOutputJsonSchema as Record<string, unknown>,
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
  const baseRenderedTex = renderTemplate(baseResume.baseResumeTex, {
    job_title: input.job.title,
    company_name: input.job.companyName,
    job_location: input.job.location,
    job_keywords: tailoringInput.jobKeywords.join(', '),
    applicant_summary: input.applicantProfile.summary,
    applicant_context: input.applicantProfile.reusableContext
  });
  const { tex: afterEditsTex } = applyTargetedResumeEdits(
    baseRenderedTex,
    llmOutput,
    tailoringInput.jobKeywords
  );
  const tailoredResumeTex = balanceResumeSubHeadingLists(afterEditsTex).tex;

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
