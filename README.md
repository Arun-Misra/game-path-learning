# Gamified Learning V2

A personalised learning platform for any skill. Learners describe their current knowledge, target outcome, and available time; the system will build an adaptive roadmap and daily learning missions.

## Stack

- **Web:** React, JavaScript, Vite, Tailwind CSS
- **API:** Node.js, Express, JavaScript, Zod
- **Persistence:** PostgreSQL + Prisma
- **Tests:** Node.js built-in test runner

## Requirements

- Node.js 24+
- npm
- PostgreSQL (needed for database-backed workflows)

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a real local PostgreSQL database.
3. Start both applications: `npm run dev`

The web app runs on Vite's local development port. The API defaults to port 3000.

## Commands

- `npm run dev` — run web and API together
- `npm run dev:web` — run the web app
- `npm run dev:api` — run the API
- `npm run build` — production-build the web app
- `npm test` — API tests
- `npm run check` — API syntax checks and web lint
- `npm run db:validate` — validate the Prisma schema
- `npm run db:generate` — generate the Prisma Client
- `npm run db:migrate` — create/apply a development migration (requires PostgreSQL)

## Current status

The generated JavaScript scaffolds, responsive onboarding screen, API health route, and initial Prisma domain schema are in place. The onboarding form is not yet connected to a persistent learning-goal endpoint. No database migration has been applied until a real PostgreSQL connection is configured.

See [context.md](./context.md) for current implementation status and the master implementation plan for the product requirements and work order.
