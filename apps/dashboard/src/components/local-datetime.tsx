'use client';

import { useEffect, useState } from 'react';

import {
  formatLocalDateTime,
  toDateIsoString,
  type DateInput
} from '@/lib/format-local-datetime';

type LocalDateTimeProps = {
  value: DateInput;
  fallback?: string;
  className?: string;
};

export function LocalDateTime({ value, fallback = '—', className }: LocalDateTimeProps) {
  const [label, setLabel] = useState<string | null>(null);
  const iso = value != null ? toDateIsoString(value) : undefined;

  useEffect(() => {
    if (value == null) {
      setLabel(fallback);
      return;
    }

    setLabel(formatLocalDateTime(value));
  }, [value, fallback]);

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label ?? '\u00A0'}
    </time>
  );
}
