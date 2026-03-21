'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { toast } from 'sonner';

import type { JobKeywordProfile, JobKeywordSeniority } from '@jobautomation/core';

import { saveJobKeywordProfileAction } from '@/app/setup/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const EMPTY_PROFILE: JobKeywordProfile = {
  target_titles: [],
  positive_keywords: [],
  negative_keywords: [],
  seniority: 'mid'
};

const SENIORITY_OPTIONS: { value: JobKeywordSeniority; label: string }[] = [
  { value: 'new_grad', label: 'New grad' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' }
];

function parseProfileJson(json: string): JobKeywordProfile {
  if (!json.trim()) {
    return { ...EMPTY_PROFILE };
  }
  try {
    const data: unknown = JSON.parse(json);
    if (
      data &&
      typeof data === 'object' &&
      Array.isArray((data as JobKeywordProfile).target_titles) &&
      Array.isArray((data as JobKeywordProfile).positive_keywords) &&
      Array.isArray((data as JobKeywordProfile).negative_keywords) &&
      typeof (data as JobKeywordProfile).seniority === 'string'
    ) {
      return data as JobKeywordProfile;
    }
  } catch {
    /* fall through */
  }
  return { ...EMPTY_PROFILE };
}

function KeywordRow({
  label,
  description,
  items,
  setDraft,
  field,
  placeholder,
  disabled
}: {
  label: string;
  description: string;
  items: string[];
  setDraft: Dispatch<SetStateAction<JobKeywordProfile>>;
  field: keyof Pick<JobKeywordProfile, 'target_titles' | 'positive_keywords' | 'negative_keywords'>;
  placeholder: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');

  function add() {
    const next = input.trim();
    if (!next) {
      return;
    }
    setDraft((prev) => {
      const list = prev[field];
      if (list.includes(next)) {
        return prev;
      }
      return { ...prev, [field]: [...list, next] };
    });
    setInput('');
  }

  function remove(index: number) {
    setDraft((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {items.map((item, index) => (
            <li key={`${field}-${index}-${item}`}>
              <Badge variant="secondary" className="gap-1 pr-1 font-normal">
                <span className="max-w-[220px] truncate" title={item}>
                  {item}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  aria-label={`Remove ${item}`}
                >
                  <X className="size-3.5" />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">None yet.</p>
      )}
      <div className="flex max-w-lg gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="text-sm"
          disabled={disabled}
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function JobKeywordProfileEditor({
  profileJson,
  hasApplicantRow
}: {
  profileJson: string;
  hasApplicantRow: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<JobKeywordProfile>(() => parseProfileJson(profileJson));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(parseProfileJson(profileJson));
  }, [profileJson]);

  async function onSave() {
    if (!hasApplicantRow) {
      toast.error('Save your applicant details in the form above first.');
      return;
    }
    setSaving(true);
    try {
      await saveJobKeywordProfileAction(draft);
      toast.success('Filter profile saved.');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save filter profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 border-t border-border pt-6">
      <div className="space-y-1">
        <p className="text-sm font-medium">Titles and keywords</p>
        <p className="text-xs text-muted-foreground">
          Matching uses case-insensitive substrings in the job title. Negative terms reject a job if they appear
          in the title.
        </p>
      </div>

      <KeywordRow
        label="Target job titles"
        description="Phrases that should appear in titles you want (e.g. software engineer)."
        items={draft.target_titles}
        setDraft={setDraft}
        field="target_titles"
        placeholder="Add a title phrase…"
        disabled={!hasApplicantRow}
      />

      <KeywordRow
        label="Positive keywords"
        description="Skills, tools, or domains you want to see in titles."
        items={draft.positive_keywords}
        setDraft={setDraft}
        field="positive_keywords"
        placeholder="Add a keyword…"
        disabled={!hasApplicantRow}
      />

      <KeywordRow
        label="Negative keywords"
        description="Words in titles that usually mean a poor fit (e.g. sales, nurse)."
        items={draft.negative_keywords}
        setDraft={setDraft}
        field="negative_keywords"
        placeholder="Add a term to avoid…"
        disabled={!hasApplicantRow}
      />

      <div className="space-y-2">
        <label htmlFor="job-filter-seniority" className="text-sm font-medium">
          Seniority (for experience parsing)
        </label>
        <p className="text-xs text-muted-foreground">
          Used with regex on the job description to drop roles that require more years than this level allows.
        </p>
        <select
          id="job-filter-seniority"
          value={draft.seniority}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, seniority: e.target.value as JobKeywordSeniority }))
          }
          disabled={!hasApplicantRow}
          className={cn(
            'flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          {SENIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSave} disabled={!hasApplicantRow || saving}>
          {saving ? 'Saving…' : 'Save filter profile'}
        </Button>
        {!hasApplicantRow ? (
          <p className="text-xs text-muted-foreground">Save applicant setup above to enable editing.</p>
        ) : null}
      </div>
    </div>
  );
}
