import Link from 'next/link';

const sections = [
  { href: '/jobs', title: 'Jobs', description: 'Inspect structured discovery output and downstream status.' },
  { href: '/runs', title: 'Runs', description: 'Review empty-state and later live discovery run history.' },
  { href: '/setup', title: 'Setup', description: 'Store the reusable applicant context and base LaTeX resume source.' }
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-slate-900 px-8 py-10 text-white shadow-lg">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-300">Batch A</p>
        <h2 className="mt-3 text-3xl font-semibold">Local-first job hunt automation.</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">The dashboard ships early so persistence, discovery, and setup state are inspectable from the start instead of hidden behind background processes.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
