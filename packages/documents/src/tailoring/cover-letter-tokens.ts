import type { ApplicantProfile, JobRecord } from '@jobautomation/core';

import { escapeLatex } from '../tokens/escape-latex';

function linkedinDisplay(url: string): string {
  const trimmed = url.trim();
  const match = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (match) {
    try {
      const handle = decodeURIComponent(match[1]!);
      return `linkedin.com/in/${handle}`;
    } catch {
      return `linkedin.com/in/${match[1]}`;
    }
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.host.replace(/^www\./, '') || trimmed.slice(0, 56);
  } catch {
    return trimmed.slice(0, 56);
  }
}

function portfolioDisplay(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/$/, '');
    const host = parsed.host.replace(/^www\./, '');
    return path && path !== '/' ? `${host}${path}` : host;
  } catch {
    return url.trim().slice(0, 64);
  }
}

function telHref(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  return normalized.length > 0 ? `tel:${normalized}` : '';
}

/** URL wrapped for `\detokenize{...}` (no `}` inside URL). */
function urlForDetokenize(url: string): string {
  return url.includes('}') ? url.replaceAll('}', '') : url;
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
    const display = linkedinDisplay(linkedin);
    parts.push(
      String.raw`\href{\detokenize{${urlForDetokenize(linkedin)}}}{\faLinkedinIn\enspace ${escapeLatex(display)}}`
    );
  }

  const phone = profile.phone.trim();
  const tel = telHref(phone);
  if (tel) {
    parts.push(String.raw`\href{\detokenize{${tel}}}{\faPhone\enspace ${escapeLatex(phone)}}`);
  }

  const website = profile.websiteUrl.trim();
  if (website) {
    const display = portfolioDisplay(website);
    parts.push(
      String.raw`\href{\detokenize{${urlForDetokenize(website)}}}{\faGlobe\enspace ${escapeLatex(display)}}`
    );
  }

  return parts.join(String.raw`\hfill`);
}

/** Optional lines under company: Re: title, then job location. */
export function buildCoverLetterMailingLines(job: JobRecord): string {
  const lines: string[] = [];
  const title = job.title.trim();
  if (title) {
    lines.push(escapeLatex(`Re: ${title}`));
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
