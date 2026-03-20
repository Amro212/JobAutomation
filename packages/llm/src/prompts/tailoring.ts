export type TailoringPromptInput = {
  jobTitle: string;
  companyName: string;
  location: string;
  descriptionText: string;
  applicantSummary: string;
  applicantContext: string;
  baseResumeFileName: string;
};

export function buildTailoringPrompt(input?: TailoringPromptInput): {
  systemPrompt: string;
  prompt: string;
} {
  const systemPrompt =
    'You tailor LaTeX resume content and cover letters with targeted edits only. Preserve the existing resume structure. Return strict JSON that matches the schema. Do not invent a full resume from scratch.';

  if (!input) {
    return {
      systemPrompt,
      prompt: 'Return targeted resume edits, resume keywords, and 2-4 cover letter paragraphs.'
    };
  }

  return {
    systemPrompt,
    prompt: [
      `Job title: ${input.jobTitle}`,
      `Company: ${input.companyName}`,
      `Location: ${input.location}`,
      `Base resume file: ${input.baseResumeFileName}`,
      '',
      'Job description:',
      input.descriptionText,
      '',
      'Applicant summary:',
      input.applicantSummary,
      '',
      'Reusable applicant context:',
      input.applicantContext,
      '',
      'Requirements:',
      '- Suggest only targeted resume edits: bullet phrasing, keywords, emphasis, and minimal wording adjustments.',
      '- Preserve the uploaded LaTeX resume structure.',
      '- Draft cover letter paragraphs from scratch.',
      '- Explicitly reference the uploaded resume and reusable applicant context in the cover letter paragraphs.',
      '- Return strict JSON only.'
    ].join('\n')
  };
}
