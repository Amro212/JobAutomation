export type TailoringPromptInput = {
  jobTitle: string;
  companyName: string;
  location: string;
  descriptionText: string;
  applicantSummary: string;
  applicantContext: string;
  baseResumeFileName: string;
  baseResumeTex: string;
  /** Optional short tokens from deterministic job/profile extraction; use as hints only. */
  jobKeywordHints?: string[];
  hiringManagerName?: string;
  /**
   * When true, `baseResumeTex` is the job-specific tailored resume (same facts as the resume PDF).
   * The model must stay consistent with that text and must not invent experiences beyond it.
   */
  coverLetterResumeIsTailoredVariant?: boolean;
};

/** Strip common HTML job-board markup so the model sees clean requirements text. */
export function toPlainJobDescription(descriptionText: string): string {
  const raw = descriptionText.trim();
  if (!raw.includes('<') && !raw.includes('&')) {
    return raw;
  }

  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function buildResumeTailoringPrompt(input: TailoringPromptInput): {
  systemPrompt: string;
  prompt: string;
} {
  const plainJobDescription = toPlainJobDescription(input.descriptionText);

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
    '2b. In plain text within the resume, a literal ampersand must be written as \\& only — never \\\\& (double backslash before & breaks compilation).',
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

  const hintBlock =
    input.jobKeywordHints && input.jobKeywordHints.length > 0
      ? ['', '--- KEYWORD HINTS (deterministic; verify against job + resume) ---', input.jobKeywordHints.join(', ')].join(
          '\n'
        )
      : '';

  const prompt = [
    `Job title: ${input.jobTitle}`,
    `Company: ${input.companyName}`,
    `Location: ${input.location}`,
    hintBlock,
    '',
    '--- JOB DESCRIPTION (plain text) ---',
    plainJobDescription,
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
    '1) Read the job description plus Applicant Summary and Applicant Context; list resumeKeywords (10-15) for this employer only.',
    '2) Plan edits that are mostly Technical Skills (ordering/substantiated additions) and Projects (short phrase tweaks). Keep Experience edits minimal and never reframed.',
    '3) Every new keyword or skill must trace to the candidate’s stated expertise: same stack, same project domain, or explicit note in Context—otherwise skip it.',
    '4) Use SHORT search spans by default; each "search" copied EXACTLY from the resume. Each "replacement" keeps the same LaTeX structure and must be at least as long as "search".',
    '5) Do not delete metrics, named APIs, or distinctive technical phrases to make room for buzzwords.',
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
    'The voice is honest, down-to-earth, and humble: a real person, not a brochure or an AI.',
    'Rules you MUST follow:',
    '1. Write 220-320 words total across 3-5 paragraphs.',
    '2. NEVER use em dashes. Use commas, periods, or semicolons instead.',
    '3. Use a professional but natural tone. Avoid sounding robotic, overly polished, or generic.',
    '4. Vary sentence length and rhythm. Mix short and longer sentences to avoid uniformity.',
    '5. Avoid predictable or cliché openings like "I am excited to apply". Start in a more direct, specific way.',
    '6. Use slightly conversational phrasing where appropriate, but remain professional.',
    '7. Weave in what the role involves (tools, problems, scale) as plain facts about the work, the way a human would.',
    '   Do NOT use meta-phrases about documents: never say "job description", "the posting", "as mentioned/stated in",',
    '   "per the requirements", "technical requirements at [company]", "this role asks for", or similar.',
    '   Do NOT say you are "matching" or "aligning with" a document; show overlap through concrete stories instead.',
    '8. Highlight 1-2 relevant experiences with concrete technical detail and realistic impact, drawn only from the resume and context provided.',
    '9. Be strictly honest: do NOT fabricate skills, employers, projects, or metrics. If the employer cares about something you have not done yet,',
    '   say so briefly and positively (e.g. eager to go deeper, willing to learn, building on adjacent experience).',
    '   Relate the closest real experience you do have without exaggerating overlap.',
    '10. Avoid filler phrases and generic statements. Every sentence should add meaningful information.',
    '11. Avoid repetitive sentence structures. Do NOT start every sentence or paragraph the same way.',
    '12. Use strong but natural action verbs. Avoid exaggerated or buzzword-heavy language.',
    '13. Do NOT over-explain or sound overly formal. Slight imperfection in phrasing is acceptable if it improves realism.',
    '14. Keep the closing short, warm, and sincere; not salesy or over-enthusiastic.',
    '15. Do NOT mention any file names, LaTeX, or internal tooling.',
    '16. Do NOT mention how the letter was generated.',
    '17. Return ONLY plain text paragraphs. No markdown or special formatting.',
    '18. Return strict JSON matching the schema. No commentary.'
  ].join(' ');

  const plainJobDescription = toPlainJobDescription(input.descriptionText);

  const resumeBlockTitle = input.coverLetterResumeIsTailoredVariant
    ? '--- APPLICANT RESUME (tailored for this role; source of truth for facts—do NOT mention LaTeX or file names) ---'
    : '--- APPLICANT RESUME (source of truth for facts—do NOT mention LaTeX or file names) ---';

  const resumeConsistencyNote = input.coverLetterResumeIsTailoredVariant
    ? 'This resume text is the same job-specific version the applicant is using for this application. Name the same skills, projects, and outcomes; do not add claims that are not supported there.'
    : 'Ground every technical claim in the resume and context; do not invent experience.';

  const prompt = [
    `Job title: ${input.jobTitle}`,
    `Company: ${input.companyName}`,
    `Location: ${input.location}`,
    `Addressee: ${addressee}`,
    `Date: ${dateStr}`,
    '',
    '--- ROLE AND EMPLOYER (plain text from the listing; use for substance, not for quoting the listing) ---',
    plainJobDescription,
    '',
    '--- APPLICANT BACKGROUND ---',
    `Name: ${input.applicantSummary}`,
    '',
    '--- APPLICANT CONTEXT ---',
    input.applicantContext,
    '',
    resumeBlockTitle,
    input.baseResumeTex,
    '',
    '--- TASK ---',
    `Write a cover letter body for the ${input.jobTitle} position at ${input.companyName}.`,
    `The letter is addressed to "${addressee}" and dated ${dateStr}.`,
    resumeConsistencyNote,
    'Write 3-5 paragraphs (200-350 words total).',
    'The first paragraph should express genuine interest in the role and company without formulaic openers.',
    'Middle paragraphs: concrete stories from the resume/context that fit the kind of work described for the role.',
    'If something in the listing is newer to the applicant, acknowledge learning interest and tie to the closest real experience—never fake it.',
    'The final paragraph should be a simple, human closing and openness to talk further.',
    'Return the paragraphs in the coverLetterParagraphs array.',
    'Remember: no em dashes; no references to "job description", postings, or requirements documents; no fabricated experience; humble, sincere tone.'
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
