# Gamified Learning V2

A personalised learning platform for any skill. Learners describe their current knowledge, target outcome, and available time; the system builds an adaptive roadmap and daily learning missions.

## Stack

- **Web:** React, JavaScript, Vite, Tailwind CSS
- **API:** Node.js, Express, JavaScript, Zod
- **Persistence:** PostgreSQL + Prisma
- **Roadmap generation:** OpenAI structured output, validated server-side before persistence
- **Tests:** Node.js built-in test runner

## Setup

1. Install dependencies: `npm install`.
2. Configure the root `.env` using `.env.example` as a guide.
3. Set `DATABASE_URL` to a real PostgreSQL database.
4. Set `OPENAI_API_KEY` to a valid API key with access to the configured model. Keep it only in the ignored root `.env`; never commit it.
5. Apply the initial schema: `npm run db:migrate`.
6. Start both applications: `npm run dev`.

The web app uses Vite's default local development port. The API defaults to port 3000. Vite proxies `/api` requests to the API.

## Commands

- `npm run dev` — run web and API together
- `npm run dev:web` — run the web app
- `npm run dev:api` — run the API
- `npm run build` — production-build the web app
- `npm test` — API tests; database integration tests are skipped unless `TEST_DATABASE_URL` is configured
- `npm run check` — API JavaScript syntax checks and web lint
- `npm run smoke:continuity` — generate consecutive chunks with local Ollama and inspect progression from verified prior work
- `npm run db:validate` — validate the Prisma schema
- `npm run db:generate` — generate the Prisma Client
- `npm run db:migrate` — create/apply a development migration (requires PostgreSQL)

### Database integration tests

Create a **separate, disposable PostgreSQL test database** and apply the schema to it before running integration tests. Never point `TEST_DATABASE_URL` at production or a database containing data you need to keep.

PowerShell example:

```powershell
$env:TEST_DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/gamified_learning_test?schema=public"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npx prisma migrate deploy
npm test
```

The integration test exercises registration, login, logout, goal persistence, roadmap versioning and activation, prerequisite persistence, mission scheduling, mission completion, duplicate reward prevention, XP totals, and cross-user isolation.

## Implemented API routes

- `GET /api/v1/health` — process health
- `GET /api/v1/ready` — readiness check including database connectivity
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/learning-goals`
- `GET /api/v1/learning-goals`
- `GET /api/v1/learning-goals/:goalId`
- `GET /api/v1/learning-goals/:goalId/next-step?timeZone=Asia%2FKolkata` — recommend the next action from topic progress, recent assessments, current missions, and due spaced reviews; response also includes a mastery snapshot with topic states, latest scores, practice gaps, and due reviews
- `POST /api/v1/learning-goals/:goalId/roadmaps/generate` — generate and persist a personalised draft
- `POST /api/v1/learning-goals/:goalId/roadmaps` — validate and persist a supplied draft
- `GET /api/v1/learning-goals/:goalId/roadmaps` — list versions
- `POST /api/v1/learning-goals/:goalId/roadmaps/:roadmapId/activate` — activate a draft version
- `POST /api/v1/learning-goals/:goalId/missions/generate?timeZone=Asia%2FKolkata` — schedule the next week
- `GET /api/v1/learning-goals/:goalId/missions?timeZone=Asia%2FKolkata` — list missions and current XP
- `GET /api/v1/learning-goals/:goalId/missions/recovery?timeZone=Asia%2FKolkata` — preview unrecovered missed sessions and whether the week can be safely rebuilt
- `POST /api/v1/learning-goals/:goalId/missions/recovery/replan?timeZone=Asia%2FKolkata` — replan unfinished work without discarding completed sessions or XP
- `POST /api/v1/learning-goals/:goalId/missions/:missionId/complete` — complete a mission and award XP once
- `GET /api/v1/learning-goals/:goalId/project-milestones` — list saved milestones for the active roadmap
- `POST /api/v1/learning-goals/:goalId/project-milestones/generate` — create milestones from the confirmed learning brief and final deliverable
- `PATCH /api/v1/learning-goals/:goalId/project-milestones/:milestoneId` — persist milestone status and completion evidence

Roadmap generation requests structured JSON from the configured model and validates the result, including prerequisite references and cycles, before saving. Generation is rate-limited and does not silently substitute a canned roadmap.

Project milestones are generated from a confirmed learning brief's capabilities and final deliverable, then saved against the active roadmap. Completion is sequential and requires evidence of at least 20 characters; ownership is checked on every request. The dashboard displays success criteria, progress, and saved evidence.

Adaptive review timing uses the latest assessment score when available, falling back to stored mastery. A decline of at least 10 percentage points between the two latest attempts shortens the interval to 7 days. The 7, 14, and 30 day bands are heuristic defaults and are not calibrated against real learner outcome data. A mastered topic with a recent assessment below 85% is routed to reinforcement instead of automatically advancing to a new learning chunk. A mastered topic whose latest score has dropped by 10 or more points is recommended for review immediately, even if the shortened interval has not elapsed yet. The dashboard shows each saved goal's own adaptive recommendation, so advice for one goal is not hidden by another. After an assessment retake, the dashboard refreshes both the topic's persisted progress/latest score and the adaptive recommendation.

Mission scheduling uses the active roadmap, daily minute budget, days-per-week availability, and the user's IANA timezone. It splits long topics into manageable sessions, spaces sessions across the week, avoids creating arbitrary tasks solely for rewards, and persists mission instances idempotently. When a learner generates a new week, overdue unfinished sessions on the active roadmap are marked expired and the remaining topic work is rescheduled from verified completion/progress evidence. The Mission Player records a short learner reflection as completion evidence. Completion checks ownership and prerequisite progress, writes completion and XP ledger records in one transaction, and returns authoritative XP totals. Duplicate completion requests do not award XP twice. The recovery flow previews expired sessions, blocks rebuilding while a session is in progress, replaces only unstarted sessions in the current week, and marks recovered history so the prompt does not repeat.

## Current limitations

The API integration suite passes against the isolated PostgreSQL test database when `TEST_DATABASE_URL` points to a migrated test database. If the default `DATABASE_URL` still returns Prisma P1010 in your environment, correct its credentials and apply migrations before using that database. Local AI generation requires Ollama running with the configured model; hosted providers require a valid provider key.

See `context.md` for current implementation status and the master implementation plan for product requirements and implementation order.