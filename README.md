# JobAutomation

A local-first, highly automated job hunt and application pipeline.

## Overview

JobAutomation is designed to streamline the entire job search process, from discovery to application. It bridges the gap between manual job hunting and full autonomy by leveraging modern browser automation and AI-assisted reasoning.

## Core Features

- **Automated Discovery**: Efficiently identifies job postings from structured sources (Greenhouse, Lever, Ashby) and Camoufox-backed scraping.
- **Intelligent Tailoring**: Automatically generates job-specific resume and cover letter variants using LaTeX templates.
- **Browser Automation Rewrite In Progress**: Uses Camoufox for browser-backed discovery and application automation while preserving Playwright-compatible control APIs.
- **Local-First Architecture**: Runs entirely on your local machine with SQLite for persistence and Tectonic for LaTeX compilation.
- **Management Dashboard**: A Next.js-based interface to monitor progress, track applications, and view generated artifacts.

## Tech Stack

- **Runtime**: TypeScript / Node.js
- **Automation**: [Camoufox](https://camoufox.com/) with Playwright-compatible control APIs
- **Models**: [OpenRouter](https://openrouter.ai/)
- **Database**: [SQLite](https://www.sqlite.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **Document Pipeline**: [LaTeX](https://www.latex-project.org/) compiled via [Tectonic](https://tectonic-typesetting.org/)
- **Backend**: [Fastify](https://www.fastify.io/)
- **Frontend**: [Next.js](https://nextjs.org/) with [shadcn/ui](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com/)

## Project Structure

- `docs/`: System documentation and context.
- `.codex/`: Project-specific AI skills and rules.
- `AGENTS.md`: Instruction set for AI autonomous agents.

## Getting Started

Install dependencies, then fetch the Camoufox browser binary before running browser-backed discovery or application automation:

```bash
corepack pnpm install
corepack pnpm browser:install
```

### Authorized Browser Automation Scope

Browser-backed discovery and apply flows support an explicit target-domain allowlist:

- `JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST`: comma-separated domains (supports `*.wildcard` rules)
- `JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT=1`: deny all runs when allowlist is not configured

Optional polling jitter controls for form readiness checks:

- `JOBAUTOMATION_APPLICATION_POLL_MIN_MS`
- `JOBAUTOMATION_APPLICATION_POLL_MAX_MS`

---

*This project is currently in the early build phase.*
