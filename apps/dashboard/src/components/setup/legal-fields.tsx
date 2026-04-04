'use client';

import type { LegalProfile } from '@jobautomation/core';

type LegalFieldsProps = {
  defaultProfile?: LegalProfile;
};

export function LegalFields({ defaultProfile }: LegalFieldsProps) {
  const legal = defaultProfile ?? {
    backgroundCheckConsent: true,
    drugTestConsent: true,
    over18: true,
    hasCriminalRecord: false
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">Legal & Consent</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Standard employment screening questions. Your answers will be used when filling out job applications.
        </p>
      </div>

      <div className="space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="legal[over18]"
            defaultChecked={legal.over18}
            value="true"
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <div>
            <span className="font-medium">I am 18 years of age or older</span>
            <p className="text-xs text-muted-foreground">Required for most employment positions</p>
          </div>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="legal[backgroundCheckConsent]"
            defaultChecked={legal.backgroundCheckConsent}
            value="true"
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <div>
            <span className="font-medium">I consent to a background check</span>
            <p className="text-xs text-muted-foreground">
              Standard for most positions requiring verification of employment history
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="legal[drugTestConsent]"
            defaultChecked={legal.drugTestConsent}
            value="true"
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <div>
            <span className="font-medium">I consent to a drug test if required</span>
            <p className="text-xs text-muted-foreground">
              Common in safety-sensitive positions and certain industries
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="legal[hasCriminalRecord]"
            defaultChecked={legal.hasCriminalRecord}
            value="true"
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <div>
            <span className="font-medium">I have been convicted of a felony</span>
            <p className="text-xs text-muted-foreground">
              Disclosure requirements vary by jurisdiction. Check this only if applicable.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
