'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ExperienceEntry } from '@jobautomation/core';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type ExperienceFieldsProps = {
  defaultEntries?: ExperienceEntry[];
};

export function ExperienceFields({ defaultEntries = [] }: ExperienceFieldsProps) {
  const [entries, setEntries] = useState<ExperienceEntry[]>(
    defaultEntries.length > 0
      ? defaultEntries
      : [
          {
            title: '',
            company: '',
            city: '',
            country: '',
            startDate: '',
            endDate: '',
            current: false,
            summary: ''
          }
        ]
  );

  const addEntry = () => {
    setEntries([
      ...entries,
      {
        title: '',
        company: '',
        city: '',
        country: '',
        startDate: '',
        endDate: '',
        current: false,
        summary: ''
      }
    ]);
  };

  const removeEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: keyof ExperienceEntry, value: string | boolean) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Work Experience</h3>
        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          <Plus className="mr-1 h-4 w-4" />
          Add experience
        </Button>
      </div>

      {entries.map((entry, index) => (
        <div key={index} className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Experience #{index + 1}
            </p>
            {entries.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeEntry(index)}
                className="h-8 w-8 p-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>

          <input type="hidden" name={`experience[${index}][title]`} value={entry.title} />
          <input type="hidden" name={`experience[${index}][company]`} value={entry.company} />
          <input type="hidden" name={`experience[${index}][city]`} value={entry.city} />
          <input type="hidden" name={`experience[${index}][country]`} value={entry.country} />
          <input type="hidden" name={`experience[${index}][startDate]`} value={entry.startDate} />
          <input type="hidden" name={`experience[${index}][endDate]`} value={entry.endDate} />
          <input type="hidden" name={`experience[${index}][current]`} value={entry.current ? 'true' : 'false'} />
          <input type="hidden" name={`experience[${index}][summary]`} value={entry.summary} />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">
                Job title <span className="text-destructive">*</span>
              </span>
              <Input
                value={entry.title}
                onChange={(e) => updateEntry(index, 'title', e.target.value)}
                placeholder="e.g., Software Engineer"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">
                Company <span className="text-destructive">*</span>
              </span>
              <Input
                value={entry.company}
                onChange={(e) => updateEntry(index, 'company', e.target.value)}
                placeholder="e.g., Tech Corp"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">City</span>
              <Input
                value={entry.city}
                onChange={(e) => updateEntry(index, 'city', e.target.value)}
                placeholder="e.g., San Francisco"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Country</span>
              <Input
                value={entry.country}
                onChange={(e) => updateEntry(index, 'country', e.target.value)}
                placeholder="e.g., USA"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Start date</span>
              <Input
                value={entry.startDate}
                onChange={(e) => updateEntry(index, 'startDate', e.target.value)}
                placeholder="e.g., Jan 2020"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">End date</span>
              <Input
                value={entry.endDate}
                onChange={(e) => updateEntry(index, 'endDate', e.target.value)}
                placeholder="e.g., Dec 2023"
                disabled={entry.current}
              />
            </label>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={entry.current}
                onChange={(e) => updateEntry(index, 'current', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>I currently work here</span>
            </label>

            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="font-medium">Job summary / Key achievements</span>
              <Textarea
                value={entry.summary}
                onChange={(e) => updateEntry(index, 'summary', e.target.value)}
                rows={3}
                placeholder="Describe your key responsibilities and achievements..."
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
