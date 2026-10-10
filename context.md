





# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app generates a validated roadmap, schedules missions, tracks demonstrated progress, and adapts future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide. Onboarding supports account creation/sign-in and goal creation. Saved goals can be deleted (cascading their roadmaps, missions, and topic progress), and can generate, inspect, and activate roadmap versions; users can generate weekly missions and mark missions complete. The UI shows topic-level missions and authoritative XP returned by the API.
- apps/api: Express JavaScript with security middleware, health/readiness, auth, learning-goal, roadmap, and mission endpoints.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session in one Prisma transaction.
- Goal and roadmap ownership are derived from authenticated session. Client-supplied user IDs are not trusted.
- apps/api/lib/roadmap-validation.js validates skill-agnostic roadmaps, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, stable positions, and total estimated minutes.
- `apps/api/lib/roadmap-generator.js` uses an outcome-first, dual-model pipeline through an OpenAI-compatible Chat Completions endpoint: (1) E2B enhances the learner’s original request into a structured learning brief (outcome restatement, capabilities with observable success evidence, prerequisites, assumptions, final deliverable, and out-of-scope boundaries); (2) E4B drafts the sequenced roadmap against that brief and the learner’s availability; (3) E2B independently audits the roadmap against both the original goal and enhanced brief for outcome coverage, specificity, progression, prerequisites, and credible time estimates; (4) if the audit finds major gaps, E4B revises once using the review findings. Structural validation runs before review and before returning the final roadmap. Default local models are AI_MODEL=gemma4:e4b and AI_REVIEW_MODEL=gemma4:e2b, with AI_BASE_URL=http://127.0.0.1:11434/v1 and no local API key. Set these in the ignored root .env; the .env.example documents both models. Malformed structured JSON gets one repair retry. Roadmap requests allow 6,144 output tokens. Hosted providers must offer both configured models and compatible JSON Schema response_format support; no canned roadmap fallback is used. The live Java outcome smoke covers weighted graph representation, Dijkstra shortest paths, a REST API, automated tests, and end-to-end client use.
- `apps/api/lib/roadmap-service.js` transactionally persists versioned drafts and prerequisite edges, lists versions, and activates drafts while superseding the prior active version. It persists the E2B-generated `learningBrief` JSON and `learningBriefConfirmedAt`. Draft cards display the brief, assumptions, deliverable, capabilities, prerequisites, and scope boundaries; learners must explicitly confirm the brief before activation. Learners can submit up to 1,200 characters of clarification to generate a separate draft; the original goal remains intact, the clarification reaches both models, and the prior draft is preserved. Activation rejects unconfirmed briefs with `LEARNING_BRIEF_CONFIRMATION_REQUIRED`. Migration `20261018040000_enhanced_learning_brief` adds the two roadmap fields.
- apps/api/lib/mission-scheduler.js is a pure, tested scheduler. It spaces sessions across the week in the learner's timezone, respects daily time budget, splits oversized topics, and does not invent tasks after roadmap work is exhausted.
- apps/api/lib/mission-service.js schedules missions from an active roadmap, persists idempotent mission instances, checks prerequisites, records mission completion, updates topic progress, and awards XP in a transaction. XP is 10 + ceil(estimated minutes / 5), capped at 60, and unique mission/idempotency keys prevent duplicate rewards.
- apps/api/routes/missions.js exposes authenticated weekly generation, date-range listing, and completion endpoints. Generation is rate-limited.
- Gamification now exposes an authenticated `GET /api/v1/gamification?timeZone=Asia%2FKolkata` summary. The server derives XP and completed-mission counts from PostgreSQL, calculates consecutive active calendar days in the supplied IANA timezone, calculates levels at 100 XP per level, and persists unique user achievements (`first_mission`, `missions_10`, `xp_100`, `streak_3`, `streak_7`). The React dashboard displays level progress, current streak, completed missions, and unlocked achievements. Streak activity is based on verified mission completions; assessments do not currently count as streak activity.
- Topic assessments: apps/api/lib/assessment-generator.js generates validated 5–8 question multiple-choice checks through the same local/hosted AI provider; the API stores the answer key server-side, never returns it before submission, scores submissions server-side, persists attempts, and updates topic mastery evidence. `apps/api/routes/assessments.js` exposes authenticated topic assessment generation, retrieval, and attempt submission. The React goal/roadmap UI now lets learners open and submit these assessments and review feedback.
- Prisma schema and migration 20261018010000_daily_missions_progress add DailyMission, MissionCompletion, XpTransaction, and UserTopicProgress with indexes and foreign keys.
- Unit tests cover assessment validation/scoring, provider configuration/response validation, roadmap validation, mission scheduling/timezones, and other pure logic. apps/api/test/database.integration.test.js covers auth/session lifecycle, goal creation/deletion and user isolation, roadmap draft/activation behavior, assessment answer-key hiding and mastery, mission scheduling/completion, duplicate XP prevention, gamification XP/streak/achievement persistence, and user isolation. It passes against the isolated PostgreSQL test database when run with the root .env loaded.

## Validation
Latest validation: 43 tests passed, 0 failed, 0 skipped against PostgreSQL using `npm test`; `npm run check`, `npm run build`, `npm run db:validate`, both development/test database migration statuses, and `git diff --check` passed. The test suite now includes brief generation, clarification propagation, and API integration checks for persistence and confirmation-before-activation. `npm test` loads the root `.env` when present and automatically runs the PostgreSQL integration test when `TEST_DATABASE_URL` is configured; without it, the integration test is skipped. Live Ollama verification passed with the E2B → E4B → E2B review → optional E4B revision pipeline. The live Java outcome smoke returned a validated 7-topic roadmap (1,485 minutes against 225 minutes/week, about 7 weeks). The cross-domain quality smoke now supports selecting a single sample with `npm run smoke:roadmap-quality -- software`, `-- music`, or `-- robotics`; all three live generations passed structural validation after the new brief-enhancement pipeline. Latest samples estimated ML deployment at 1,140 minutes (~6 weeks), a beginner fingerstyle recording at 4,800 minutes (~32 weeks), and an ESP32 obstacle-avoidance robot at 1,320 minutes (~8 weeks). These are model estimates to inspect, not guarantees; the music estimate is a deliberate example of why elapsed time must be reviewed for realism and learner expectations. The full three-domain run exceeded the tool execution window, so each domain was verified separately. A live assessment-generation smoke test had previously returned a validated six-question quiz.

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
1. Improve the learner clarification loop further: make high-impact ambiguities clear at goal creation and let learners revise a brief without regenerating unnecessarily when only a small detail changes.
2. Improve schedule realism and communicate uncertainty for practice-heavy skills; the music smoke currently estimates 32 weeks for one beginner arrangement and deserves calibration against learner context.
3. Continue end-to-end workflow verification, then improve onboarding persistence and roadmap editing.

## Commands
npm run dev | npm run dev:web | npm run dev:api | npm test | npm run check | npm run build | npm run db:validate | npm run db:generate | npm run db:migrate.

## Constraints
Do not update master/reference docs frequently; update this context only for material changes. Do not claim DB persistence or visual parity without verifying them. Keep all secrets out of Git.