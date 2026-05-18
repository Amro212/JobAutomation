'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

function buildCleanUrl(searchParams: URLSearchParams): string | null {
  const message = searchParams.get('message');
  const error = searchParams.get('error');
  if (!message && !error) {
    return null;
  }

  const params = new URLSearchParams(searchParams.toString());
  params.delete('message');
  params.delete('error');
  const remaining = params.toString();
  return remaining
    ? `${window.location.pathname}?${remaining}`
    : window.location.pathname;
}

export function FlashToast() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const message = searchParams.get('message');
    const error = searchParams.get('error');

    if (message) {
      toast.success(message);
    }

    if (error) {
      toast.error(error);
    }

    const cleanUrl = buildCleanUrl(searchParams);
    if (!cleanUrl) {
      return;
    }

    window.history.replaceState(window.history.state, '', cleanUrl);
    router.replace(cleanUrl, { scroll: false });
  }, [searchParams, router]);

  return null;
}
