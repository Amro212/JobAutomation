import type { ApplicantProfile } from '@jobautomation/core';

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
  baseResumeTex: ''
};

export function ApplicantProfileForm({
  action,
  profile,
  saveState
}: {
  action: (formData: FormData) => Promise<void>;
  profile: ApplicantProfile | null;
  saveState?: string;
}): JSX.Element {
  const current = profile ? { ...profile, updatedAt: undefined } : defaultProfile;

  return (
    <form action={action} className="space-y-6 rounded-3xl bg-white p-8 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Full name</span><input name="fullName" defaultValue={current.fullName} className="w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Email</span><input name="email" defaultValue={current.email} className="w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Phone</span><input name="phone" defaultValue={current.phone} className="w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Location</span><input name="location" defaultValue={current.location} className="w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">LinkedIn URL</span><input name="linkedinUrl" defaultValue={current.linkedinUrl} className="w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Website URL</span><input name="websiteUrl" defaultValue={current.websiteUrl} className="w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
      </div>

      <label className="block space-y-2 text-sm text-slate-700">
        <span className="font-medium">Professional summary</span>
        <textarea name="summary" defaultValue={current.summary} rows={4} className="w-full rounded-2xl border border-slate-200 px-4 py-3" />
      </label>

      <label className="block space-y-2 text-sm text-slate-700">
        <span className="font-medium">Reusable applicant context</span>
        <textarea name="reusableContext" defaultValue={current.reusableContext} rows={6} className="w-full rounded-2xl border border-slate-200 px-4 py-3" />
      </label>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Base resume file name</span><input name="baseResumeFileName" defaultValue={current.baseResumeFileName} className="w-full rounded-2xl border border-slate-200 px-4 py-3" /></label>
        <label className="space-y-2 text-sm text-slate-700"><span className="font-medium">Upload replacement `.tex` source</span><input name="baseResumeFile" type="file" accept=".tex,text/plain" className="block w-full rounded-2xl border border-dashed border-slate-300 px-4 py-3" /></label>
      </div>

      <label className="block space-y-2 text-sm text-slate-700">
        <span className="font-medium">Stored LaTeX source</span>
        <textarea name="baseResumeTex" defaultValue={current.baseResumeTex} rows={12} className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono text-xs" />
      </label>

      <input type="hidden" name="id" value={current.id} />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">{saveState ?? 'Store the canonical applicant context and base LaTeX resume source for later milestones.'}</p>
        <button type="submit" className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white">Save setup</button>
      </div>
    </form>
  );
}
