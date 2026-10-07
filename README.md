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
- PostgreSQL (required for account and learning-goal operations)

## Setup

1. Install dependencies: `npm install`.
2. Configure the root `.env` file using `.env.example` as a guide. Set `DATABASE_URL` to a real PostgreSQL database. Do not commit `.env`.
3. Apply the initial schema: `npm run db:migrate`.
4. Start both applications: `npm run dev`.

The web app uses Vite's default local development port. The API defaults to port 3000. Vite proxies `/api` requests to the API.

## Commands

- `npm run dev` — run web and API together
- `npm run dev:web` — run the web app
- `npm run dev:api` — run the API
- `npm run build` — production-build the web app
- `npm test` — API tests; database integration tests are skipped unless `TEST_DATABASE_URL` is configured
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

The integration test exercises registration, session lookup, login, logout, learning-goal persistence, roadmap versioning, activation, prerequisite persistence, and cross-user isolation. It only cleans up the uniquely named test users it creates.

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
- `POST /api/v1/learning-goals/:goalId/roadmaps` — validate and persist a draft roadmap version
- `GET /api/v1/learning-goals/:goalId/roadmaps` — list roadmap versions
- `POST /api/v1/learning-goals/:goalId/roadmaps/:roadmapId/activate` — activate a draft version

Roadmap draft input is validated server-side, including prerequisite graph checks. Draft creation and prerequisite persistence are transactional. Activating a new version supersedes the previously active version. The generation provider and frontend roadmap-review flow are not yet connected; the endpoint persists a structured proposal rather than pretending an AI provider is configured.

Authentication uses server-side sessions and HttpOnly cookies. Learning goals and roadmaps are scoped to the authenticated user.

## Current limitations

The initial SQL migration is generated but has not been applied. The local PostgreSQL service is disabled/stopped, and the current environment cannot enable/start it without elevated Windows permissions. Live database connectivity and the database integration suite have therefore not yet been verified. Next, enable the local database, apply the migration, run the integration suite, then connect the roadmap generation provider and review UI.

See `context.md` for current implementation status and the master implementation plan for product requirements and implementation order.
