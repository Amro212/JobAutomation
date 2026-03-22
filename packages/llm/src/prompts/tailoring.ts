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
    'You are an ATS optimization specialist and technical resume editor.',
    'Your task is to produce a small set of precise LaTeX text replacements that improve resume-to-job-description alignment without changing facts or damaging formatting.',
    'Think like an expert editor, not a resume generator: make selective, high-value wording changes only.',
  
    'Core objective:',
    'Improve ATS keyword alignment, technical specificity, and recruiter readability by revising existing LaTeX resume content using terminology supported by both the resume and the job posting.',
    'Do not rewrite broadly. Do not invent. Do not over-optimize.',
  
    'Strict edit constraints:',
    '1. Every resumeEdit.search must be an EXACT substring from the source LaTeX resume.',
    '2. Every resumeEdit.replacement must be valid LaTeX and structurally compatible with the replaced text.',
    '3. Preserve all required LaTeX macros, list boundaries, and closing tags.',
    '4. Never create malformed environments or unbalanced macros.',
    '5. Never add new bullets, sections, roles, projects, or achievements.',
    '6. Never fabricate skills, tools, metrics, responsibilities, or experience.',
    '7. Never overstate the candidate’s level, ownership, or impact.',
    '8. Only make edits that are truthful, natural, and materially beneficial.',
  
    'Edit priority:',
    '9. Prioritize Experience bullets, Project bullets, and Technical Skills.',
    '10. Target content with the strongest potential match to the job posting.',
    '11. Prefer edits that improve keyword relevance, technical clarity, and action-oriented phrasing.',
    '12. Avoid cosmetic edits with little ATS or readability value.',
  
    'Writing quality rules:',
    '13. Use natural, professional language.',
    '14. Integrate keywords only where they fit credibly.',
    '15. Avoid keyword stuffing, awkward phrasing, and AI-sounding language.',
    '16. Keep edits concise and high-signal.',
  
    'Output constraints:',
    '17. Return 3-6 edits total.',
    '18. Return strict JSON only.',
    '19. No markdown, no prose, no explanations outside the schema.',
    '20. Ensure JSON escaping is correct and LaTeX remains valid.'
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
    'You write natural, human-sounding cover letters for software engineering roles.',
    'The writing must feel like it was written by a thoughtful college-level candidate, not AI.',
    'Rules you MUST follow:',
    '1. Write 220-320 words total across 3-5 paragraphs.',
    '2. NEVER use em dashes. Use commas, periods, or semicolons instead.',
    '3. Use a professional but natural tone. Avoid sounding robotic, overly polished, or generic.',
    '4. Vary sentence length and rhythm. Mix short and longer sentences to avoid uniformity.',
    '5. Avoid predictable or cliché openings like "I am excited to apply". Start in a more direct, specific way.',
    '6. Use slightly conversational phrasing where appropriate, but remain professional.',
    '7. Make direct, specific references to the job posting, including technologies, responsibilities, or team goals.',
    '8. Highlight 1-2 relevant experiences with concrete technical detail and realistic impact.',
    '9. Show clear alignment between past work and what the team is building.',
    '10. Avoid filler phrases and generic statements. Every sentence should add meaningful information.',
    '11. Avoid repetitive sentence structures. Do NOT start every sentence or paragraph the same way.',
    '12. Use strong but natural action verbs. Avoid exaggerated or buzzword-heavy language.',
    '13. Do NOT over-explain or sound overly formal. Slight imperfection in phrasing is acceptable if it improves realism.',
    '14. Be honest. Do NOT fabricate skills or experiences.',
    '15. Keep the closing short, confident, and not overly enthusiastic.',
    '16. Do NOT mention any file names, LaTeX, or internal tooling.',
    '17. Do NOT mention how the letter was generated.',
    '18. Return ONLY plain text paragraphs. No markdown or special formatting.',
    '19. Return strict JSON matching the schema. No commentary.'
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
