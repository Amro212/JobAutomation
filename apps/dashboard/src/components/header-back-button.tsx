'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

export function HeaderBackButton() {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="-ml-2 shrink-0"
      aria-label="Go back"
      onClick={() => router.back()}
    >
      <ArrowLeft />
    </Button>
  );
}
