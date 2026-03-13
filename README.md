# JobAutomation

A local-first, highly automated job hunt and application pipeline.

## Overview

JobAutomation is designed to streamline the entire job search process, from discovery to application. It bridges the gap between manual job hunting and full autonomy by leveraging modern browser automation and AI-assisted reasoning.

## Core Features

- **Automated Discovery**: Efficiently identifies job postings from structured sources (Greenhouse, Lever, Ashby) and fallback scraping.
- **Intelligent Tailoring**: Automatically generates job-specific resume and cover letter variants using LaTeX templates.
- **Adaptive Browser Automation**: Uses Playwright and Stagehand (AI-powered) to navigate and complete diverse job application forms.
- **Local-First Architecture**: Runs entirely on your local machine with SQLite for persistence and Tectonic for LaTeX compilation.
- **Management Dashboard**: A Next.js-based interface to monitor progress, track applications, and view generated artifacts.

## Tech Stack

- **Runtime**: TypeScript / Node.js
- **Automation**: [Playwright](https://playwright.dev/) & [Stagehand](https://stagehand.dev/)
- **Models**: [OpenRouter](https://openrouter.ai/) (Low-cost logic) & [Gemini 2.5 Flash](https://ai.google.dev/) (Browser reasoning)
- **Database**: [SQLite](https://www.sqlite.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **Document Pipeline**: [LaTeX](https://www.latex-project.org/) compiled via [Tectonic](https://tectonic-typesetting.org/)
- **Backend**: [Fastify](https://www.fastify.io/)
- **Frontend**: [Next.js](https://nextjs.org/) with [shadcn/ui](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com/)

## Project Structure

- `docs/`: System documentation and context.
- `.codex/`: Project-specific AI skills and rules.
- `AGENTS.md`: Instruction set for AI autonomous agents.

## Getting Started

*(Instructions to be added as the implementation progresses)*

---

*This project is currently in the early build phase.*
