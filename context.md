# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app should generate a validated roadmap, schedule missions, track demonstrated progress, and adapt future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide. Onboarding supports account creation/sign-in and learning goal creation. Saved goal cards can generate a roadmap, inspect its topics, and activate a draft. Roadmap versions are loaded when the authenticated user opens the app.
- apps/api: generated Express JavaScript app with security middleware, health/readiness endpoints, auth routes, learning-goal routes, and roadmap endpoints.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session in one Prisma transaction.
- Goal and roadmap ownership are derived from authenticated session. Client-supplied user IDs are not trusted.
- apps/api/lib/roadmap-validation.js validates skill-agnostic structured roadmaps, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, stable positions, and total estimated minutes.
- apps/api/lib/roadmap-generator.js calls OpenAI Chat Completions with strict JSON Schema output, uses the learner's skill, outcome, experience, weekly time budget, and target date, and validates output before it can be persisted. Requires OPENAI_API_KEY; OPENAI_MODEL defaults to gpt-4.1-mini. It never falls back to canned roadmaps.
- apps/api/lib/roadmap-service.js creates roadmap drafts transactionally, assigns versions, persists topics and prerequisite edges, lists versions, and activates a draft while marking the previous active version SUPERSEDED.
- apps/api/routes/roadmaps.js exposes authenticated generate/create/list/activate routes and rate-limits generation.
- apps/api/test/roadmap-generator.test.js tests prompt personalization, missing keys, structured request, invalid output rejection, and provider rate limiting.
- apps/api/test/database.integration.test.js is opt-in with TEST_DATABASE_URL and covers registration/login/logout, goal persistence, roadmap versioning/activation/prerequisite persistence, and user isolation. It has not run against PostgreSQL yet.
- GET /api/v1/ready checks database connectivity and returns 503 when the DB is unavailable.

## Validation
Latest run before the final route rate-limit adjustment: 17 passed, 0 failed, 1 database integration test skipped because TEST_DATABASE_URL is not configured. API syntax checks, frontend lint (0 warnings/errors), production build, Prisma schema validation, and diff whitespace checks passed. The readiness endpoint returns 503 when using the current credentials.

## Database limitation
The PostgreSQL 18 Windows service is now RUNNING, confirmed after the user enabled/started it. Prisma migrate status returns P1010 (database access denied) for the current example connection to database mydb. The initial migration is not applied. Need valid PostgreSQL username/password and a database (plus separate isolated test database). Do not claim database persistence verified until the integration suite passes. Root .env contains example credentials and must not be committed.

## Git
- a2c2812 chore: scaffold JavaScript learning platform
- f449cf6 feat: add account sessions and learning goals
- 43cae58 feat: validate personalised learning roadmaps
- 29ba6c9 fix: create registration sessions atomically
- 9ad3384 test: add database readiness and integration coverage
- 8bdc01f feat: persist and activate roadmap versions
- Current roadmap generator, frontend, tests, README, env example, and context changes are pending validation/commit.
- No remote configured; do not claim pushes.

## Next priorities
1. Configure valid PostgreSQL credentials and a dedicated test database, apply the migration, and run the full DB integration suite.
2. Configure OPENAI_API_KEY in the ignored root .env and verify live generation when DB is available.
3. Implement daily mission scheduling, completion, progress and transactional XP in master-plan order.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate.

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.
