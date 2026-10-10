


# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app generates a validated roadmap, schedules missions, tracks demonstrated progress, and adapts future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide. Onboarding supports account creation/sign-in and goal creation. Saved goals can be deleted (cascading their roadmaps, missions, and topic progress), and can generate, inspect, and activate roadmap versions; users can generate weekly missions and mark missions complete. The UI shows topic-level missions and authoritative XP returned by the API.
- apps/api: Express JavaScript with security middleware, health/readiness, auth, learning-goal, roadmap, and mission endpoints.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session in one Prisma transaction.
- Goal and roadmap ownership are derived from authenticated session. Client-supplied user IDs are not trusted.
- apps/api/lib/roadmap-validation.js validates skill-agnostic roadmaps, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, stable positions, and total estimated minutes.
- apps/api/lib/roadmap-generator.js now runs a staged, outcome-first pipeline through an OpenAI-compatible Chat Completions endpoint: (1) E4B structures the learner’s request into required capabilities, success evidence, assumptions, and a final deliverable; (2) E4B drafts the sequenced roadmap against that brief and the learner’s availability; (3) E2B independently audits alignment, specificity, progression, prerequisites, and time realism; (4) if the audit finds major gaps, E4B revises once using the review findings. Structural validation still runs before the draft is reviewed and before any final roadmap is returned. Default local models are AI_MODEL=gemma4:e4b and AI_REVIEW_MODEL=gemma4:e2b, with AI_BASE_URL=http://127.0.0.1:11434/v1 and no local API key. Set these in the ignored root .env; the .env.example documents both models. A live Java outcome smoke test now covers a weighted graph, Dijkstra shortest paths, REST API, automated tests, and end-to-end client use. Hosted providers must offer both configured models and compatible JSON Schema response_format support; no canned roadmap fallback is used. If a provider returns malformed structured JSON, the generator retries that stage once before failing.
- apps/api/lib/roadmap-service.js transactionally persists versioned drafts and prerequisite edges, lists versions, and activates drafts while superseding the prior active version.
- apps/api/lib/mission-scheduler.js is a pure, tested scheduler. It spaces sessions across the week in the learner's timezone, respects daily time budget, splits oversized topics, and does not invent tasks after roadmap work is exhausted.
- apps/api/lib/mission-service.js schedules missions from an active roadmap, persists idempotent mission instances, checks prerequisites, records mission completion, updates topic progress, and awards XP in a transaction. XP is 10 + ceil(estimated minutes / 5), capped at 60, and unique mission/idempotency keys prevent duplicate rewards.
- apps/api/routes/missions.js exposes authenticated weekly generation, date-range listing, and completion endpoints. Generation is rate-limited.
- Gamification now exposes an authenticated `GET /api/v1/gamification?timeZone=Asia%2FKolkata` summary. The server derives XP and completed-mission counts from PostgreSQL, calculates consecutive active calendar days in the supplied IANA timezone, calculates levels at 100 XP per level, and persists unique user achievements (`first_mission`, `missions_10`, `xp_100`, `streak_3`, `streak_7`). The React dashboard displays level progress, current streak, completed missions, and unlocked achievements. Streak activity is based on verified mission completions; assessments do not currently count as streak activity.
- Topic assessments: apps/api/lib/assessment-generator.js generates validated 5–8 question multiple-choice checks through the same local/hosted AI provider; the API stores the answer key server-side, never returns it before submission, scores submissions server-side, persists attempts, and updates topic mastery evidence. `apps/api/routes/assessments.js` exposes authenticated topic assessment generation, retrieval, and attempt submission. The React goal/roadmap UI now lets learners open and submit these assessments and review feedback.
- Prisma schema and migration 20261018010000_daily_missions_progress add DailyMission, MissionCompletion, XpTransaction, and UserTopicProgress with indexes and foreign keys.
- Unit tests cover assessment validation/scoring, provider configuration/response validation, roadmap validation, mission scheduling/timezones, and other pure logic. apps/api/test/database.integration.test.js covers auth/session lifecycle, goal creation/deletion and user isolation, roadmap draft/activation behavior, assessment answer-key hiding and mastery, mission scheduling/completion, duplicate XP prevention, gamification XP/streak/achievement persistence, and user isolation. It passes against the isolated PostgreSQL test database when run with the root .env loaded.

## Validation
Latest validation: 41 tests passed, 0 failed, 0 skipped against PostgreSQL using `npm test` (including owner-only goal deletion and verification that deleted goals are no longer readable); `npm run check` and `npm run build` passed (loads the root `.env` if present). The test database has all four migrations applied. API syntax checks, frontend lint (0 warnings/errors), production build, Prisma schema validation, Prisma Client generation, and migration status passed. `npm test` loads the root `.env` when present and automatically runs the PostgreSQL integration test when `TEST_DATABASE_URL` is configured; without it, the integration test is skipped. Live Ollama verification now exercises the dual-model pipeline using gemma4:e4b for analysis/planning/revision and gemma4:e2b for independent review. The live Java outcome smoke test passed and returned a validated 6-topic roadmap covering weighted graph representation, Dijkstra implementation, unit tests, REST server setup, API integration, and an end-to-end client. Estimated workload was 1,050 minutes against 225 available minutes/week (about 5 weeks). The generator requests up to 4,096 output tokens to avoid truncating detailed roadmaps. A live assessment-generation smoke test also passed previously, returning a validated 6-question quiz. Run `npm run smoke:ollama`, `npm run smoke:assessment`, and `npm run smoke:roadmap-quality`. The cross-domain quality smoke evaluates software engineering (train/evaluate/deploy an ML model behind a REST API), music performance (record a complete fingerstyle arrangement), and robotics (ESP32 obstacle avoidance on a repeatable test course). All three live generations completed and passed structural validation. Review of their outputs found actionable, outcome-aligned sequences, while confirming the next quality gap: outcome-analysis assumptions are not yet surfaced for learner confirmation; duration estimates should also be challenged for performance-heavy skills.

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
1. Surface outcome-analysis assumptions on generated draft roadmaps and require learner review before activation, especially for unspecified frameworks, hardware, or target platform.
2. Improve quality review for schedule realism across practice-heavy skills; cross-domain smoke currently provides representative live samples.
3. Continue end-to-end workflow verification and improve onboarding persistence/roadmap editing.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate.

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.