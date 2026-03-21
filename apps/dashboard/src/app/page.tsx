import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const sections = [
  { href: '/jobs', title: 'Jobs', description: 'Inspect structured discovery output and downstream status.' },
  { href: '/runs', title: 'Runs', description: 'Review empty-state and later live discovery run history.' },
  { href: '/setup', title: 'Setup', description: 'Store the reusable applicant context and base LaTeX resume source.' }
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-xl bg-primary px-8 py-10 text-primary-foreground shadow-lg">
        <p className="text-sm uppercase tracking-[0.24em] text-primary-foreground/60">Batch A</p>
        <h2 className="mt-3 text-3xl font-semibold">Local-first job hunt automation.</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-primary-foreground/70">
          The dashboard ships early so persistence, discovery, and setup state are inspectable from
          the start instead of hidden behind background processes.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group rounded-xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
