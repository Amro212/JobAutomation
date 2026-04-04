'use client';

import type { DemographicProfile } from '@jobautomation/core';

type DemographicFieldsProps = {
  defaultProfile?: DemographicProfile;
};

export function DemographicFields({ defaultProfile }: DemographicFieldsProps) {
  const demographic = defaultProfile ?? {
    veteranStatus: '',
    disabilityStatus: '',
    ethnicity: '',
    gender: ''
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">Voluntary Self-Identification</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These fields are optional and used for EEOC compliance on job applications. You may decline to answer any or all questions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium">Veteran status</span>
          <select
            name="demographic[veteranStatus]"
            defaultValue={demographic.veteranStatus}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Prefer not to disclose</option>
            <option value="not a veteran">I am not a veteran</option>
            <option value="veteran">I am a veteran</option>
            <option value="prefer not to disclose">Prefer not to disclose</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Disability status</span>
          <select
            name="demographic[disabilityStatus]"
            defaultValue={demographic.disabilityStatus}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Prefer not to disclose</option>
            <option value="no disability">I do not have a disability</option>
            <option value="has disability">I have a disability</option>
            <option value="prefer not to disclose">Prefer not to disclose</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Race / Ethnicity</span>
          <select
            name="demographic[ethnicity]"
            defaultValue={demographic.ethnicity}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Prefer not to disclose</option>
            <option value="prefer not to disclose">Prefer not to disclose</option>
            <option value="hispanic">Hispanic or Latino</option>
            <option value="white">White</option>
            <option value="black">Black or African American</option>
            <option value="asian">Asian</option>
            <option value="native american">American Indian or Alaska Native</option>
            <option value="pacific islander">Native Hawaiian or Pacific Islander</option>
            <option value="two or more races">Two or more races</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Gender</span>
          <select
            name="demographic[gender]"
            defaultValue={demographic.gender}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Prefer not to disclose</option>
            <option value="prefer not to disclose">Prefer not to disclose</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non-binary">Non-binary</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
    </div>
  );
}
