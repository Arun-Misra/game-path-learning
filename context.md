# Gamified Learning V2 — Context

## Product
Build a personalised learning platform for **any skill**, not a fixed course catalogue. A learner describes the skill, current knowledge, desired outcome, and available time. The system should generate a validated roadmap, schedule useful missions, track demonstrated progress, and adapt future work.

## Engineering principles
- The backend owns persistence, identity, business rules, progress, and rewards.
- The frontend collects input and presents authoritative API state.
- Use PostgreSQL and Prisma; relational entities for core records and JSON only for genuinely variable learning content.
- Keep the original application untouched. It is a reference only; visual parity has not yet been assessed because its source was not available in this workspace.
- Use generated scaffolds as the foundation. Prefer JavaScript over TypeScript for application code where practical.

## Current structure
- `apps/web`: generated React + Vite JavaScript scaffold, Tailwind CSS, React Router, TanStack Query, Zod, Lucide.
- `apps/api`: generated Express JavaScript scaffold with security middleware and versioned API routes.
- `prisma/schema.prisma`: PostgreSQL models for users, sessions, learning goals, roadmaps, roadmap topics, and prerequisite edges.
- `prisma/migrations/20261018000000_init/migration.sql`: initial SQL migration generated from the Prisma schema.
- `Gamified Learning V2 — Master Implementation Plan.md`: primary product requirements and implementation order.

## Current status
- Frontend and backend are generated from JavaScript scaffolding, then adapted for the product.
- Onboarding form now supports account registration/sign-in and posts the learning goal to the API; it also displays saved goals returned by the API.
- API routes include health, registration, login, current user, logout, and authenticated learning-goal create/list/read.
- Authentication uses bcrypt password hashing, random opaque session tokens stored only as SHA-256 hashes, HttpOnly cookies, a 14-day expiry, and rate limiting for register/login.
- Goal endpoints derive ownership from the authenticated session and never accept a user ID as proof of ownership.
- Zod validates registration, login, and learning-goal inputs.
- Four API tests pass, covering health, 404 responses, invalid registration input, and unauthenticated goal access.
- Frontend production build, lint, Prisma schema validation, and Prisma Client generation pass.
- Initial SQL migration is generated but **has not been applied**.
- The machine has a PostgreSQL 18 Windows service, but it is disabled/stopped; Docker Desktop's engine is not running. No live database connection or end-to-end registration/goal persistence has been verified.
- Root `.env` came from Prisma init and contains example credentials; replace `DATABASE_URL` with a real local database URL before using database-backed endpoints. Never commit `.env`.
- Last foundation commit: `a2c2812 chore: scaffold JavaScript learning platform`. The new auth/goal work is currently uncommitted; review diff and run checks before committing.

## Commands
- `npm install`
- `npm run dev` — start API and web concurrently
- `npm run dev:web`
- `npm run dev:api`
- `npm run build`
- `npm test`
- `npm run check`
- `npm run db:validate`
- `npm run db:generate`
- `npm run db:migrate` — requires a real, running PostgreSQL instance and valid credentials

## Next priorities
1. Configure/start a local PostgreSQL database with user approval where elevated service actions are required; set a valid root `.env`.
2. Apply the checked-in initial migration and verify actual DB connectivity.
3. Add integration tests against a real test database for registration, login, logout, goal create/list/read, and user isolation.
4. Implement the first roadmap-generation pipeline only after persisted goals are verified.
5. Continue in the master plan's dependency order.

## Constraints
- Do not claim data is persisted until database-backed endpoints have been exercised against a real database.
- Do not claim the original visual design has been copied without access to the original source.
- Keep master/reference documents stable; update this context only when status or key decisions materially change.
