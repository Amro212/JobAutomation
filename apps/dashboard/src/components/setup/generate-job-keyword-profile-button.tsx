'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { generateJobFilterProfileAction } from '@/app/setup/actions';
import { Button } from '@/components/ui/button';

type Props = {
  generatedAtLabel: string | null;
};

export function GenerateJobKeywordProfileButton({ generatedAtLabel }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setPending(true);
    setError(null);
    try {
      await generateJobFilterProfileAction();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed bg-muted/30 p-4">
      <div>
        <p className="text-sm font-medium">Job filter profile</p>
        <p className="text-xs text-muted-foreground">
          One OpenRouter call extracts titles and keywords from your setup text for fast pre-filtering before
          scoring. Filtering itself uses only string checks.
        </p>
        {generatedAtLabel ? (
          <p className="mt-2 text-xs text-muted-foreground">Last generated: {generatedAtLabel}</p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>
      <Button type="button" disabled={pending} onClick={onGenerate} variant="secondary" size="sm">
        {pending ? 'Generating…' : 'Generate job filter profile'}
      </Button>
    </div>
  );
}
