export type TailoringPromptInput = {
  jobTitle: string;
  companyName: string;
  location: string;
  descriptionText: string;
  applicantSummary: string;
  applicantContext: string;
  baseResumeFileName: string;
  baseResumeTex: string;
  hiringManagerName?: string;
};

export function buildResumeTailoringPrompt(input: TailoringPromptInput): {
  systemPrompt: string;
  prompt: string;
} {
  const systemPrompt = [
    'You are an ATS keyword-optimization specialist.',
    'Your ONLY job is to suggest small, targeted text changes to an existing LaTeX resume so it scores higher on ATS systems for a specific job posting.',
    'Rules:',
    '1. Each resumeEdit.search MUST be an EXACT character-for-character substring copied from the LaTeX resume below. If it is not an exact match the edit will silently fail.',
    '2. Each resumeEdit.replacement MUST be valid LaTeX and fit the same structural context (same \\resumeItem, same \\textbf, etc.).',
    '3. Focus on \\resumeItem bullet points in Experience and Projects, and the \\textbf{Languages}, \\textbf{Libraries}, \\textbf{Developer Tools} lines in Technical Skills.',
    '4. Do NOT add new sections, new jobs, or new bullet points. Only rephrase existing ones.',
    '5. Do NOT fabricate skills or technologies the applicant does not have. Only reword with terminology from the job posting.',
    '6. Suggest 3-8 edits. Each edit should swap, add, or reorder keywords to match the job description.',
    '7. Return strict JSON matching the schema. No markdown fences, no commentary outside the JSON.'
  ].join(' ');

  const prompt = [
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
    '--- APPLICANT CONTEXT ---',
    input.applicantContext,
    '',
    '--- CURRENT LATEX RESUME (exact source) ---',
    input.baseResumeTex,
    '',
    '--- TASK ---',
    'Analyze the job description and identify keywords, technologies, and phrases that an ATS would scan for.',
    'Then look at the resume above and find bullet points or skill lines that could be reworded to include those keywords naturally.',
    'Provide search/replacement pairs. The "search" field must be copied EXACTLY from the resume above, character for character, including LaTeX commands.',
    'The "replacement" field should be the improved version with better keyword alignment for this specific job.',
    'Also list the top ATS keywords from the job description in resumeKeywords.',
    'Return only the JSON object.'
  ].join('\n');

  return { systemPrompt, prompt };
}

export function buildCoverLetterPrompt(input: TailoringPromptInput): {
  systemPrompt: string;
  prompt: string;
} {
  const addressee = input.hiringManagerName || 'Hiring Manager';
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const systemPrompt = [
    'You write professional cover letters for job applications.',
    'Rules you MUST follow:',
    '1. Write 200-350 words total across 3-5 paragraphs.',
    '2. NEVER use em dashes. Use commas, periods, or semicolons instead.',
    '3. Use a sincere, professional, college-level tone. No robotic or overly formal language.',
    '4. Use simple, clear vocabulary. No complex or rare words.',
    '5. Make direct, specific references to the job posting (mention responsibilities, technologies, or goals from the job description).',
    '6. Reference specific experiences from the applicant background that genuinely relate to the role.',
    '7. Be honest. Do NOT fabricate skills, experiences, or achievements the applicant does not have.',
    '8. Do NOT mention any file names, LaTeX, technical formats, or internal tooling.',
    '9. Do NOT mention "reusable context" or any meta-references about how the letter was generated.',
    '10. Do NOT start every paragraph with "I". Vary sentence structure.',
    '11. Return ONLY plain text paragraphs. No LaTeX commands, no markdown, no special formatting.',
    '12. Return strict JSON matching the schema. No markdown fences, no commentary.'
  ].join(' ');

  const prompt = [
    `Job title: ${input.jobTitle}`,
    `Company: ${input.companyName}`,
    `Location: ${input.location}`,
    `Addressee: ${addressee}`,
    `Date: ${dateStr}`,
    '',
    '--- JOB DESCRIPTION ---',
    input.descriptionText,
    '',
    '--- APPLICANT BACKGROUND ---',
    `Name: ${input.applicantSummary}`,
    '',
    '--- APPLICANT CONTEXT ---',
    input.applicantContext,
    '',
    '--- APPLICANT RESUME CONTENT (for reference only, do NOT mention LaTeX or file names) ---',
    input.baseResumeTex,
    '',
    '--- TASK ---',
    `Write a cover letter body for the ${input.jobTitle} position at ${input.companyName}.`,
    `The letter is addressed to "${addressee}" and dated ${dateStr}.`,
    'Write 3-5 paragraphs (200-350 words total).',
    'The first paragraph should express interest in the specific role and company.',
    'The middle paragraphs should connect the applicant\'s real experience to the job requirements with specific examples.',
    'The final paragraph should express enthusiasm and invite further conversation.',
    'Return the paragraphs in the coverLetterParagraphs array.',
    'Remember: no em dashes, no file references, no fabricated experience, simple vocabulary, sincere tone.'
  ].join('\n');

  return { systemPrompt, prompt };
}

export function buildTailoringPrompt(input?: TailoringPromptInput): {
  systemPrompt: string;
  prompt: string;
} {
  if (!input) {
    return {
      systemPrompt: 'You are an ATS-optimization expert.',
      prompt: 'Return targeted resume edits and cover letter paragraphs.'
    };
  }
  return buildResumeTailoringPrompt(input);
}
