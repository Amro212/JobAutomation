'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { EducationEntry } from '@jobautomation/core';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type EducationFieldsProps = {
  defaultEntries?: EducationEntry[];
};

export function EducationFields({ defaultEntries = [] }: EducationFieldsProps) {
  const [entries, setEntries] = useState<EducationEntry[]>(
    defaultEntries.length > 0
      ? defaultEntries
      : [
          {
            degree: '',
            field: '',
            institution: '',
            city: '',
            country: '',
            startDate: '',
            endDate: '',
            gpa: '',
            stillEnrolled: false
          }
        ]
  );

  const addEntry = () => {
    setEntries([
      ...entries,
      {
        degree: '',
        field: '',
        institution: '',
        city: '',
        country: '',
        startDate: '',
        endDate: '',
        gpa: '',
        stillEnrolled: false
      }
    ]);
  };

  const removeEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: keyof EducationEntry, value: string | boolean) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Education</h3>
        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          <Plus className="mr-1 h-4 w-4" />
          Add education
        </Button>
      </div>

      {entries.map((entry, index) => (
        <div key={index} className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Education #{index + 1}
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

          <input type="hidden" name={`education[${index}][degree]`} value={entry.degree} />
          <input type="hidden" name={`education[${index}][field]`} value={entry.field} />
          <input type="hidden" name={`education[${index}][institution]`} value={entry.institution} />
          <input type="hidden" name={`education[${index}][city]`} value={entry.city} />
          <input type="hidden" name={`education[${index}][country]`} value={entry.country} />
          <input type="hidden" name={`education[${index}][startDate]`} value={entry.startDate} />
          <input type="hidden" name={`education[${index}][endDate]`} value={entry.endDate} />
          <input type="hidden" name={`education[${index}][gpa]`} value={entry.gpa} />
          <input type="hidden" name={`education[${index}][stillEnrolled]`} value={entry.stillEnrolled ? 'true' : 'false'} />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">
                Degree <span className="text-destructive">*</span>
              </span>
              <Input
                value={entry.degree}
                onChange={(e) => updateEntry(index, 'degree', e.target.value)}
                placeholder="e.g., Bachelor of Science"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">
                Field of study <span className="text-destructive">*</span>
              </span>
              <Input
                value={entry.field}
                onChange={(e) => updateEntry(index, 'field', e.target.value)}
                placeholder="e.g., Computer Science"
              />
            </label>

            <label className="space-y-1.5 text-sm md:col-span-2">
              <span className="font-medium">
                Institution <span className="text-destructive">*</span>
              </span>
              <Input
                value={entry.institution}
                onChange={(e) => updateEntry(index, 'institution', e.target.value)}
                placeholder="e.g., University of California"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">City</span>
              <Input
                value={entry.city}
                onChange={(e) => updateEntry(index, 'city', e.target.value)}
                placeholder="e.g., Berkeley"
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
                placeholder="e.g., Sep 2018"
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">End date</span>
              <Input
                value={entry.endDate}
                onChange={(e) => updateEntry(index, 'endDate', e.target.value)}
                placeholder="e.g., May 2022"
                disabled={entry.stillEnrolled}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">GPA</span>
              <Input
                value={entry.gpa}
                onChange={(e) => updateEntry(index, 'gpa', e.target.value)}
                placeholder="e.g., 3.8"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={entry.stillEnrolled}
                onChange={(e) => updateEntry(index, 'stillEnrolled', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span>Currently enrolled</span>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
