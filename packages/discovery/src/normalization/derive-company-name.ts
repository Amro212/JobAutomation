function titleCaseToken(value: string): string {
  if (/^[a-z]{2,3}$/i.test(value)) {
    return value.toUpperCase();
  }

  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatCompanySlug(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || ['jobs', 'job', 'careers', 'public', 'postings'].includes(trimmed.toLowerCase())) {
    return null;
  }

  const words = trimmed
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return null;
  }

  return words.map(titleCaseToken).join(' ');
}

function firstUsablePathSegment(value: string): string | null {
  try {
    const url = new URL(value);
    const segments = url.pathname.split('/').filter(Boolean);
    for (const segment of segments) {
      const formatted = formatCompanySlug(segment);
      if (formatted) {
        return formatted;
      }
    }
  } catch {
    return formatCompanySlug(value);
  }

  return null;
}

export function deriveCompanyName(input: {
  sourceUrl?: string | null;
  sourceKey?: string | null;
  fallbackLabel: string;
}): string {
  return (
    firstUsablePathSegment(input.sourceUrl ?? '') ??
    firstUsablePathSegment(input.sourceKey ?? '') ??
    input.fallbackLabel
  );
}
