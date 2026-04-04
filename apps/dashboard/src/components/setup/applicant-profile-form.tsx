import { defaultMinimalAutofillProfile, type ApplicantProfile } from '@jobautomation/core';

import { MinimalAutofillFields } from '@/components/setup/minimal-autofill-fields';
import { EducationFields } from '@/components/setup/education-fields';
import { ExperienceFields } from '@/components/setup/experience-fields';
import { SkillsFields } from '@/components/setup/skills-fields';
import { DemographicFields } from '@/components/setup/demographic-fields';
import { LegalFields } from '@/components/setup/legal-fields';
import { LocationCountryCombobox } from '@/components/jobs/location-country-combobox';
import { PhoneField } from '@/components/setup/phone-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SubmitButton } from '@/components/submit-button';

const defaultProfile: Omit<ApplicantProfile, 'updatedAt'> = {
  id: 'default',
  fullName: '',
  email: '',
  phone: '',
  location: '',
  summary: '',
  reusableContext: '',
  linkedinUrl: '',
  websiteUrl: '',
  baseResumeFileName: '',
  baseResumeTex: '',
  preferredCountries: [],
  jobKeywordProfile: null,
  jobKeywordProfileGeneratedAt: null,
  autofillProfile: defaultMinimalAutofillProfile,
  extendedProfile: null
};

export function ApplicantProfileForm({
  action,
  profile,
}: {
  action: (formData: FormData) => Promise<void>;
  profile: ApplicantProfile | null;
  saveState?: string;
}) {
  const current = profile ? { ...profile, updatedAt: undefined } : defaultProfile;

  return (
    <form action={action} className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium">Full name</span>
          <Input name="fullName" defaultValue={current.fullName} />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Email</span>
          <Input name="email" defaultValue={current.email} />
        </label>
        <div className="space-y-2 text-sm">
          <label className="font-medium" htmlFor="applicant-phone">
            Phone
          </label>
          <PhoneField id="applicant-phone" name="phone" defaultValue={current.phone} />
        </div>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Location</span>
          <Input name="location" defaultValue={current.location} />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">LinkedIn URL</span>
          <Input name="linkedinUrl" defaultValue={current.linkedinUrl} />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Website URL</span>
          <Input
            name="websiteUrl"
            defaultValue={current.websiteUrl}
            placeholder="yoursite.com or https://yoursite.com"
          />
          <span className="text-xs text-muted-foreground">
            Bare domains are saved as https automatically.
          </span>
        </label>
      </div>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Professional summary</span>
        <Textarea name="summary" defaultValue={current.summary} rows={4} />
      </label>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Reusable applicant context</span>
        <Textarea name="reusableContext" defaultValue={current.reusableContext} rows={6} />
      </label>

      <div className="space-y-2 text-sm">
        <span className="font-medium">Preferred countries for job automation</span>
        <p className="text-xs text-muted-foreground">
          Select the countries you want to target. The jobs filter will default to these when no explicit country filter is set.
        </p>
        <LocationCountryCombobox
          name="preferredCountry"
          defaultValue={current.preferredCountries}
          aria-label="Preferred countries"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <label className="space-y-2 text-sm">
          <span className="font-medium">Base resume file name</span>
          <Input name="baseResumeFileName" defaultValue={current.baseResumeFileName} />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">Upload replacement .tex source</span>
          <Input
            name="baseResumeFile"
            type="file"
            accept=".tex,text/plain"
            className="file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          />
        </label>
      </div>

      <label className="block space-y-2 text-sm">
        <span className="font-medium">Stored LaTeX source</span>
        <Textarea
          name="baseResumeTex"
          defaultValue={current.baseResumeTex}
          rows={12}
          className="font-mono text-xs"
        />
      </label>

      <MinimalAutofillFields profile={current.autofillProfile} />

      {/* Extended Profile Fields */}
      <div className="space-y-8 rounded-xl border bg-card/50 p-6">
        <div>
          <h2 className="text-lg font-semibold">Extended Profile (Optional)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add detailed education, experience, skills, and other information to enhance application automation and document generation.
          </p>
        </div>

        <EducationFields defaultEntries={current.extendedProfile?.education ?? []} />
        <ExperienceFields defaultEntries={current.extendedProfile?.experience ?? []} />
        <SkillsFields defaultSkills={current.extendedProfile?.skills} />
        <DemographicFields defaultProfile={current.extendedProfile?.demographic} />
        <LegalFields defaultProfile={current.extendedProfile?.legal} />
      </div>

      <input type="hidden" name="id" value={current.id} />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Store the canonical applicant context and base LaTeX resume source for later milestones.
        </p>
        <SubmitButton pendingText="Saving...">Save setup</SubmitButton>
      </div>
    </form>
  );
}
