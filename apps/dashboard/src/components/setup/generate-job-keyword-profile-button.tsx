'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { generateJobFilterProfileAction } from '@/app/setup/actions';
import { Button } from '@/components/ui/button';
import { formatLocalDateTime, type DateInput } from '@/lib/format-local-datetime';

type Props = {
  generatedAt: DateInput;
};

export function GenerateJobKeywordProfileButton({ generatedAt }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAtLabel, setGeneratedAtLabel] = useState<string | null>(null);

  useEffect(() => {
    setGeneratedAtLabel(generatedAt != null ? formatLocalDateTime(generatedAt) : null);
  }, [generatedAt]);

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
