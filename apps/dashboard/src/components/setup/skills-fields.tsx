'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { SkillsProfile } from '@jobautomation/core';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type SkillsFieldsProps = {
  defaultSkills?: SkillsProfile;
};

export function SkillsFields({ defaultSkills }: SkillsFieldsProps) {
  const [technical, setTechnical] = useState<string[]>(defaultSkills?.technical ?? []);
  const [soft, setSoft] = useState<string[]>(defaultSkills?.soft ?? []);
  const [languages, setLanguages] = useState<string[]>(defaultSkills?.languages ?? []);
  const [languageProficiency, setLanguageProficiency] = useState<Record<string, string>>(
    defaultSkills?.languageProficiency ?? {}
  );

  const [technicalInput, setTechnicalInput] = useState('');
  const [softInput, setSoftInput] = useState('');
  const [languageInput, setLanguageInput] = useState('');

  const addTechnical = () => {
    if (technicalInput.trim() && !technical.includes(technicalInput.trim())) {
      setTechnical([...technical, technicalInput.trim()]);
      setTechnicalInput('');
    }
  };

  const removeTechnical = (skill: string) => {
    setTechnical(technical.filter((s) => s !== skill));
  };

  const addSoft = () => {
    if (softInput.trim() && !soft.includes(softInput.trim())) {
      setSoft([...soft, softInput.trim()]);
      setSoftInput('');
    }
  };

  const removeSoft = (skill: string) => {
    setSoft(soft.filter((s) => s !== skill));
  };

  const addLanguage = () => {
    if (languageInput.trim() && !languages.includes(languageInput.trim())) {
      const lang = languageInput.trim();
      setLanguages([...languages, lang]);
      setLanguageProficiency({ ...languageProficiency, [lang]: 'fluent' });
      setLanguageInput('');
    }
  };

  const removeLanguage = (lang: string) => {
    setLanguages(languages.filter((l) => l !== lang));
    const { [lang]: _, ...rest } = languageProficiency;
    setLanguageProficiency(rest);
  };

  const updateProficiency = (lang: string, proficiency: string) => {
    setLanguageProficiency({ ...languageProficiency, [lang]: proficiency });
  };

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium">Skills & Languages</h3>

      {/* Technical Skills */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">Technical skills</label>
        <div className="flex gap-2">
          <Input
            value={technicalInput}
            onChange={(e) => setTechnicalInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTechnical();
              }
            }}
            placeholder="e.g., Python, React, AWS"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addTechnical}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {technical.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-sm"
            >
              {skill}
              <button
                type="button"
                onClick={() => removeTechnical(skill)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
              <input type="hidden" name="skills[technical][]" value={skill} />
            </span>
          ))}
        </div>
      </div>

      {/* Soft Skills */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">Soft skills</label>
        <div className="flex gap-2">
          <Input
            value={softInput}
            onChange={(e) => setSoftInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSoft();
              }
            }}
            placeholder="e.g., Leadership, Communication"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addSoft}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {soft.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-1 text-sm"
            >
              {skill}
              <button
                type="button"
                onClick={() => removeSoft(skill)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
              <input type="hidden" name="skills[soft][]" value={skill} />
            </span>
          ))}
        </div>
      </div>

      {/* Languages */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">Languages</label>
        <div className="flex gap-2">
          <Input
            value={languageInput}
            onChange={(e) => setLanguageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addLanguage();
              }
            }}
            placeholder="e.g., English, Spanish"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addLanguage}>
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {languages.map((lang) => (
            <div key={lang} className="flex items-center gap-3 rounded-md border bg-card p-3">
              <span className="flex-1 text-sm font-medium">{lang}</span>
              <select
                value={languageProficiency[lang] || 'fluent'}
                onChange={(e) => updateProficiency(lang, e.target.value)}
                className="rounded-md border bg-background px-3 py-1 text-sm"
              >
                <option value="native">Native</option>
                <option value="fluent">Fluent</option>
                <option value="professional">Professional</option>
                <option value="conversational">Conversational</option>
                <option value="basic">Basic</option>
              </select>
              <button
                type="button"
                onClick={() => removeLanguage(lang)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
              <input type="hidden" name="skills[languages][]" value={lang} />
              <input
                type="hidden"
                name={`skills[languageProficiency][${lang}]`}
                value={languageProficiency[lang] || 'fluent'}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
