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
    'You are a surgical resume editor for ATS and recruiters: small, honest wording and ordering changes only—never a new story.',
    'Infer high-signal phrases from THIS job description, then place them only where they match the candidate’s real expertise (Applicant Summary, Applicant Context, and existing resume text).',
    'Rules:',
    '1. Each resumeEdit.search MUST be an EXACT substring from the LaTeX resume (character-for-character inside \\begin{document}...\\end{document}).',
    '2. Each resumeEdit.replacement MUST be valid LaTeX and preserve the same structure (no extra blank lines, no new \\par, no new \\\\ line breaks).',
    '3. Do NOT add new bullets, sections, jobs, projects, employers, dates, or fabricated experience.',
    '4. Preserve every concrete detail already in the resume: proper nouns, product names, tools, workflows, outcomes, and ALL numbers (counts, percentages, dollar amounts, dates, durations). Do not remove or rewrite metrics; you may only add JD-aligned wording around them.',
    '5. Default to phrase-level edits (roughly 4-12 words) so the line still reads naturally. Avoid swapping an entire \\resumeItem{...} unless you retain almost all of the original wording and only tune a short clause.',
    '6. Each replacement must be NO SHORTER than its search string (character count). Prefer ADDING a short JD-aligned phrase beside existing facts rather than deleting nuance.',
    '7. Do NOT remove \\resumeItem lines, merge bullets, or reduce the number of bullets in any section.',
    '8. PRIMARY TARGETS (in this order): (A) the Technical Skills block—reorder, group, or add comma-separated tokens that Applicant Context or the resume already substantiates; (B) Projects section bullets—seamlessly weave JD terms that clearly match what each project already describes.',
    '9. EXPERIENCE SECTION: use at most 1–2 edits total, and only for tight in-bounds tweaks (e.g. naming an API style or stack you already used). Do NOT reframe jobs to sound like a different domain (no injecting AI/ML, labeling, annotation, “AI applications,” model training, etc.) unless Applicant Context or that bullet already establishes that work.',
    '10. At least half of your resumeEdits (round up) MUST target the Technical Skills area and/or Projects (e.g. \\section{Technical Skills} content or \\resumeItem lines under Projects). The rest may include at most the allowed Experience tweaks.',
    '11. Technical Skills: reorder lists so JD-relevant tools appear early; add a skill only when the same family of tech is already implied (coursework, shipped project, or internship stack in Context/resume). Never invent tools you cannot defend in an interview.',
    '12. resumeKeywords: return 10-15 items, ordered most-important-first—exact tool names and short phrases drawn from the posting’s requirements and responsibilities.',
    '13. Seamless bar: after edits, a reader should feel “polished for this role,” not “keyword-stuffed.” Same underlying expertise; clearer overlap with the posting.',
    '14. Make AT LEAST 4 edits and at most 9.',
    '15. Do not add vague buzzwords or domain jumps (e.g. stuffing “AI,” “annotation,” “large-scale ML”) where the source material is CMS, IT support, or generic web work unless Context explicitly ties that role to those topics.',
    '16. Return strict JSON only, no markdown or commentary.'
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
