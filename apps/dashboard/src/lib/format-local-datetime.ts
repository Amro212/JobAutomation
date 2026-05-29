export type DateInput = string | Date | null | undefined;

export function parseDateInput(value: DateInput): Date | null {
  if (value == null) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateIsoString(value: DateInput): string | undefined {
  return parseDateInput(value)?.toISOString();
}

export function formatLocalDateTime(value: DateInput): string {
  const date = parseDateInput(value);
  if (!date) {
    return value == null ? '' : String(value);
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
