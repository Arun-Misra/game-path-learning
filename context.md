






# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app generates a validated roadmap, schedules missions, tracks demonstrated progress, and adapts future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide. Onboarding supports account creation/sign-in and goal creation. Saved goals can be deleted (cascading their roadmaps, missions, and topic progress), and can generate, inspect, and activate roadmap versions; users can generate weekly missions and mark missions complete. The UI shows topic-level missions and authoritative XP returned by the API.
- apps/api: Express JavaScript with security middleware, health/readiness, auth, learning-goal, roadmap, and mission endpoints.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session in one Prisma transaction.
- Goal and roadmap ownership are derived from authenticated session. Client-supplied user IDs are not trusted.
- apps/api/lib/roadmap-validation.js validates skill-agnostic roadmaps, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, stable positions, and total estimated minutes.
- `apps/api/lib/roadmap-generator.js` uses one configured model for the full outcome-first pipeline through an OpenAI-compatible Chat Completions endpoint: (1) E4B enhances the learner’s original request into a structured learning brief; (2) E4B drafts the sequenced roadmap; (3) E4B audits the roadmap against the original goal and brief for outcome coverage, specificity, progression, prerequisites, and credible time estimates; (4) if the audit finds major gaps, E4B revises once. Using one model avoids Ollama loading/swapping separate E2B and E4B models. Structural validation runs before review and before returning the final roadmap. Default local configuration is AI_MODEL=gemma4:e4b and AI_BASE_URL=http://127.0.0.1:11434/v1, with no local API key; `.env.example` documents this single-model setup. Malformed structured JSON gets one repair retry. Roadmap requests allow 6,144 output tokens. Hosted providers need one configured model with compatible JSON Schema response_format support; no canned roadmap fallback is used. Beginner guitar goals to perform a complete named song have a deterministic 1,800-focused-minute minimum estimate (30 hours), so a 150-minute weekly schedule cannot claim completion in six days; the displayed total and topic estimates are adjusted together. This is a conservative planning floor, not a guarantee that every learner will be performance-ready in 12 weeks. Other goals continue to use model estimates and still need ongoing calibration.
- `apps/api/lib/roadmap-service.js` transactionally persists versioned drafts and prerequisite edges, lists versions, and activates drafts while superseding the prior active version. It persists the E2B-generated `learningBrief` JSON and `learningBriefConfirmedAt`. Draft cards display the brief, assumptions, deliverable, capabilities, prerequisites, and scope boundaries; learners must explicitly confirm the brief before activation. Learners can submit up to 1,200 characters of clarification to generate a separate draft; the original goal remains intact, the clarification reaches the model, and the prior draft is preserved. Activation rejects unconfirmed briefs with `LEARNING_BRIEF_CONFIRMATION_REQUIRED`. Migration `20261018040000_enhanced_learning_brief` adds the two roadmap fields.
- apps/api/lib/mission-scheduler.js is a pure, tested scheduler. It spaces sessions across the week in the learner's timezone, respects daily time budget, splits oversized topics, and does not invent tasks after roadmap work is exhausted.
- apps/api/lib/mission-service.js schedules missions from an active roadmap, persists idempotent mission instances, checks prerequisites, records mission completion, updates topic progress, and awards XP in a transaction. XP is 10 + ceil(estimated minutes / 5), capped at 60, and unique mission/idempotency keys prevent duplicate rewards.
- apps/api/routes/missions.js exposes authenticated weekly generation, date-range listing, and completion endpoints. Generation is rate-limited.
- Gamification now exposes an authenticated `GET /api/v1/gamification?timeZone=Asia%2FKolkata` summary. The server derives XP and completed-mission counts from PostgreSQL, calculates consecutive active calendar days in the supplied IANA timezone, calculates levels at 100 XP per level, and persists unique user achievements (`first_mission`, `missions_10`, `xp_100`, `streak_3`, `streak_7`). The React dashboard displays level progress, current streak, completed missions, and unlocked achievements. Streak activity is based on verified mission completions; assessments do not currently count as streak activity.
- Topic assessments: apps/api/lib/assessment-generator.js generates validated 5–8 question multiple-choice checks through the same local/hosted AI provider; the API stores the answer key server-side, never returns it before submission, scores submissions server-side, persists attempts, and updates topic mastery evidence. `apps/api/routes/assessments.js` exposes authenticated topic assessment generation, retrieval, and attempt submission. The React goal/roadmap UI now lets learners open and submit these assessments and review feedback.
- Prisma schema and migration 20261018010000_daily_missions_progress add DailyMission, MissionCompletion, XpTransaction, and UserTopicProgress with indexes and foreign keys.
- Unit tests cover assessment validation/scoring, provider configuration/response validation, roadmap validation, mission scheduling/timezones, and other pure logic. apps/api/test/database.integration.test.js covers auth/session lifecycle, goal creation/deletion and user isolation, roadmap draft/activation behavior, assessment answer-key hiding and mastery, mission scheduling/completion, duplicate XP prevention, gamification XP/streak/achievement persistence, and user isolation. It passes against the isolated PostgreSQL test database when run with the root .env loaded.

## Validation
Latest validation after the single-model and realism changes: `npm test` passed 44 tests, 0 failed, 0 skipped against PostgreSQL; `npm run check` passed with zero lint warnings/errors. The test suite covers the E4B-only brief/planning/review pipeline, clarification propagation, and API persistence/confirmation-before-activation. `npm test` loads the root `.env` when present and automatically runs PostgreSQL integration when `TEST_DATABASE_URL` is configured. Live Ollama smoke for the exact guitar goal “Able to play Neele Neele Ambar Par from start to finish, with clean chord transitions and a steady strumming rhythm” returned a 7-topic roadmap with 1,800 minutes (30 focused hours) at 150 minutes/week = 12 weeks, not six days. Its steps included chord execution, rhythm, transitions, song sections, full run-throughs, and polishing. This minimum is a conservative guardrail, not a universal guarantee; other skill domains still need quality calibration. Previous samples: ML deployment 1,140 minutes (~6 weeks), ESP32 obstacle-avoidance robot 1,320 minutes (~8 weeks). A live assessment-generation smoke test had previously returned a validated six-question quiz.

## Database limitation
PostgreSQL 18 is running locally on localhost:5432. Both `gamified_learning` and the isolated `gamified_learning_test` databases have all five migrations applied, including `20261018040000_enhanced_learning_brief`. The root `.env` is local-only and ignored by Git. Run `npm run db:migrate:test` to apply pending migrations to the isolated test database without printing its connection string. Persistence was verified by the integration suite with the root `.env` loaded.

## Git
- 09b83b3 feat: clarify and confirm learning briefs
- 62ff8d1 test: evaluate roadmaps across learning domains
- 41865d4 feat: generate outcome first roadmaps with dual model review
- 96dce5b feat: add roadmap deletion
- 5297baa feat: add learning streaks levels and achievements
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
1. Extend deterministic realism checks carefully to other domains without imposing one-size-fits-all durations; collect learner feedback and actual completion evidence to calibrate estimates.
2. Improve the learner clarification loop: surface high-impact ambiguities at goal creation and allow brief edits without unnecessary full regeneration.
3. Continue end-to-end workflow verification, then improve onboarding persistence and roadmap editing.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate.

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.