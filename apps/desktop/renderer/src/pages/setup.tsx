import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { X, Sparkles, User, FileText, Check, AlertCircle } from 'lucide-react';
import { CountryCombobox, CountryMultiCombobox } from '@/components/country-combobox';
import {
  FILTER_COUNTRIES,
  defaultEmailVerificationConfig,
  defaultMinimalAutofillProfile,
  type ApplicantProfile,
  type JobKeywordProfile,
  type JobKeywordSeniority
} from '@jobautomation/core';

import {
  getApplicantProfile,
  saveApplicantProfile,
  generateApplicantJobKeywordProfile
} from '@renderer/lib/api';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';

const salaryCurrencies = ['USD', 'CAD', 'EUR', 'GBP', 'AUD'];

/** Split a comma-separated string of ISO country codes into a trimmed array. */
function parseCountriesCsv(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  emailVerification: defaultEmailVerificationConfig
};

const SENIORITY_OPTIONS: { value: JobKeywordSeniority; label: string }[] = [
  { value: 'new_grad', label: 'New grad' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' }
];

export function SetupPage() {
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [readiness, setReadiness] = useState<{
    hasBaseResume: boolean;
    hasReusableContext: boolean;
    readyForTailoring: boolean;
  } | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [reusableContext, setReusableContext] = useState('');
  const [baseResumeFileName, setBaseResumeFileName] = useState('');
  const [baseResumeTex, setBaseResumeTex] = useState('');

  // Autofill states
  const [currentCountryCode, setCurrentCountryCode] = useState('');
  const [primaryCitizenshipCountryCode, setPrimaryCitizenshipCountryCode] = useState('');
  const [currentCountryResidenceStatus, setCurrentCountryResidenceStatus] = useState('');
  const [currentCountryResidenceStatusOther, setCurrentCountryResidenceStatusOther] = useState('');
  const [legallyAuthorizedInCurrentCountry, setLegallyAuthorizedInCurrentCountry] = useState('');
  const [needsSponsorshipInCurrentCountry, setNeedsSponsorshipInCurrentCountry] = useState('');
  const [consentToInterviewRecording, setConsentToInterviewRecording] = useState('');
  const [acceptApplicationPrivacyNotices, setAcceptApplicationPrivacyNotices] = useState('');
  const [consentToDemographicDataProcessing, setConsentToDemographicDataProcessing] = useState('');
  const [lgbtqiaCommunityIdentification, setLgbtqiaCommunityIdentification] = useState('');
  const [requiresSponsorship, setRequiresSponsorship] = useState('');
  const [requiresSponsorshipCountriesCsv, setRequiresSponsorshipCountriesCsv] = useState('');
  const [clearanceStatus, setClearanceStatus] = useState('');
  const [relocation, setRelocation] = useState('');
  const [workPreference, setWorkPreference] = useState('');
  const [startDate, setStartDate] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('');
  const [genderPronouns, setGenderPronouns] = useState('');
  const [genderPronounsCustom, setGenderPronounsCustom] = useState('');
  const [raceEthnicity, setRaceEthnicity] = useState('');
  const [veteranStatus, setVeteranStatus] = useState('');
  const [disabilityStatus, setDisabilityStatus] = useState('');
  const [driversLicense, setDriversLicense] = useState('');
  const [willingToTravel, setWillingToTravel] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [highestEducation, setHighestEducation] = useState('');
  const [highestEducationSchool, setHighestEducationSchool] = useState('');
  const [highestEducationProgram, setHighestEducationProgram] = useState('');
  const [highestEducationDiscipline, setHighestEducationDiscipline] = useState('');
  const [highestEducationStartYear, setHighestEducationStartYear] = useState('');
  const [highestEducationEndYear, setHighestEducationEndYear] = useState('');
  const [criminalBackground, setCriminalBackground] = useState('');
  const [currentlyEmployed, setCurrentlyEmployed] = useState('');
  const [willingToWorkNightsWeekends, setWillingToWorkNightsWeekends] = useState('');
  const [certificationsLicenses, setCertificationsLicenses] = useState('');
  const [languagesSpoken, setLanguagesSpoken] = useState('');
  const [knowsSomeoneAtCompany, setKnowsSomeoneAtCompany] = useState('');

  // Salary Expectations
  const [salaryEnabled, setSalaryEnabled] = useState(false);
  const [salaryCurrency, setSalaryCurrency] = useState('USD');
  const [salaryPeriod, setSalaryPeriod] = useState<'yearly' | 'hourly'>('yearly');
  const [salaryAmount, setSalaryAmount] = useState('100000');

  // Verification details
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);
  const [gmailUserEmail, setGmailUserEmail] = useState('');
  const [gmailClientId, setGmailClientId] = useState('');
  const [gmailClientSecret, setGmailClientSecret] = useState('');
  const [gmailRefreshToken, setGmailRefreshToken] = useState('');

  // Keyword Profile states
  const [keywordProfile, setKeywordProfile] = useState<JobKeywordProfile | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [isSavingKeywords, setIsSavingKeywords] = useState(false);

  // Keyword List Draft States
  const [newTitle, setNewTitle] = useState('');
  const [newPositive, setNewPositive] = useState('');
  const [newMustHave, setNewMustHave] = useState('');
  const [newNiceToHave, setNewNiceToHave] = useState('');
  const [newNegative, setNewNegative] = useState('');
  const [newRoleTerm, setNewRoleTerm] = useState('');

  const [savingSetup, setSavingSetup] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await getApplicantProfile();
      setProfile(res.profile);
      setReadiness(res.readiness);

      const cur = res.profile ?? defaultProfile;
      setFullName(cur.fullName);
      setEmail(cur.email);
      setPhone(cur.phone);
      setLocation(cur.location);
      setLinkedinUrl(cur.linkedinUrl);
      setWebsiteUrl(cur.websiteUrl);
      setSummary(cur.summary);
      setReusableContext(cur.reusableContext);
      setBaseResumeFileName(cur.baseResumeFileName);
      setBaseResumeTex(cur.baseResumeTex);

      // Autofill fields loading
      const ap = cur.autofillProfile ?? defaultMinimalAutofillProfile;
      setCurrentCountryCode(ap.currentCountryCode);
      setPrimaryCitizenshipCountryCode(ap.primaryCitizenshipCountryCode);
      setCurrentCountryResidenceStatus(ap.currentCountryResidenceStatus);
      setCurrentCountryResidenceStatusOther(ap.currentCountryResidenceStatusOther);
      setLegallyAuthorizedInCurrentCountry(ap.legallyAuthorizedInCurrentCountry);
      setNeedsSponsorshipInCurrentCountry(ap.needsSponsorshipInCurrentCountry);
      setConsentToInterviewRecording(ap.consentToInterviewRecording);
      setAcceptApplicationPrivacyNotices(ap.acceptApplicationPrivacyNotices);
      setConsentToDemographicDataProcessing(ap.consentToDemographicDataProcessing);
      setLgbtqiaCommunityIdentification(ap.lgbtqiaCommunityIdentification);
      setRequiresSponsorship(ap.requiresSponsorship);
      setRequiresSponsorshipCountriesCsv(ap.requiresSponsorshipCountriesCsv);
      setClearanceStatus(ap.clearanceStatus);
      setRelocation(ap.relocation);
      setWorkPreference(ap.workPreference);
      setStartDate(ap.startDate);
      setNoticePeriod(ap.noticePeriod);
      setGenderPronouns(ap.genderPronouns);
      setGenderPronounsCustom(ap.genderPronounsCustom);
      setRaceEthnicity(ap.raceEthnicity);
      setVeteranStatus(ap.veteranStatus);
      setDisabilityStatus(ap.disabilityStatus);
      setDriversLicense(ap.driversLicense);
      setWillingToTravel(ap.willingToTravel);
      setYearsOfExperience(ap.yearsOfExperience);
      setHighestEducation(ap.highestEducation);
      setHighestEducationSchool(ap.highestEducationSchool);
      setHighestEducationProgram(ap.highestEducationProgram);
      setHighestEducationDiscipline(ap.highestEducationDiscipline);
      setHighestEducationStartYear(ap.highestEducationStartYear);
      setHighestEducationEndYear(ap.highestEducationEndYear);
      setCriminalBackground(ap.criminalBackground);
      setCurrentlyEmployed(ap.currentlyEmployed);
      setWillingToWorkNightsWeekends(ap.willingToWorkNightsWeekends);
      setCertificationsLicenses(ap.certificationsLicenses);
      setLanguagesSpoken(ap.languagesSpoken);
      setKnowsSomeoneAtCompany(ap.knowsSomeoneAtCompany);

      setSalaryEnabled(
        ap.salaryExpectationAmount.trim().length > 0 || ap.salaryExpectations.trim().length > 0
      );
      setSalaryCurrency(ap.salaryExpectationCurrency || 'USD');
      setSalaryPeriod(ap.salaryExpectationPeriod === 'hourly' ? 'hourly' : 'yearly');
      setSalaryAmount(ap.salaryExpectationAmount || '100000');

      // Verification Loading
      const ev = cur.emailVerification ?? defaultEmailVerificationConfig;
      setEmailVerificationEnabled(ev.enabled);
      setGmailUserEmail(ev.gmailUserEmail);
      setGmailClientId(ev.gmailClientId);
      setGmailClientSecret(ev.gmailClientSecret);
      setGmailRefreshToken(ev.gmailRefreshToken);

      // Keyword Profile
      setKeywordProfile(cur.jobKeywordProfile);
      setGeneratedAt(
        cur.jobKeywordProfileGeneratedAt
          ? new Date(cur.jobKeywordProfileGeneratedAt).toLocaleString()
          : null
      );
    } catch {
      toast.error('Failed to load profile.');
    }
  };

  useEffect(() => {
    void fetchProfile();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setBaseResumeFileName(file.name);
        setBaseResumeTex(text);
        toast.success(`Loaded LaTeX base resume: ${file.name}`);
      };
      reader.readAsText(file);
    }
  };

  const salaryBounds = useMemo(() => {
    if (salaryPeriod === 'hourly') {
      return { min: 15, max: 250, step: 1 };
    }
    return { min: 30000, max: 400000, step: 5000 };
  }, [salaryPeriod]);

  const formattedSalary = useMemo(() => {
    const amt = Number(salaryAmount) || 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: salaryCurrency,
      maximumFractionDigits: 0
    }).format(amt) + ` ${salaryPeriod}`;
  }, [salaryAmount, salaryCurrency, salaryPeriod]);

  const handleSaveSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSetup(true);

    try {
      const payload: Omit<ApplicantProfile, 'updatedAt'> = {
        id: profile?.id ?? 'default',
        fullName,
        email,
        phone,
        location,
        summary,
        reusableContext,
        linkedinUrl,
        websiteUrl,
        baseResumeFileName,
        baseResumeTex,
        preferredCountries: profile?.preferredCountries ?? [],
        jobKeywordProfile: keywordProfile,
        jobKeywordProfileGeneratedAt: profile?.jobKeywordProfileGeneratedAt ?? null,
        autofillProfile: {
          currentCountryCode,
          primaryCitizenshipCountryCode,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentCountryResidenceStatus: currentCountryResidenceStatus as any,
          currentCountryResidenceStatusOther,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          legallyAuthorizedInCurrentCountry: legallyAuthorizedInCurrentCountry as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          needsSponsorshipInCurrentCountry: needsSponsorshipInCurrentCountry as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          consentToInterviewRecording: consentToInterviewRecording as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          acceptApplicationPrivacyNotices: acceptApplicationPrivacyNotices as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          consentToDemographicDataProcessing: consentToDemographicDataProcessing as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lgbtqiaCommunityIdentification: lgbtqiaCommunityIdentification as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          requiresSponsorship: requiresSponsorship as any,
          requiresSponsorshipCountriesCsv,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          clearanceStatus: clearanceStatus as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          relocation: relocation as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          workPreference: workPreference as any,
          startDate,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          noticePeriod: noticePeriod as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          genderPronouns: genderPronouns as any,
          genderPronounsCustom,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          raceEthnicity: raceEthnicity as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          veteranStatus: veteranStatus as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          disabilityStatus: disabilityStatus as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          driversLicense: driversLicense as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          willingToTravel: willingToTravel as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          yearsOfExperience: yearsOfExperience as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          highestEducation: highestEducation as any,
          highestEducationSchool,
          highestEducationProgram,
          highestEducationDiscipline,
          highestEducationStartYear,
          highestEducationEndYear,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          criminalBackground: criminalBackground as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentlyEmployed: currentlyEmployed as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          willingToWorkNightsWeekends: willingToWorkNightsWeekends as any,
          certificationsLicenses,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          knowsSomeoneAtCompany: knowsSomeoneAtCompany as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          salaryExpectationEnabled: (salaryEnabled ? 'yes' : '') as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          salaryExpectationAmount: (salaryEnabled ? salaryAmount : '') as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          salaryExpectationCurrency: (salaryEnabled ? salaryCurrency : 'USD') as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          salaryExpectationPeriod: (salaryEnabled ? salaryPeriod : '') as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          salaryExpectations: (salaryEnabled ? formattedSalary : '') as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          workAuthorizationCountriesCsv: '' as any
        } as any,

        emailVerification: {
          enabled: emailVerificationEnabled,
          provider: 'gmail_oauth',
          gmailUserEmail: gmailUserEmail.trim(),
          gmailClientId: gmailClientId.trim(),
          gmailClientSecret: gmailClientSecret.trim(),
          gmailRefreshToken: gmailRefreshToken.trim()
        }
      };

      const updated = await saveApplicantProfile(payload);
      toast.success('Applicant setup saved successfully.');
      setProfile(updated);
      setReadiness({
        hasBaseResume: updated.baseResumeTex.trim().length > 0,
        hasReusableContext: updated.reusableContext.trim().length > 0,
        readyForTailoring: updated.baseResumeTex.trim().length > 0 && updated.reusableContext.trim().length > 0
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save setup.');
    } finally {
      setSavingSetup(false);
    }
  };

  const handleGenerateKeywords = async () => {
    setIsGeneratingKeywords(true);
    try {
      const updated = await generateApplicantJobKeywordProfile();
      setProfile(updated);
      setKeywordProfile(updated.jobKeywordProfile);
      setGeneratedAt(
        updated.jobKeywordProfileGeneratedAt
          ? new Date(updated.jobKeywordProfileGeneratedAt).toLocaleString()
          : null
      );
      toast.success('AI extracted job filters successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const handleSaveKeywords = async () => {
    if (!profile) {
      toast.error('Save your main applicant setup first.');
      return;
    }
    setIsSavingKeywords(true);
    try {
      const payload: Omit<ApplicantProfile, 'updatedAt'> = {
        ...profile,
        jobKeywordProfile: keywordProfile
      };
      const updated = await saveApplicantProfile(payload);
      setProfile(updated);
      setKeywordProfile(updated.jobKeywordProfile);
      toast.success('Job filter profile saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save keywords.');
    } finally {
      setIsSavingKeywords(false);
    }
  };

  const addKeyword = (field: keyof JobKeywordProfile, text: string, clearFn: () => void) => {
    const val = text.trim();
    if (!val || !keywordProfile) return;
    const currentList = (keywordProfile[field] as string[]) || [];
    if (currentList.includes(val)) return;

    setKeywordProfile({
      ...keywordProfile,
      [field]: [...currentList, val]
    });
    clearFn();
  };

  const removeKeyword = (field: keyof JobKeywordProfile, index: number) => {
    if (!keywordProfile) return;
    const currentList = (keywordProfile[field] as string[]) || [];
    setKeywordProfile({
      ...keywordProfile,
      [field]: currentList.filter((_, i) => i !== index)
    });
  };

  const selectClassName =
    'flex h-10 w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:opacity-50 text-foreground font-medium';

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-16">
      {/* Header Banner */}
      <section className="p-8 rounded-[2rem] border border-border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center gap-3 text-primary mb-2">
          <User className="size-5" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest font-label">Milestone setup</span>
        </div>
        <h1 className="text-3xl font-headline tracking-wide text-foreground">Applicant Context & Base Resume</h1>
        <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
          Configure the core metadata used to customize job applications. The system uses your LaTeX base resume and professional context to tailor documents for targeted positions in real time.
        </p>

        {readiness ? (
          <div className="mt-6 grid gap-4 grid-cols-1 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background/50 p-4 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground/75 uppercase tracking-wide font-label">Base Resume</p>
                <p className="text-xs font-semibold text-foreground mt-1">{baseResumeFileName || 'None uploaded'}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider ${readiness.hasBaseResume ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20'}`}>
                {readiness.hasBaseResume ? 'Active' : 'Missing'}
              </span>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground/75 uppercase tracking-wide font-label">Context Block</p>
                <p className="text-xs font-semibold text-foreground mt-1">{summary.trim() ? 'Stored context' : 'No context'}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider ${readiness.hasReusableContext ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20'}`}>
                {readiness.hasReusableContext ? 'Active' : 'Missing'}
              </span>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground/75 uppercase tracking-wide font-label">Automation Readiness</p>
                <p className="text-xs font-semibold text-foreground mt-1">{readiness.readyForTailoring ? 'Document generator operational' : 'Incomplete context'}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider ${readiness.readyForTailoring ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'}`}>
                {readiness.readyForTailoring ? 'Operational' : 'Needs Config'}
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {/* Main Settings Form */}
      <form onSubmit={handleSaveSetup} className="space-y-8 rounded-[2rem] border border-border bg-card p-8 shadow-sm">
        <h2 className="text-xl font-headline border-b border-border pb-3 text-foreground flex items-center gap-2">
          <User className="size-5 text-primary" />
          Applicant Particulars
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
            Full Name
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
            Email Address
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane.doe@example.com" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
            Phone Number
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 019-2834" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
            Location
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="San Francisco, CA" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
            LinkedIn Profile URL
            <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="linkedin.com/in/janedoe" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
          </label>
          <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
            Personal Website / Portfolio
            <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="janedoe.dev" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
          </label>
        </div>

        <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
          Professional Bio Summary
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={4}
            placeholder="A brief executive summary of your background, industry, and core strengths."
            className="flex w-full rounded-xl border border-border bg-background/50 p-3 text-xs ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 text-foreground font-medium"
          />
        </label>

        <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
          Reusable Document context Block
          <textarea
            value={reusableContext}
            onChange={(e) => setReusableContext(e.target.value)}
            rows={6}
            placeholder="Detailed details, project summaries, system tools, and detailed background info. The AI will weave elements of this context block to answer complex, off-target questions on forms."
            className="flex w-full rounded-xl border border-border bg-background/50 p-3 text-xs ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 text-foreground font-medium"
          />
        </label>

        {/* LaTeX Resume block */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2 font-label">
            <FileText className="size-4 text-primary" />
            LaTeX Resume Framework
          </h3>
          <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Canonical TeX Filename
              <Input value={baseResumeFileName} onChange={(e) => setBaseResumeFileName(e.target.value)} placeholder="resume.tex" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
            </label>
            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Parse Local LaTeX File
              <input
                type="file"
                accept=".tex,text/plain"
                onChange={handleFileUpload}
                className="flex h-10 w-full rounded-xl border border-dashed border-border bg-background/20 px-3 py-1.5 text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-[10px] file:font-medium file:text-primary file:uppercase hover:file:bg-primary/20 cursor-pointer"
              />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
            Raw TeX Source
            <textarea
              value={baseResumeTex}
              onChange={(e) => setBaseResumeTex(e.target.value)}
              rows={12}
              placeholder="\documentclass{article} ... \begin{document} ..."
              className="flex w-full rounded-xl border border-border bg-background p-4 text-[11px] font-mono leading-relaxed placeholder:text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 text-foreground"
            />
          </label>
        </div>

        {/* Application Autofill Parameters */}
        <div className="space-y-6 pt-6 border-t border-border">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground font-label">Default Application Responses</h3>
            <p className="text-muted-foreground/75 text-xs font-semibold uppercase tracking-wider">Configure recurring answers for rapid forms auto-filling</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Current Residence Country
              <CountryCombobox
                value={currentCountryCode}
                onValueChange={setCurrentCountryCode}
                triggerClassName="h-10 text-xs bg-background/50 rounded-xl border-border"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Citizenship Country
              <CountryCombobox
                value={primaryCitizenshipCountryCode}
                onValueChange={setPrimaryCitizenshipCountryCode}
                triggerClassName="h-10 text-xs bg-background/50 rounded-xl border-border"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Visa Status In Residence Country
              <select value={currentCountryResidenceStatus} onChange={(e) => setCurrentCountryResidenceStatus(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="citizen">Citizen</option>
                <option value="permanent_resident">Permanent Resident</option>
                <option value="temporary_resident">Temporary Resident</option>
                <option value="open_work_permit">Open Work Permit</option>
                <option value="employer_specific_work_visa">Employer Visa</option>
                <option value="student_visa">Student Visa</option>
                <option value="other">Other</option>
              </select>
            </label>

            {currentCountryResidenceStatus === 'other' ? (
              <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                Visa Description
                <Input value={currentCountryResidenceStatusOther} onChange={(e) => setCurrentCountryResidenceStatusOther(e.target.value)} placeholder="Specify visa details" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
              </label>
            ) : null}

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Authorized To Work In Residence Country?
              <select value={legallyAuthorizedInCurrentCountry} onChange={(e) => setLegallyAuthorizedInCurrentCountry(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Requires Sponsorship In Residence Country?
              <select value={needsSponsorshipInCurrentCountry} onChange={(e) => setNeedsSponsorshipInCurrentCountry(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Requires Global Sponsorship?
              <select value={requiresSponsorship} onChange={(e) => setRequiresSponsorship(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>

            {requiresSponsorship === 'yes' ? (
              <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                Target Countries for Sponsorship
                <CountryMultiCombobox
                  value={parseCountriesCsv(requiresSponsorshipCountriesCsv)}
                  onValueChange={(codes) => setRequiresSponsorshipCountriesCsv(codes.join(', '))}
                  triggerClassName="h-10 text-xs bg-background/50 rounded-xl border-border"
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Clearance Level
              <select value={clearanceStatus} onChange={(e) => setClearanceStatus(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="none">None</option>
                <option value="held">Previously Held</option>
                <option value="eligible">Eligible / Active</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Relocation Preference
              <select value={relocation} onChange={(e) => setRelocation(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Work Location Style
              <select value={workPreference} onChange={(e) => setWorkPreference(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="no_preference">No Preference</option>
                <option value="remote">Remote Only</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Available Start Date
              <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="ASAP / 2 weeks notice" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Notice Period
              <select value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="immediate">Immediate</option>
                <option value="2_weeks">2 Weeks</option>
                <option value="1_month">1 Month</option>
                <option value="2_plus_months">2+ Months</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Pronouns
              <select value={genderPronouns} onChange={(e) => setGenderPronouns(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="male">He/Him</option>
                <option value="female">She/Her</option>
                <option value="non_binary">They/Them</option>
                <option value="custom">Custom</option>
                <option value="prefer_not_to_say">Decline to Self-ID</option>
              </select>
            </label>

            {genderPronouns === 'custom' ? (
              <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                Custom Pronouns Wording
                <Input value={genderPronounsCustom} onChange={(e) => setGenderPronounsCustom(e.target.value)} placeholder="e.g. Ze/Zir" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
              </label>
            ) : null}

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Education Level
              <select value={highestEducation} onChange={(e) => setHighestEducation(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="high_school">High School</option>
                <option value="associate">Associate's Degree</option>
                <option value="bachelor">Bachelor's Degree</option>
                <option value="master">Master's Degree</option>
                <option value="phd">PhD</option>
                <option value="trade_vocational">Vocational</option>
              </select>
            </label>

            {highestEducation ? (
              <>
                <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                  School Name
                  <Input value={highestEducationSchool} onChange={(e) => setHighestEducationSchool(e.target.value)} placeholder="MIT" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                  Degree Program
                  <Input value={highestEducationProgram} onChange={(e) => setHighestEducationProgram(e.target.value)} placeholder="B.S. Computer Science" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                  Start Year
                  <Input value={highestEducationStartYear} onChange={(e) => setHighestEducationStartYear(e.target.value)} placeholder="2020" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                  End Year / Target Graduation
                  <Input value={highestEducationEndYear} onChange={(e) => setHighestEducationEndYear(e.target.value)} placeholder="2024" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
                </label>
              </>
            ) : null}

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Years of Professional Experience
              <select value={yearsOfExperience} onChange={(e) => setYearsOfExperience(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="lt_1">Under 1 Year</option>
                <option value="1_3">1-3 Years</option>
                <option value="3_5">3-5 Years</option>
                <option value="5_10">5-10 Years</option>
                <option value="10_plus">10+ Years</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
              Employment Status
              <select value={currentlyEmployed} onChange={(e) => setCurrentlyEmployed(e.target.value)} className={selectClassName}>
                <option value="">Not set</option>
                <option value="yes">Employed</option>
                <option value="no">Unemployed</option>
              </select>
            </label>
          </div>

          {/* Salary Expectation slider */}
          <div className="space-y-4 rounded-2xl border border-border bg-background/30 p-5 mt-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-foreground uppercase tracking-wide font-label">
                <input type="checkbox" checked={salaryEnabled} onChange={(e) => setSalaryEnabled(e.target.checked)} className="h-4 w-4 rounded border border-border bg-background text-primary focus:ring-primary" />
                Declare Compensation Target
              </label>
              {salaryEnabled ? (
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">{formattedSalary}</span>
              ) : null}
            </div>

            {salaryEnabled ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide font-label">
                    Currency
                    <select value={salaryCurrency} onChange={(e) => setSalaryCurrency(e.target.value)} className={selectClassName}>
                      {salaryCurrencies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide font-label">
                    Period
                    <select value={salaryPeriod} onChange={(e) => {
                      const next = e.target.value as 'hourly' | 'yearly';
                      setSalaryPeriod(next);
                      setSalaryAmount(next === 'hourly' ? '50' : '100000');
                    }} className={selectClassName}>
                      <option value="yearly">Yearly</option>
                      <option value="hourly">Hourly</option>
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide font-label">
                  Expectation Amount
                  <input type="range" min={salaryBounds.min} max={salaryBounds.max} step={salaryBounds.step} value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)} className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-primary" />
                  <div className="flex justify-between text-[10px] text-muted-foreground/75 font-semibold font-label">
                    <span>min</span>
                    <span>max</span>
                  </div>
                </label>
              </div>
            ) : null}
          </div>
        </div>

        {/* Gmail OAuth Verification */}
        <section className="space-y-4 rounded-2xl border border-border bg-background/30 p-5 mt-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground font-label">Gmail OAuth Verification Retrieval</h3>
            <p className="text-muted-foreground/75 text-[10px] font-semibold uppercase tracking-wide font-label">
              Optional. Enable when Greenhouse requires real-time email security codes check.
            </p>
          </div>

          <label className="flex items-center gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide font-label">
            <input type="checkbox" checked={emailVerificationEnabled} onChange={(e) => setEmailVerificationEnabled(e.target.checked)} className="h-4 w-4 rounded border border-border bg-background text-primary focus:ring-primary" />
            Enable Automated Gmail Sync
          </label>

          {emailVerificationEnabled ? (
            <div className="grid gap-4 md:grid-cols-2 mt-2">
              <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                Gmail Address
                <Input value={gmailUserEmail} onChange={(e) => setGmailUserEmail(e.target.value)} placeholder="user@gmail.com" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                Google OAuth Client ID
                <Input value={gmailClientId} onChange={(e) => setGmailClientId(e.target.value)} placeholder="client-id..." className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                Client Secret
                <Input type="password" value={gmailClientSecret} onChange={(e) => setGmailClientSecret(e.target.value)} placeholder="••••••••" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
              </label>
              <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                Refresh Token
                <Input type="password" value={gmailRefreshToken} onChange={(e) => setGmailRefreshToken(e.target.value)} placeholder="••••••••" className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
              </label>
            </div>
          ) : null}
        </section>

        {/* Submit Actions */}
        <div className="flex items-center justify-between pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground font-medium">Save canonical details before generating AI keyword filters.</p>
          <Button variant="default" type="submit" disabled={savingSetup}>
            {savingSetup ? 'Saving Setup...' : 'Save Configuration'}
          </Button>
        </div>
      </form>

      {/* AI Keywords builder section */}
      {profile ? (
        <section className="space-y-6 rounded-[2rem] border border-border bg-card p-8 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-xl font-headline text-foreground flex items-center gap-2">
              <Sparkles className="size-5 text-primary animate-pulse" />
              AI Keywords Filter Profile
            </h2>
            <p className="text-muted-foreground text-xs">
              Pre-filters matching jobs locally to only focus autopilot on target roles. You can trigger AI extraction or add manually.
            </p>
          </div>

          {/* AI Generator banner */}
          <div className="space-y-3 rounded-2xl border border-dashed border-border bg-background/20 p-5">
            <div>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide font-label">Extract Keywords with AI</p>
              <p className="text-xs text-muted-foreground/75 mt-1">
                Reads your bio summary, context blocks, and LaTeX resume to build highly customized match keywords.
              </p>
              {generatedAt ? (
                <p className="mt-2 text-[10px] text-primary font-semibold uppercase tracking-wider font-label">Last Sync: {generatedAt}</p>
              ) : null}
            </div>
            <Button variant="secondary" type="button" onClick={() => void handleGenerateKeywords()} disabled={isGeneratingKeywords}>
              {isGeneratingKeywords ? 'Extracting via LLM...' : 'Regenerate Filter profile'}
            </Button>
          </div>

          {keywordProfile ? (
            <div className="space-y-8 pt-4">
              <h3 className="text-lg font-headline text-foreground border-b border-border pb-2">Modify Search Target Matrix</h3>

              {/* Seniority */}
              <div className="grid gap-6 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                  Target Career Seniority
                  <select value={keywordProfile.seniority} onChange={(e) => setKeywordProfile({ ...keywordProfile, seniority: e.target.value as JobKeywordSeniority })} className={selectClassName}>
                    {SENIORITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide font-label">
                  Max Required Experience Years
                  <Input type="number" min={0} max={20} value={keywordProfile.max_required_years ?? ''} onChange={(e) => setKeywordProfile({ ...keywordProfile, max_required_years: e.target.value.trim() === '' ? null : Number(e.target.value) })} className="h-10 text-xs text-foreground bg-background/50 rounded-xl border-border" />
                </label>
              </div>

              {/* Keyword Lists */}
              <div className="space-y-6">
                {/* Target Titles */}
                <KeywordList
                  label="Target Job Titles"
                  desc="Target titles autopilot should search for (e.g. software engineer)."
                  items={keywordProfile.target_titles}
                  newValue={newTitle}
                  setNewValue={setNewTitle}
                  onAdd={() => addKeyword('target_titles', newTitle, () => setNewTitle(''))}
                  onRemove={(index) => removeKeyword('target_titles', index)}
                />

                {/* Positive Keywords */}
                <KeywordList
                  label="Core Positive Keywords"
                  desc="Profile-defining technologies, frameworks, and tools (e.g. react, typescript)."
                  items={keywordProfile.positive_keywords}
                  newValue={newPositive}
                  setNewValue={setNewPositive}
                  onAdd={() => addKeyword('positive_keywords', newPositive, () => setNewPositive(''))}
                  onRemove={(index) => removeKeyword('positive_keywords', index)}
                />

                {/* Must Have Match Keywords */}
                <KeywordList
                  label="Must-Have Match Keywords"
                  desc="Critical technical competencies that must be present in job descriptions."
                  items={keywordProfile.must_have_keywords ?? []}
                  newValue={newMustHave}
                  setNewValue={setNewMustHave}
                  onAdd={() => addKeyword('must_have_keywords', newMustHave, () => setNewMustHave(''))}
                  onRemove={(index) => removeKeyword('must_have_keywords', index)}
                />

                {/* Nice To Have Match Keywords */}
                <KeywordList
                  label="Nice-to-Have Match Keywords"
                  desc="Skills that are positive but optional."
                  items={keywordProfile.nice_to_have_keywords ?? []}
                  newValue={newNiceToHave}
                  setNewValue={setNewNiceToHave}
                  onAdd={() => addKeyword('nice_to_have_keywords', newNiceToHave, () => setNewNiceToHave(''))}
                  onRemove={(index) => removeKeyword('nice_to_have_keywords', index)}
                />

                {/* Negative Keywords */}
                <KeywordList
                  label="Negative Title Filters"
                  desc="Words in titles to automatically reject (e.g. manager, lead)."
                  items={keywordProfile.negative_keywords}
                  newValue={newNegative}
                  setNewValue={setNewNegative}
                  onAdd={() => addKeyword('negative_keywords', newNegative, () => setNewNegative(''))}
                  onRemove={(index) => removeKeyword('negative_keywords', index)}
                />

                {/* Negative Role Terms */}
                <KeywordList
                  label="Negative Role Blocklist"
                  desc="Keywords in description indicating wrong role family (e.g. nurse, sales)."
                  items={keywordProfile.negative_role_terms ?? []}
                  newValue={newRoleTerm}
                  setNewValue={setNewRoleTerm}
                  onAdd={() => addKeyword('negative_role_terms', newRoleTerm, () => setNewRoleTerm(''))}
                  onRemove={(index) => removeKeyword('negative_role_terms', index)}
                />
              </div>

              {/* Keyword Save action */}
              <div className="flex items-center justify-between pt-6 border-t border-border">
                <p className="text-xs text-muted-foreground font-medium">Pre-filtering matching algorithm updates instantly once saved.</p>
                <Button variant="default" onClick={() => void handleSaveKeywords()} disabled={isSavingKeywords}>
                  {isSavingKeywords ? 'Saving Profile...' : 'Save Filter Profile'}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function KeywordList({
  label,
  desc,
  items,
  newValue,
  setNewValue,
  onAdd,
  onRemove
}: {
  label: string;
  desc: string;
  items: string[];
  newValue: string;
  setNewValue: (v: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="space-y-3 p-5 rounded-2xl border border-border bg-background/30">
      <div>
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide font-label">{label}</p>
        <p className="text-muted-foreground/75 text-[10px] font-medium leading-relaxed mt-0.5">{desc}</p>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 py-1">
          {items.map((item, idx) => (
            <span key={`${item}-${idx}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 border border-primary/20 text-primary">
              {item}
              <button type="button" onClick={() => onRemove(idx)} className="text-primary/70 hover:text-destructive transition-colors">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wider font-label">No filters active</p>
      )}

      <div className="flex max-w-md gap-2 mt-2">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Add filter element..."
          className="h-8 text-xs text-foreground bg-background/50 rounded-lg border-border"
        />
        <Button variant="secondary" onClick={onAdd} className="h-8 px-3 rounded-lg text-xs">
          Add
        </Button>
      </div>
    </div>
  );
}
