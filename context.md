# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app should generate a validated roadmap, schedule missions, track demonstrated progress, and adapt future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide; onboarding supports register/sign-in, learning-goal submission, saved goals, and sign-out.
- apps/api: generated Express JavaScript app with security middleware, versioned API routes, health endpoint, auth routes, and authenticated learning-goal create/list/read.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session inside one Prisma transaction so a failed session insert rolls back user creation.
- Goal ownership is derived from authenticated session; clients cannot assert ownership with a user ID.
- Prisma schema models users, sessions, learning goals, roadmaps, roadmap topics, and prerequisite edges. Initial SQL migration exists but is not applied.
- apps/api/lib/roadmap-validation.js validates skill-agnostic structured roadmap data, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, and returns stable positions plus total estimated minutes. It is a pure validation service only: no fake roadmap generation is wired in.
- apps/api/test/roadmap-validation.test.js covers seven valid/invalid graph and schema cases.

## Validation
Last run succeeded: npm test (11 passing), npm run check (API syntax + frontend lint, 0 warnings/errors), npm run build, npm run db:validate, git diff --check.

## Database limitation
The PostgreSQL 18 Windows service was observed disabled/stopped and Docker Desktop engine was not running. Starting the service was denied with Windows access error; do not retry elevated service changes without user permission. Root .env still has example Prisma credentials and must not be treated as real DB config. No live DB connection, migration, or database-backed persistence flow has been verified. Do not claim otherwise.

## Git
- a2c2812 chore: scaffold JavaScript learning platform
- f449cf6 feat: add account sessions and learning goals
- 43cae58 feat: validate personalised learning roadmaps
- Registration atomicity fix is the current uncommitted change; run checks and commit after review.
- No remote configured; do not claim pushes.

## Next priorities
1. Commit the registration atomicity fix after checks.
2. Resolve PostgreSQL availability with user-approved setup, configure a real DATABASE_URL, apply migration, and verify connectivity.
3. Add real-database integration tests for register/login/logout, goal CRUD, and user isolation.
4. Build roadmap generation, persistence/versioning, review and activation on top of validated structured output.
5. Implement deterministic daily missions, completion and transactional XP in the master plan's dependency order.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate (requires a real running PostgreSQL database).

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.
