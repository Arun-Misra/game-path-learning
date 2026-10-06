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
- `npm test` — API tests
- `npm run check` — API JavaScript syntax checks and web lint
- `npm run db:validate` — validate the Prisma schema
- `npm run db:generate` — generate the Prisma Client
- `npm run db:migrate` — create/apply a development migration (requires PostgreSQL)

## Implemented API routes

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`
- `POST /api/v1/learning-goals`
- `GET /api/v1/learning-goals`
- `GET /api/v1/learning-goals/:goalId`

Authentication uses server-side sessions and HttpOnly cookies. Learning goals are scoped to the authenticated user.

## Current limitations

The initial SQL migration is generated but has not been applied. The local PostgreSQL service was found disabled/stopped, so live database connectivity and the full registration-to-goal persistence flow have not yet been verified. Roadmap generation is the next product feature after database-backed workflows are verified.

See [context.md](./context.md) for the current implementation status and the master implementation plan for product requirements and implementation order.
