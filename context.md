# Gamified Learning V2 — Context

## Product
Build a personalised learning platform for **any skill**, not a fixed course catalogue. A learner describes the skill, current knowledge, desired outcome, and available time. The system should generate a validated roadmap, schedule useful missions, track demonstrated progress, and adapt future work.

## Engineering principles
- The backend owns persistence, identity, business rules, progress, and rewards.
- The frontend collects input and presents authoritative API state.
- Use PostgreSQL and Prisma; relational entities for core records and JSON only for genuinely variable learning content.
- Keep the original application untouched. It is a reference only; visual parity has not yet been assessed because its source was not available in this workspace.
- Use generated scaffolds as the foundation. Prefer JavaScript over TypeScript for application code where practical.
- Follow the master implementation plan for product scope and dependency order.

## Current structure
- apps/web: generated React + Vite JavaScript scaffold, Tailwind CSS, React Router, TanStack Query, Zod, Lucide.
- apps/api: generated Express JavaScript scaffold with security middleware and versioned API routes.
- prisma/schema.prisma: PostgreSQL models for users, sessions, learning goals, roadmaps, roadmap topics, and prerequisite edges.
- prisma/migrations/20261018000000_init/migration.sql: initial SQL migration generated from the Prisma schema.
- apps/api/lib/roadmap-validation.js: skill-agnostic Zod roadmap validation, prerequisite reference checks, duplicate/self-edge checks, cycle detection, stable topic positions, and total duration.
- apps/api/test/roadmap-validation.test.js: unit tests for valid roadmaps and malformed/cyclic dependency graphs.

## Current status
- Frontend and backend are generated from JavaScript scaffolding, then adapted for the product.
- Onboarding form supports account registration/sign-in and posts the learning goal to the API; it also displays saved goals returned by the API.
- API routes include health, registration, login, current user, logout, and authenticated learning-goal create/list/read.
- Authentication uses bcrypt password hashing, random opaque session tokens stored only as SHA-256 hashes, HttpOnly cookies, a 14-day expiry, and rate limiting for register/login.
- Goal endpoints derive ownership from the authenticated session and never accept a user ID as proof of ownership.
- Roadmap validation is implemented as a tested pure service. It is deliberately not wired to a fake generator or exposed as a complete roadmap workflow before persistence and generation orchestration are ready.
- Eleven API tests pass, including seven roadmap-validation cases.
- Frontend production build, lint, Prisma schema validation, Prisma Client generation, and diff whitespace checks pass.
- Initial SQL migration is generated but has not been applied.
- The machine has a PostgreSQL 18 Windows service, but it is disabled/stopped; Docker Desktop's engine is not running. No live database connection or end-to-end registration/goal persistence has been verified.
- Root .env came from Prisma init and contains example credentials; replace DATABASE_URL with a real local database URL before using database-backed endpoints. Never commit .env.
- Git commits: a2c2812 chore: scaffold JavaScript learning platform, f449cf6 feat: add account sessions and learning goals. Roadmap-validation work is currently uncommitted until checks and diff review complete.

## Commands
- npm install
- npm run dev — start API and web concurrently
- npm run dev:web
- npm run dev:api
- npm run build
- npm test
- npm run check
- npm run db:validate
- npm run db:generate
- npm run db:migrate — requires a real, running PostgreSQL instance and valid credentials

## Next priorities
1. Review and commit the roadmap-validation unit service.
2. Fix registration atomicity so user and initial session creation cannot partially succeed.
3. Configure/start a local PostgreSQL database with user approval where elevated service actions are required; set a valid root .env.
4. Apply the checked-in initial migration and verify actual DB connectivity.
5. Add integration tests against a real test database for registration, login, logout, goal create/list/read, and user isolation.
6. Build the roadmap generation/persistence/versioning workflow on top of validated structured output, then roadmap review/activation and deterministic daily missions.

## Constraints
- Do not claim data is persisted until database-backed endpoints have been exercised against a real database.
- Do not claim the original visual design has been copied without access to the original source.
- Keep master/reference documents stable; update this context only when status or key decisions materially change.
