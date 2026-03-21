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
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-medium">AI extraction</p>
        <p className="text-xs text-muted-foreground">
          Regenerate from your current summary, context, and resume text. Your manual edits below are replaced
          when you generate again.
        </p>
        {generatedAtLabel ? (
          <p className="mt-2 text-xs text-muted-foreground">Last generated: {generatedAtLabel}</p>
        ) : null}
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>
      <Button type="button" disabled={pending} onClick={onGenerate} variant="secondary" size="sm">
        {pending ? 'Generating…' : 'Generate from setup text'}
      </Button>
    </div>
  );
}
