# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app should generate a validated roadmap, schedule missions, track demonstrated progress, and adapt future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide; onboarding supports register/sign-in, learning-goal submission, saved goals, and sign-out.
- apps/api: generated Express JavaScript app with security middleware, health/readiness endpoints, auth routes, learning-goal CRUD-read/create endpoints, and roadmap version endpoints.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session in one Prisma transaction.
- Goal and roadmap ownership are derived from authenticated session. Client-supplied user IDs are not trusted.
- apps/api/lib/roadmap-validation.js validates skill-agnostic structured roadmaps, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, stable positions, and total estimated minutes.
- apps/api/lib/roadmap-service.js creates roadmap drafts transactionally, assigns increasing versions, persists topics and prerequisite edges, lists versions, and activates a draft while marking the previous active version SUPERSEDED. Roadmap operations enforce goal ownership.
- apps/api/routes/roadmaps.js exposes authenticated create-draft, list-version, and activate routes under a learning goal.
- apps/api/test/database.integration.test.js is opt-in with TEST_DATABASE_URL and covers registration/login/logout, goal persistence, roadmap versioning/activation/prerequisite persistence, and user isolation. It has not run against PostgreSQL yet.
- GET /api/v1/ready checks database connectivity and returns 503 when the DB is unavailable.
- README documents database integration test setup and roadmap routes.

## Validation
Latest validation: 12 passed, 0 failed, 1 database integration test skipped because TEST_DATABASE_URL is not configured. API syntax checks, frontend lint (0 warnings/errors), production build, Prisma schema validation, and git diff check passed. The readiness test observed 503 against the current unavailable database.

## Database limitation
The PostgreSQL 18 Windows service is disabled/stopped. Starting it previously failed with Windows access denied; enabling/starting requires elevated permissions. Do not claim DB connectivity or end-to-end persistence until a real DB integration test passes. Root .env contains example Prisma credentials and must not be treated as real DB config. Do not commit .env.

## Git
- a2c2812 chore: scaffold JavaScript learning platform
- f449cf6 feat: add account sessions and learning goals
- 43cae58 feat: validate personalised learning roadmaps
- 29ba6c9 fix: create registration sessions atomically
- 9ad3384 test: add database readiness and integration coverage
- Roadmap persistence/versioning and its integration test extension are currently uncommitted pending checks and review.
- No remote configured; do not claim pushes.

## Next priorities
1. Enable/start local PostgreSQL with elevated Windows permissions, create an isolated test database, set DATABASE_URL and TEST_DATABASE_URL, and apply the migration.
2. Run the database integration suite and fix any real Prisma/transaction issues.
3. Connect a server-side roadmap generation provider and build the roadmap review/activation UI; current API persists validated structured proposals but does not call an AI provider.
4. Implement deterministic daily missions, completion and transactional XP in master-plan order.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate.

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.
