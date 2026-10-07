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
npx prisma migrate deploy
npm test
```

The integration test exercises registration, session lookup, login, logout, learning-goal persistence, and cross-user access isolation. It only cleans up the uniquely named test users it creates.

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

Authentication uses server-side sessions and HttpOnly cookies. Learning goals are scoped to the authenticated user.

## Current limitations

The initial SQL migration is generated but has not been applied. The local PostgreSQL service is disabled/stopped, and the current environment cannot enable/start it without elevated Windows permissions. Live database connectivity and the full registration-to-goal persistence flow have therefore not yet been verified. Roadmap generation and persistence are the next product feature after database-backed workflows are verified.

See `context.md` for current implementation status and the master implementation plan for product requirements and implementation order.
