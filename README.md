# Gamified Learning V2

A personalised learning platform for any skill. Learners describe their current knowledge, target outcome, and available time; the system will build an adaptive roadmap and daily learning missions.

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
- `npm test` — API tests; DB integration tests are skipped unless `TEST_DATABASE_URL` is configured
- `npm run check` — API JavaScript syntax checks and web lint
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

The integration test exercises registration, login, logout, goal persistence, roadmap versioning and activation, prerequisite persistence, and cross-user isolation. It cleans up only the uniquely named test users it creates.

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
- `POST /api/v1/learning-goals/:goalId/roadmaps/generate` — generate and persist a personalised draft
- `POST /api/v1/learning-goals/:goalId/roadmaps` — validate and persist a supplied draft
- `GET /api/v1/learning-goals/:goalId/roadmaps` — list versions
- `POST /api/v1/learning-goals/:goalId/roadmaps/:roadmapId/activate` — activate a draft version

Roadmap generation uses the learner's skill, experience level, desired outcome, available weekly time, and target date. It requests structured JSON from the configured model and validates the result, including prerequisite references and cycles, before saving. Generation is rate-limited. Missing credentials, provider errors, rate limits, and invalid output are surfaced as safe API errors rather than silently substituting a canned roadmap.

The frontend can generate, inspect, and activate roadmap versions for saved goals. Database operations remain unavailable until valid database credentials and a migrated PostgreSQL database are configured.

## Current limitations

The PostgreSQL service is running, but the configured connection is currently rejected by PostgreSQL with Prisma error P1010. The initial migration has not been applied, and the database integration suite has not yet passed against a real test database. A valid database role/credentials and separate test database are still required.

See `context.md` for current implementation status and the master implementation plan for product requirements and implementation order.
