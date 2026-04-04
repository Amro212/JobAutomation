# JobAutomation

A local-first, highly automated job hunt and application pipeline.

## Overview

JobAutomation is designed to streamline the end-to-end job search flow: discovery, filtering, document tailoring, and application execution support. It combines deterministic automation with AI-assisted reasoning where site variability requires it.

## Current Project Status (March 2026)

The repository is in active development with a working monorepo foundation:

- API app scaffolded and runnable (`apps/api`)
- Dashboard app scaffolded and runnable (`apps/dashboard`)
- Workspace packages for discovery, documents, automation, DB, config, and LLM integration
- Shared test setup in place (Vitest + Playwright)
- Environment template available at `.env.example`

This is still an implementation-phase project (not a production-ready release).

## Core Features

- **Discovery-first Pipeline**: Structured source intake (Greenhouse, Lever, Ashby) with browser fallback paths.
- **Document Tailoring Pipeline**: Job-specific resume/cover-letter generation in a LaTeX-first workflow.
- **Adaptive Browser Automation**: Playwright-first with Stagehand as an AI fallback layer for brittle/inconsistent pages.
- **Local-First Data Layer**: SQLite + Drizzle for local persistence and inspectable artifacts.
- **Operational Dashboard**: Next.js-based internal UI for run visibility and pipeline monitoring.

## Tech Stack

- **Runtime**: TypeScript / Node.js
- **Automation**: [Playwright](https://playwright.dev/) & [Stagehand](https://stagehand.dev/)
- **Models**: [OpenRouter](https://openrouter.ai/) (Low-cost logic) & [Gemini 2.5 Flash](https://ai.google.dev/) (Browser reasoning)
- **Database**: [SQLite](https://www.sqlite.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **Document Pipeline**: [LaTeX](https://www.latex-project.org/) compiled via [Tectonic](https://tectonic-typesetting.org/)
- **Backend**: [Fastify](https://www.fastify.io/)
- **Frontend**: [Next.js](https://nextjs.org/) with [shadcn/ui](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com/)

## Project Structure

- `apps/api`: Fastify-based local orchestration/API app.
- `apps/dashboard`: Next.js dashboard app.
- `packages/`: Shared domain packages (`automation`, `config`, `core`, `db`, `discovery`, `documents`, `llm`).
- `docs/context`: Project context and stack source-of-truth docs.
- `.codex/`: Project-specific AI skills and rules.
- `AGENTS.md`: Instruction set for AI autonomous agents.

## Getting Started

### 1) Prerequisites

- Node.js 18+

`pnpm` may not be available as a global command on Windows without admin setup.
This README uses `corepack pnpm` commands to work reliably without a global install.

### 2) Install Dependencies

```bash
corepack pnpm install
```

### 3) Configure Environment

PowerShell:

```powershell
Copy-Item .env.example .env
```

Bash:

```bash
cp .env.example .env
```

Then edit `.env` and set required API keys:

- `OPENROUTER_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`

### 4) Install Playwright Browsers

```bash
corepack pnpm exec playwright install
```

### 5) Run the Apps

Start API:

```bash
corepack pnpm --filter @jobautomation/api dev
```

Start dashboard (separate terminal):

```bash
corepack pnpm --filter @jobautomation/dashboard dev
```

Default local ports are configured via `.env` (`API_PORT=3001`, `DASHBOARD_PORT=3000`).

### 6) Run Tests

Run workspace tests:

```bash
corepack pnpm test
```

Run Playwright tests:

```bash
corepack pnpm test:e2e
```

Run API-only tests:

```bash
corepack pnpm --filter @jobautomation/api test
```

Run dashboard E2E tests:

```bash
corepack pnpm --filter @jobautomation/dashboard test:e2e
```

---

*Status: implementation phase, local-first development workflow in progress.*
