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

function linkedIconText(args: { href: string; icon: string; text: string }): string {
  return String.raw`\href{\detokenize{${args.href}}}{${args.icon}\enspace ${escapeLatex(args.text)}}`;
}

/** Header row matching the reference: email, LinkedIn, phone, location. */
export function buildCoverLetterContactRow(profile: ApplicantProfile): string {
  const parts: string[] = [];

  const email = profile.email.trim();
  if (email) {
    parts.push(linkedIconText({
      href: urlForDetokenize(`mailto:${email}`),
      icon: String.raw`\faEnvelope`,
      text: email
    }));
  }

  const linkedin = profile.linkedinUrl.trim();
  if (linkedin) {
    parts.push(linkedIconText({
      href: webHrefTarget(linkedin),
      icon: String.raw`\faLinkedin`,
      text: linkedin.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
    }));
  }

  const phone = profile.phone.trim();
  const tel = telHref(phone);
  if (tel) {
    const phoneDisplay = formatPhoneDisplay(phone);
    parts.push(linkedIconText({
      href: tel,
      icon: String.raw`\faPhone`,
      text: phoneDisplay
    }));
  }

  const location = profile.location.trim();
  if (location) {
    parts.push(String.raw`\faMapMarker\enspace ${escapeLatex(location)}`);
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
