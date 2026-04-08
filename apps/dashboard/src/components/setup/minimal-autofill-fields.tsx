'use client';

import { useMemo, useState } from 'react';
import type { MinimalAutofillProfile } from '@jobautomation/core';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const selectClassName =
  'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';

const salaryCurrencies = ['USD', 'CAD', 'EUR', 'GBP', 'AUD'];

function formatCompensation(amount: number, currency: string, period: 'yearly' | 'hourly'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(amount) + ` ${period}`;
}

export function MinimalAutofillFields({ profile }: { profile: MinimalAutofillProfile }) {
  const [requiresSponsorship, setRequiresSponsorship] = useState(profile.requiresSponsorship);
  const [workPreference, setWorkPreference] = useState(profile.workPreference);
  const [genderPronouns, setGenderPronouns] = useState(profile.genderPronouns);
  const [highestEducation, setHighestEducation] = useState(profile.highestEducation);
  const [salaryEnabled, setSalaryEnabled] = useState(
    profile.salaryExpectationAmount.trim().length > 0 || profile.salaryExpectations.trim().length > 0
  );
  const [salaryCurrency, setSalaryCurrency] = useState(profile.salaryExpectationCurrency || 'USD');
  const [salaryPeriod, setSalaryPeriod] = useState<'yearly' | 'hourly'>(
    profile.salaryExpectationPeriod === 'hourly' ? 'hourly' : 'yearly'
  );
  const [salaryAmount, setSalaryAmount] = useState(() => {
    if (profile.salaryExpectationAmount.trim().length > 0) {
      return profile.salaryExpectationAmount;
    }

    return salaryPeriod === 'hourly' ? '50' : '100000';
  });

  const salaryBounds = useMemo(() => {
    if (salaryPeriod === 'hourly') {
      return { min: 15, max: 250, step: 1 };
    }

    return { min: 30000, max: 400000, step: 5000 };
  }, [salaryPeriod]);

  const formattedSalary = formatCompensation(Number(salaryAmount), salaryCurrency, salaryPeriod);

  return (
    <div className="space-y-6 border-t pt-8">
      <div>
        <h3 className="text-lg font-semibold">Application autofill</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Save the recurring answers job applications ask most often so the automation can answer consistently later.
          Keep this factual and compact.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-2 text-sm md:col-span-2">
          <span className="font-medium">Work authorization</span>
          <p className="text-muted-foreground text-xs">
            e.g. “U.S. citizen — authorized to work in the United States without restriction.”
          </p>
          <Textarea
            name="autofill_workAuthorization"
            defaultValue={profile.workAuthorization}
            rows={3}
            placeholder="One clear sentence you would use on work authorization questions"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Requires visa sponsorship?</span>
          <select
            name="autofill_requiresSponsorship"
            value={requiresSponsorship}
            onChange={(event) => setRequiresSponsorship(event.target.value as typeof profile.requiresSponsorship)}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        {requiresSponsorship === 'yes' ? (
          <label className="space-y-2 text-sm">
            <span className="font-medium">Sponsorship required for which countries?</span>
            <Input
              name="autofill_requiresSponsorshipCountriesCsv"
              defaultValue={profile.requiresSponsorshipCountriesCsv}
              placeholder="US, CA, GB"
            />
          </label>
        ) : (
          <input type="hidden" name="autofill_requiresSponsorshipCountriesCsv" value="" />
        )}

        <label className="space-y-2 text-sm">
          <span className="font-medium">Security clearance</span>
          <select
            name="autofill_clearanceStatus"
            defaultValue={profile.clearanceStatus}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="none">None / never held</option>
            <option value="held">Held before</option>
            <option value="eligible">Eligible, not held</option>
            <option value="unsure">Unsure</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Willing to relocate?</span>
          <select name="autofill_relocation" defaultValue={profile.relocation} className={selectClassName}>
            <option value="">Not set</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Work preference</span>
          <select
            name="autofill_workPreference"
            value={workPreference}
            onChange={(event) => setWorkPreference(event.target.value as typeof profile.workPreference)}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="no_preference">No preference</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Earliest start date</span>
          <Input name="autofill_startDate" defaultValue={profile.startDate} placeholder="ASAP" />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Notice period</span>
          <select name="autofill_noticePeriod" defaultValue={profile.noticePeriod} className={selectClassName}>
            <option value="">Not set</option>
            <option value="immediate">Immediate</option>
            <option value="2_weeks">2 weeks</option>
            <option value="1_month">1 month</option>
            <option value="2_plus_months">2+ months</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Gender / pronouns</span>
          <select
            name="autofill_genderPronouns"
            value={genderPronouns}
            onChange={(event) => setGenderPronouns(event.target.value as typeof profile.genderPronouns)}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        {genderPronouns === 'custom' ? (
          <label className="space-y-2 text-sm">
            <span className="font-medium">Custom gender / pronouns</span>
            <Input
              name="autofill_genderPronounsCustom"
              defaultValue={profile.genderPronounsCustom}
              placeholder="Enter your preferred wording"
            />
          </label>
        ) : (
          <input type="hidden" name="autofill_genderPronounsCustom" value="" />
        )}

        <label className="space-y-2 text-sm">
          <span className="font-medium">Race / ethnicity</span>
          <select
            name="autofill_raceEthnicity"
            defaultValue={profile.raceEthnicity}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="hispanic_or_latino">Hispanic or Latino</option>
            <option value="white">White</option>
            <option value="black_or_african_american">Black or African American</option>
            <option value="asian">Asian</option>
            <option value="native_hawaiian_or_pacific_islander">Native Hawaiian or Pacific Islander</option>
            <option value="american_indian_or_alaska_native">American Indian or Alaska Native</option>
            <option value="two_or_more">Two or more races</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Veteran status</span>
          <select
            name="autofill_veteranStatus"
            defaultValue={profile.veteranStatus}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="not_veteran">Not a veteran</option>
            <option value="veteran">Veteran</option>
            <option value="protected_veteran">Protected veteran</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Disability status</span>
          <select
            name="autofill_disabilityStatus"
            defaultValue={profile.disabilityStatus}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="no">No</option>
            <option value="yes_prefer_not_to_specify">Yes (prefer not to specify)</option>
            <option value="yes_specific_accommodation">Yes (specific accommodation)</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Driver&apos;s license</span>
          <select name="autofill_driversLicense" defaultValue={profile.driversLicense} className={selectClassName}>
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Willing to travel</span>
          <select
            name="autofill_willingToTravel"
            defaultValue={profile.willingToTravel}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="0">0%</option>
            <option value="25">Up to 25%</option>
            <option value="50">Up to 50%</option>
            <option value="75">Up to 75%</option>
            <option value="100">100%</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Years of experience</span>
          <select
            name="autofill_yearsOfExperience"
            defaultValue={profile.yearsOfExperience}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="lt_1">Less than 1 year</option>
            <option value="1_3">1-3 years</option>
            <option value="3_5">3-5 years</option>
            <option value="5_10">5-10 years</option>
            <option value="10_plus">10+ years</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Highest education level</span>
          <select
            name="autofill_highestEducation"
            value={highestEducation}
            onChange={(event) => setHighestEducation(event.target.value as typeof profile.highestEducation)}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="high_school">High School</option>
            <option value="associate">Associate&apos;s</option>
            <option value="bachelor">Bachelor&apos;s</option>
            <option value="master">Master&apos;s</option>
            <option value="phd">PhD</option>
            <option value="trade_vocational">Trade / Vocational</option>
          </select>
        </label>

        {highestEducation ? (
          <>
            <label className="space-y-2 text-sm">
              <span className="font-medium">School</span>
              <Input
                name="autofill_highestEducationSchool"
                defaultValue={profile.highestEducationSchool}
                placeholder="University or school name"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">Program</span>
              <Input
                name="autofill_highestEducationProgram"
                defaultValue={profile.highestEducationProgram}
                placeholder="Program or degree name"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium">Discipline</span>
              <Input
                name="autofill_highestEducationDiscipline"
                defaultValue={profile.highestEducationDiscipline}
                placeholder="Major, concentration, or discipline"
              />
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="autofill_highestEducationSchool" value="" />
            <input type="hidden" name="autofill_highestEducationProgram" value="" />
            <input type="hidden" name="autofill_highestEducationDiscipline" value="" />
          </>
        )}

        <label className="space-y-2 text-sm">
          <span className="font-medium">Criminal background</span>
          <select
            name="autofill_criminalBackground"
            defaultValue={profile.criminalBackground}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
            <option value="disclose_if_required">Will disclose details if required</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Currently employed</span>
          <select
            name="autofill_currentlyEmployed"
            defaultValue={profile.currentlyEmployed}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <div className="space-y-3 rounded-lg border p-4 text-sm md:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">Salary expectations</p>
              <p className="text-muted-foreground text-xs">
                Turn this on to store an exact compensation target with currency and pay period.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={salaryEnabled}
                onChange={(event) => setSalaryEnabled(event.target.checked)}
                className="h-4 w-4"
              />
              Set amount
            </label>
          </div>

          {salaryEnabled ? (
            <>
              <input type="hidden" name="autofill_salaryExpectationEnabled" value="yes" />
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="font-medium">Currency</span>
                  <select
                    name="autofill_salaryExpectationCurrency"
                    value={salaryCurrency}
                    onChange={(event) => setSalaryCurrency(event.target.value)}
                    className={selectClassName}
                  >
                    {salaryCurrencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="font-medium">Pay period</span>
                  <select
                    name="autofill_salaryExpectationPeriod"
                    value={salaryPeriod}
                    onChange={(event) => {
                      const nextPeriod = event.target.value as 'yearly' | 'hourly';
                      setSalaryPeriod(nextPeriod);
                      setSalaryAmount(nextPeriod === 'hourly' ? '50' : '100000');
                    }}
                    className={selectClassName}
                  >
                    <option value="yearly">Yearly</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </label>

                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="text-muted-foreground text-xs">Selected target</p>
                  <p className="text-base font-semibold">{formattedSalary}</p>
                </div>
              </div>

              <label className="block space-y-3">
                <span className="font-medium">Exact amount</span>
                <input
                  type="range"
                  min={salaryBounds.min}
                  max={salaryBounds.max}
                  step={salaryBounds.step}
                  name="autofill_salaryExpectationAmount"
                  value={salaryAmount}
                  onChange={(event) => setSalaryAmount(event.target.value)}
                  className="accent-primary w-full"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatCompensation(salaryBounds.min, salaryCurrency, salaryPeriod)}</span>
                  <span>{formatCompensation(salaryBounds.max, salaryCurrency, salaryPeriod)}</span>
                </div>
              </label>
            </>
          ) : (
            <>
              <input type="hidden" name="autofill_salaryExpectationEnabled" value="" />
              <input type="hidden" name="autofill_salaryExpectationAmount" value="" />
              <input type="hidden" name="autofill_salaryExpectationCurrency" value="USD" />
              <input type="hidden" name="autofill_salaryExpectationPeriod" value="" />
            </>
          )}
        </div>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Willing to work nights / weekends</span>
          <select
            name="autofill_willingToWorkNightsWeekends"
            defaultValue={profile.willingToWorkNightsWeekends}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="occasionally">Occasionally</option>
          </select>
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium">Certifications / licenses (optional)</span>
          <Textarea
            name="autofill_certificationsLicenses"
            defaultValue={profile.certificationsLicenses}
            rows={3}
            placeholder="PMP, AWS Solutions Architect, RN license, CPA"
          />
        </label>

        <label className="space-y-2 text-sm md:col-span-2">
          <span className="font-medium">Languages spoken (optional)</span>
          <Input
            name="autofill_languagesSpoken"
            defaultValue={profile.languagesSpoken}
            placeholder="English (native), Spanish (fluent)"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="font-medium">Know someone at the company? (optional)</span>
          <select
            name="autofill_knowsSomeoneAtCompany"
            defaultValue={profile.knowsSomeoneAtCompany}
            className={selectClassName}
          >
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>
    </div>
  );
}
