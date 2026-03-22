import type { ApplicantProfile, JobRecord } from '@jobautomation/core';

import { escapeLatex } from '../tokens/escape-latex';

function telHref(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  return normalized.length > 0 ? `tel:${normalized}` : '';
}

/** North American 10-digit display: (xxx)-xxx-xxxx; otherwise return trimmed input. */
function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  let areaRest: string | null = null;
  if (digits.length === 10) {
    areaRest = digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    areaRest = digits.slice(1);
  }
  if (areaRest) {
    return `(${areaRest.slice(0, 3)})-${areaRest.slice(3, 6)}-${areaRest.slice(6)}`;
  }
  return phone.trim();
}

/** URL wrapped for `\detokenize{...}` (no `}` inside URL). */
function urlForDetokenize(url: string): string {
  return url.includes('}') ? url.replaceAll('}', '') : url;
}

/** Ensure PDF links resolve (hyperref expects an absolute URL for web targets). */
function webHrefTarget(url: string): string {
  const t = url.trim();
  if (t.length === 0) return t;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    return urlForDetokenize(t);
  }
  return urlForDetokenize(`https://${t.replace(/^\/+/, '')}`);
}

/**
 * Header row: email, LinkedIn, phone, portfolio (replaces map-marker / city in the reference design).
 */
export function buildCoverLetterContactRow(profile: ApplicantProfile): string {
  const parts: string[] = [];

  const email = profile.email.trim();
  if (email) {
    const mailto = `mailto:${email}`;
    parts.push(
      String.raw`\href{\detokenize{${urlForDetokenize(mailto)}}}{\faEnvelope\enspace ${escapeLatex(email)}}`
    );
  }

  const linkedin = profile.linkedinUrl.trim();
  if (linkedin) {
    parts.push(
      String.raw`\href{\detokenize{${webHrefTarget(linkedin)}}}{\faLinkedinIn\enspace ${escapeLatex('LinkedIn')}}`
    );
  }

  const phone = profile.phone.trim();
  const tel = telHref(phone);
  if (tel) {
    const phoneDisplay = formatPhoneDisplay(phone);
    parts.push(String.raw`\href{\detokenize{${tel}}}{\faPhone\enspace ${escapeLatex(phoneDisplay)}}`);
  }

  const website = profile.websiteUrl.trim();
  if (website) {
    parts.push(
      String.raw`\href{\detokenize{${webHrefTarget(website)}}}{\faGlobe\enspace ${escapeLatex('Portfolio')}}`
    );
  }

  return parts.join(String.raw`\hfill`);
}

/** Optional lines under company: Re: title, then job location. */
export function buildCoverLetterMailingLines(job: JobRecord): string {
  const lines: string[] = [];
  const title = job.title.trim();
  if (title) {
    lines.push(escapeLatex(`${title}`));
  }
  const loc = job.location.trim();
  if (loc) {
    lines.push(escapeLatex(loc));
  }
  if (lines.length === 0) {
    return '';
  }
  return `${lines.join('\\\\\n')}\\\\`;
}
