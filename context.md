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
- Gamification now exposes an authenticated `GET /api/v1/gamification?timeZone=Asia%2FKolkata` summary. The server derives XP and completed-mission counts from PostgreSQL, calculates consecutive active calendar days in the supplied IANA timezone, calculates levels at 100 XP per level, and persists unique user achievements (`first_mission`, `missions_10`, `xp_100`, `streak_3`, `streak_7`). The React dashboard displays level progress, current streak, completed missions, and unlocked achievements. Streak activity is based on verified mission completions; assessments do not currently count as streak activity.
- Topic assessments: apps/api/lib/assessment-generator.js generates validated 5–8 question multiple-choice checks through the same local/hosted AI provider; the API stores the answer key server-side, never returns it before submission, scores submissions server-side, persists attempts, and updates topic mastery evidence. `apps/api/routes/assessments.js` exposes authenticated topic assessment generation, retrieval, and attempt submission. The React goal/roadmap UI now lets learners open and submit these assessments and review feedback.
- Prisma schema and migration 20261018010000_daily_missions_progress add DailyMission, MissionCompletion, XpTransaction, and UserTopicProgress with indexes and foreign keys.
- Unit tests cover assessment validation/scoring, provider configuration/response validation, roadmap validation, mission scheduling/timezones, and other pure logic. apps/api/test/database.integration.test.js covers auth/session lifecycle, goal and user isolation, roadmap draft/activation behavior, assessment answer-key hiding and mastery, mission scheduling/completion, duplicate XP prevention, gamification XP/streak/achievement persistence, and user isolation. It passes against the isolated PostgreSQL test database when run with the root .env loaded.

## Validation
Latest validation: 38 tests passed, 0 failed, 0 skipped against PostgreSQL using `npm test` (loads the root `.env` if present). The test database has all four migrations applied. API syntax checks, frontend lint (0 warnings/errors), production build, Prisma schema validation, Prisma Client generation, and migration status passed. `npm test` loads the root `.env` when present and automatically runs the PostgreSQL integration test when `TEST_DATABASE_URL` is configured; without it, the integration test is skipped. Live Ollama was verified: gemma4:e2b is installed (4.6 GB), the local OpenAI-compatible chat endpoint responds, and strict JSON Schema output works. A live model response exposed empty prerequisite markers and some invalid external/self references; the generator now normalizes these before normal roadmap validation. The full live generateRoadmap() smoke test passes and returned a validated 6-topic JavaScript roadmap. The live assessment-generation smoke test also passes, returning a validated 6-question quiz. Run `npm run smoke:ollama` and `npm run smoke:assessment`.

## Database limitation
PostgreSQL 18 is running locally on localhost:5432. Both `gamified_learning` and the isolated `gamified_learning_test` databases have all four migrations applied, including `20261018030000_gamification_achievements`. The root `.env` is local-only and ignored by Git. Run `npm run db:migrate:test` to apply pending migrations to the isolated test database without printing its connection string. Persistence was verified by the integration suite with the root `.env` loaded.

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
- 9491da3 test: verify learning workflows against PostgreSQL
- 5ac6344 feat: add learning streaks levels and achievements
- No remote configured; do not claim pushes.

## Next priorities
1. Add streaks, levels, and achievements based on backend-owned mission completions and XP events.
2. Ensure normal test commands can opt into PostgreSQL integration tests when TEST_DATABASE_URL is configured, without leaking credentials.
3. Continue end-to-end workflow verification and improve onboarding persistence/roadmap editing.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate.

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.