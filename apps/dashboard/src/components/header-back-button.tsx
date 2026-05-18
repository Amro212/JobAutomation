'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { getBackHref } from '@/lib/navigation';

export function HeaderBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const backHref = getBackHref(pathname);

  if (!backHref) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="-ml-2 shrink-0"
      aria-label="Go back"
      onClick={() => router.push(backHref)}
    >
      <ArrowLeft />
    </Button>
  );
}
