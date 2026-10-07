# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app should generate a validated roadmap, schedule missions, track demonstrated progress, and adapt future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide; onboarding supports register/sign-in, learning-goal submission, saved goals, and sign-out.
- apps/api: generated Express JavaScript app with security middleware, versioned API routes, health and database-readiness endpoints, auth routes, and authenticated learning-goal create/list/read.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session in one Prisma transaction.
- Goal ownership is derived from authenticated session; clients cannot assert ownership with a user ID.
- apps/api/lib/roadmap-validation.js validates skill-agnostic structured roadmap data, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, stable positions, and total estimated minutes. It is a pure validation service; no fake generator is wired in.
- apps/api/test/database.integration.test.js provides opt-in database-backed coverage for registration, login, logout, goal persistence, and user isolation. It runs only when TEST_DATABASE_URL points to an isolated migrated PostgreSQL test database.
- API readiness endpoint GET /api/v1/ready returns 200 when the DB answers a query, otherwise 503 without exposing connection details.
- README documents setup and integration-test procedure.

## Validation
Latest validation before the readiness/integration additions passed: 11 tests, API syntax checks, frontend lint (0 warnings/errors), production build, Prisma schema validation, and git diff check. The new integration test is currently skipped without TEST_DATABASE_URL; it has not been run against PostgreSQL yet.

## Database limitation
The PostgreSQL 18 Windows service is disabled/stopped. Starting it previously failed with Windows access denied; enabling or starting it requires elevated permissions. Do not claim DB connectivity or end-to-end persistence until a real DB test passes. Root .env contains example Prisma credentials and must not be treated as real DB config. Do not commit .env.

## Git
- a2c2812 chore: scaffold JavaScript learning platform
- f449cf6 feat: add account sessions and learning goals
- 43cae58 feat: validate personalised learning roadmaps
- 29ba6c9 fix: create registration sessions atomically
- Readiness and opt-in DB integration tests are the current uncommitted changes pending validation and commit.
- No remote configured; do not claim pushes.

## Next priorities
1. Enable/start local PostgreSQL with elevated Windows permissions, create an isolated test database, set DATABASE_URL and TEST_DATABASE_URL, and apply the migration.
2. Run the DB integration suite and verify the readiness endpoint.
3. Implement roadmap generation/persistence/versioning and review/activation using validated structured output.
4. Implement deterministic daily missions, completion and transactional XP in master-plan order.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate.

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.
