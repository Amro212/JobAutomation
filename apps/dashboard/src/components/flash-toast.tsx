'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

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

    if (message || error) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('message');
      params.delete('error');
      const remaining = params.toString();
      const cleanUrl = remaining ? `${window.location.pathname}?${remaining}` : window.location.pathname;
      router.replace(cleanUrl, { scroll: false });
    }
  }, [searchParams, router]);

  return null;
}
