# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app generates a validated roadmap, schedules missions, tracks demonstrated progress, and adapts future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide. Onboarding supports account creation/sign-in and goal creation. Saved goals can generate, inspect, and activate roadmap versions; users can generate weekly missions and mark missions complete. The UI shows topic-level missions and authoritative XP returned by the API.
- apps/api: Express JavaScript with security middleware, health/readiness, auth, learning-goal, roadmap, and mission endpoints.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session in one Prisma transaction.
- Goal and roadmap ownership are derived from authenticated session. Client-supplied user IDs are not trusted.
- apps/api/lib/roadmap-validation.js validates skill-agnostic roadmaps, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, stable positions, and total estimated minutes.
- apps/api/lib/roadmap-generator.js now uses a configurable OpenAI-compatible Chat Completions endpoint. It defaults to local Ollama at http://127.0.0.1:11434/v1 with model gemma4:e2b, so no paid OpenAI account or API key is required for local development. Set AI_BASE_URL, AI_API_KEY, and AI_MODEL in the ignored root .env to use a hosted compatible provider such as NVIDIA NIM. Generated content is still schema-validated before persistence; the app does not silently fall back to canned roadmaps. Hosted provider/model availability and support for JSON Schema response_format can vary.
- apps/api/lib/roadmap-service.js transactionally persists versioned drafts and prerequisite edges, lists versions, and activates drafts while superseding the prior active version.
- apps/api/lib/mission-scheduler.js is a pure, tested scheduler. It spaces sessions across the week in the learner's timezone, respects daily time budget, splits oversized topics, and does not invent tasks after roadmap work is exhausted.
- apps/api/lib/mission-service.js schedules missions from an active roadmap, persists idempotent mission instances, checks prerequisites, records mission completion, updates topic progress, and awards XP in a transaction. XP is 10 + ceil(estimated minutes / 5), capped at 60, and unique mission/idempotency keys prevent duplicate rewards.
- apps/api/routes/missions.js exposes authenticated weekly generation, date-range listing, and completion endpoints. Generation is rate-limited.
- Topic assessments are being added: apps/api/lib/assessment-generator.js generates validated 5–8 question multiple-choice checks through the same local/hosted AI provider; the API stores the answer key server-side, never returns it before submission, scores submissions server-side, persists attempts, and updates topic mastery evidence. `apps/api/routes/assessments.js` exposes authenticated topic assessment generation, retrieval, and attempt submission. The React goal/roadmap UI now lets learners open and submit these assessments and review feedback.
- Prisma schema and migration 20261018010000_daily_missions_progress add DailyMission, MissionCompletion, XpTransaction, and UserTopicProgress with indexes and foreign keys.
- Unit tests cover assessment validation/scoring, provider configuration/response validation, roadmap validation, mission scheduling/timezones, and other pure logic. apps/api/test/database.integration.test.js includes auth, roadmap versioning, mission generation/completion, duplicate XP prevention, and isolation assertions, but it is opt-in and has not run against PostgreSQL yet.

## Validation
Latest non-database validation: 33 tests passed, 0 failed, and 1 database integration test skipped because TEST_DATABASE_URL is not configured. API syntax checks, frontend lint (0 warnings/errors), production build, Prisma schema validation, Prisma Client generation, and diff whitespace checks passed. Re-run these checks after provider configuration changes. Database-backed mission/XP assertions remain unexecuted until PostgreSQL credentials and a test database are configured. Live Ollama was verified: gemma4:e2b is installed (4.6 GB), the local OpenAI-compatible chat endpoint responds, and strict JSON Schema output works. A live model response exposed empty prerequisite markers and some invalid external/self references; the generator now normalizes these before normal roadmap validation. The full live generateRoadmap() smoke test passes and returned a validated 6-topic JavaScript roadmap. The live assessment-generation smoke test also passes, returning a validated 6-question quiz. Run `npm run smoke:ollama` and `npm run smoke:assessment`.

## Database limitation
The PostgreSQL 18 Windows service was previously running, but on 2026-10-18 the current check found `postgresql-x64-18` STOPPED and no listener on localhost:5432. `Start-Service` failed with a service access/permission error in the current non-elevated shell. `npx prisma migrate status` currently returns P1001 (database server unreachable), before credentials can be checked. First start PostgreSQL from an elevated PowerShell (`Start-Service postgresql-x64-18`), then configure valid local database credentials and a separate isolated test database. The migrations are not applied. Do not claim persistence verified until the integration suite passes. Root .env contains example credentials and must not be committed.

## Git
- a2c2812 chore: scaffold JavaScript learning platform
- f449cf6 feat: add account sessions and learning goals
- 43cae58 feat: validate personalised learning roadmaps
- 29ba6c9 fix: create registration sessions atomically
- 9ad3384 test: add database readiness and integration coverage
- 8bdc01f feat: persist and activate roadmap versions
- f0ee9f9 feat: generate and review personalised roadmaps
- d7b3728 feat: schedule missions and award completion XP
- 29bb927 feat: support free local and hosted AI providers
- 583d078 fix: validate Ollama generated roadmaps
- 3f8a1bd feat: add generated topic assessments
- No remote configured; do not claim pushes.

## Next priorities
1. Start the PostgreSQL 18 Windows service with administrator permissions, configure valid credentials and a dedicated test database, apply migrations, and run the expanded DB integration suite.
2. Test the committed assessment workflow end to end against PostgreSQL.
3. Add streaks, levels, and achievements using backend-owned events.
4. Continue end-to-end workflow verification and improve onboarding persistence/roadmap editing.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate.

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.