import { parseWorkAuthorizationCountriesCsv, type MinimalAutofillProfile } from '@jobautomation/core';

export type AutofillQuestionCategory =
  | 'work_authorization'
  | 'sponsorship'
  | 'clearance'
  | 'export_control'
  | 'relocation'
  | 'work_arrangement'
  | 'start_date'
  | 'privacy_consent'
  | 'accuracy_consent'
  | 'conflict_of_interest'
  | 'prior_employer'
  | 'source_referral'
  | 'voluntary_self_id'
  | 'unknown';

export type AutofillProfileContext = {
  autofill: MinimalAutofillProfile;
  summary: string;
  reusableContext: string;
};

/** Deterministic: first matching rule wins (ordered most-specific first). */
export function classifyApplicationQuestionLabel(rawLabel: string): AutofillQuestionCategory {
  const label = rawLabel.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = label.toLowerCase();

  if (
    /\beeoc\b/i.test(label) ||
    /\bvoluntary self[- ]?ident/i.test(label) ||
    /\bself[- ]?identification\b/i.test(label) ||
    /\bgender\b/i.test(lower) ||
    /\bhispanic\b/i.test(lower) ||
    /\blatino\b/i.test(lower) ||
    /\brace\b/i.test(lower) ||
    /\bethnic/i.test(lower) ||
    /\bveteran\b/i.test(lower) ||
    /\bdisability\b/i.test(lower) ||
    /\btransgender\b/i.test(lower) ||
    /\bsexual orientation\b/i.test(lower)
  ) {
    return 'voluntary_self_id';
  }

  if (/privacy notice|privacy policy|data protection|gdpr|applicant privacy/i.test(lower)) {
    return 'privacy_consent';
  }
  if (/double[- ]?check|accuracy|correctness|information (is |)true|errors or omissions/i.test(lower)) {
    return 'accuracy_consent';
  }
  if (/conflict of interest/i.test(lower)) {
    return 'conflict_of_interest';
  }
  if (/history with|previously employed|ever been employed by|worked (at|for) .*(before|previously)/i.test(lower)) {
    return 'prior_employer';
  }
  if (/how did you hear|referral|who referred|source of application/i.test(lower)) {
    return 'source_referral';
  }

  if (/export control|itar|ear|deemed export|export laws/i.test(lower)) {
    return 'export_control';
  }
  if (/clearance|security clearance|eligib(le|ility).{0,40}clearance/i.test(lower)) {
    return 'clearance';
  }
  if (/sponsor|visa|h-?1b|employment authorization|need.*work permit/i.test(lower)) {
    return 'sponsorship';
  }
  if (
    /legally authorized|lawfully authorized|work authorization|authorized to work|permit(ted)? to work/i.test(lower) ||
    /u\.s\. work authorization/i.test(lower)
  ) {
    return 'work_authorization';
  }
  if (/relocat|willing to move|open to relocation/i.test(lower)) {
    return 'relocation';
  }
  if (
    /remote|hybrid|on[- ]?site|in[- ]?person|office.{0,30}(day|time|%)/i.test(lower) ||
    /\d+%.{0,20}office/i.test(lower)
  ) {
    return 'work_arrangement';
  }
  if (/start date|earliest (you )?(can|could)|availability|when can you start/i.test(lower)) {
    return 'start_date';
  }

  return 'unknown';
}

function sponsorshipDisplayValue(profile: MinimalAutofillProfile): string | null {
  if (profile.requiresSponsorship === 'yes') {
    return 'Yes';
  }
  if (profile.requiresSponsorship === 'no') {
    return 'No';
  }
  return null;
}

function relocationDisplayValue(profile: MinimalAutofillProfile): string | null {
  if (profile.relocation === 'yes') {
    return 'Yes';
  }
  if (profile.relocation === 'no') {
    return 'No';
  }
  return null;
}

function workArrangementDisplay(profile: MinimalAutofillProfile): string | null {
  switch (profile.workPreference) {
    case 'remote':
      return 'Remote';
    case 'hybrid':
      return 'Hybrid';
    case 'onsite':
      return 'On-site';
    default:
      return null;
  }
}

function clearanceText(profile: MinimalAutofillProfile): string | null {
  switch (profile.clearanceStatus) {
    case 'none':
      return 'No — I have not held a U.S. security clearance.';
    case 'held':
      return 'Yes — I have held a U.S. security clearance in the past.';
    case 'eligible':
      return 'I am eligible for a U.S. security clearance but have not held one.';
    case 'unsure':
      return 'Unsure — please advise.';
    default:
      return null;
  }
}

function safeConsentYes(): string {
  return 'Yes';
}

function safeNoConflicts(): string {
  return 'No';
}

function priorEmployerNo(): string {
  return 'No';
}

function sourceFromContext(ctx: AutofillProfileContext): string {
  const line =
    ctx.reusableContext
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean) ?? '';
  if (line.length > 0 && line.length < 200) {
    return line;
  }
  return 'LinkedIn';
}

function unknownFallback(ctx: AutofillProfileContext): string {
  const chunk = [ctx.summary, ctx.reusableContext].join(' ').trim();
  if (chunk.length === 0) {
    return 'See resume and profile on file.';
  }
  return chunk.slice(0, 800);
}

/**
 * Resolve a display string for the control. Returns null → skip autofill (leave for review).
 * Stagehand / LLM rephrasing can wrap this later; pipeline stays deterministic here.
 */
export function resolveAutofillAnswer(
  category: AutofillQuestionCategory,
  ctx: AutofillProfileContext
): string | null {
  const { autofill: a } = ctx;

  switch (category) {
    case 'work_authorization': {
      const text = a.workAuthorization.trim();
      return text.length > 0 ? text : null;
    }
    case 'export_control': {
      const text = a.workAuthorization.trim();
      if (text.length > 0) {
        return text;
      }
      const codes = parseWorkAuthorizationCountriesCsv(a.workAuthorizationCountriesCsv);
      if (codes.includes('US')) {
        return 'U.S. person as commonly defined for export control purposes; details in work authorization statement.';
      }
      return null;
    }
    case 'sponsorship':
      return sponsorshipDisplayValue(a);
    case 'clearance':
      return clearanceText(a);
    case 'relocation':
      return relocationDisplayValue(a);
    case 'work_arrangement':
      return workArrangementDisplay(a);
    case 'start_date': {
      const d = a.startDate.trim();
      return d.length > 0 ? d : null;
    }
    case 'privacy_consent':
    case 'accuracy_consent':
      return safeConsentYes();
    case 'conflict_of_interest':
      return safeNoConflicts();
    case 'prior_employer':
      return priorEmployerNo();
    case 'source_referral':
      return sourceFromContext(ctx);
    case 'voluntary_self_id':
      return null;
    case 'unknown':
      return unknownFallback(ctx);
    default:
      return null;
  }
}
