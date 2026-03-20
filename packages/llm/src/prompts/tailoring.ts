export type TailoringPromptInput = {
  jobTitle: string;
  companyName: string;
  location: string;
  descriptionText: string;
  applicantSummary: string;
  applicantContext: string;
  baseResumeFileName: string;
  baseResumeTex: string;
};

export function buildTailoringPrompt(input?: TailoringPromptInput): {
  systemPrompt: string;
  prompt: string;
} {
  const systemPrompt = [
    'You are an ATS-optimization expert that tailors LaTeX resumes and writes cover letters.',
    'For resume edits: suggest ONLY targeted search-and-replace changes to existing bullet points.',
    'Each resumeEdit.search must be an exact substring from the provided LaTeX resume.',
    'Each resumeEdit.replacement must be valid LaTeX that fits the same context.',
    'Do NOT rewrite the entire resume. Only adjust phrasing, keywords, and emphasis to pass ATS filters for the specific job.',
    'For cover letters: write 2-4 professional paragraphs from scratch referencing the applicant\'s background and the job requirements.',
    'Return strict JSON matching the schema. No markdown, no commentary.'
  ].join(' ');

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
      '',
      '--- JOB DESCRIPTION ---',
      input.descriptionText,
      '',
      '--- APPLICANT SUMMARY ---',
      input.applicantSummary,
      '',
      '--- REUSABLE APPLICANT CONTEXT ---',
      input.applicantContext,
      '',
      '--- CURRENT LATEX RESUME ---',
      input.baseResumeTex,
      '',
      '--- INSTRUCTIONS ---',
      '1. Identify ATS-relevant keywords from the job description that are missing or underrepresented in the resume.',
      '2. In resumeEdits, provide search/replacement pairs where "search" is an EXACT substring from the LaTeX resume above and "replacement" is a revised version with better keyword alignment. Keep edits minimal and preserve LaTeX syntax.',
      '3. In resumeKeywords, list the top keywords from the job description that the resume should emphasize.',
      '4. In coverLetterParagraphs, write 2-4 professional paragraphs for a cover letter tailored to this specific job. Reference the applicant\'s experience and how it aligns with the role requirements.',
      '5. Return strict JSON only.'
    ].join('\n')
  };
}
