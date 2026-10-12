# Gamified Learning V2 — Context

## Product and principles
A personalised learning platform for any skill. Learners provide their skill, existing knowledge, target outcome, and availability; the app generates a validated roadmap, schedules missions, tracks demonstrated progress, and adapts future work. Backend owns identity, persistence, business rules, progress, and rewards. Frontend presents API state. Keep the original app untouched and use it only as a reference. Use generated scaffolds and prefer JavaScript. The master implementation plan remains the source of full requirements and sequencing.

## Current implementation
- apps/web: React + Vite JavaScript, Tailwind CSS, React Router, TanStack Query, Zod, Lucide. Onboarding supports account creation/sign-in and goal creation. Saved goals can be deleted (cascading their roadmaps, missions, and topic progress), and can generate, inspect, and activate roadmap versions; users can generate weekly missions and mark missions complete. The UI shows topic-level missions and authoritative XP returned by the API.
- apps/api: Express JavaScript with security middleware, health/readiness, auth, learning-goal, roadmap, and mission endpoints.
- Auth: bcrypt password hashing; random opaque 32-byte session token; only SHA-256 hash persisted; HttpOnly, SameSite=Lax cookie; 14-day expiry; auth rate limiting. Registration creates user and initial session in one Prisma transaction.
- Goal and roadmap ownership are derived from authenticated session. Client-supplied user IDs are not trusted.
- apps/api/lib/roadmap-validation.js validates skill-agnostic roadmaps, bounded fields/durations, unique topic keys, prerequisite references, duplicate/self edges, cycles, stable positions, and total estimated minutes.
- `apps/api/lib/roadmap-generator.js` uses one configured model for the full outcome-first pipeline through an OpenAI-compatible Chat Completions endpoint: (1) E4B enhances the learner’s original request into a structured learning brief; (2) E4B drafts the sequenced roadmap; (3) E4B audits the roadmap against the original goal and brief for outcome coverage, specificity, progression, prerequisites, and credible time estimates; (4) if the audit finds major gaps, E4B revises once. Using one model avoids Ollama loading/swapping separate E2B and E4B models. Structural validation runs before review and before returning the final roadmap. Default local configuration now selects AI_MODEL=gemma4:e2b and AI_BASE_URL=http://127.0.0.1:11434/v1, with no local API key; `.env.example` documents the single-model setup. Local requests use native Ollama `/api/chat`, configurable `AI_CONTEXT_LENGTH` (default 16,384), and `AI_REASONING_EFFORT` (default `medium`); hosted providers continue through OpenAI-compatible Chat Completions. Malformed structured JSON gets one repair retry. Hosted providers need one configured model with compatible JSON Schema response_format support; no canned roadmap fallback is used. Beginner guitar goals to perform a complete named song have a deterministic 1,800-focused-minute minimum estimate (30 hours), so a 150-minute weekly schedule cannot claim completion in six days; the displayed total and topic estimates are adjusted together. This is a conservative planning floor, not a guarantee that every learner will be performance-ready in 12 weeks. Other goals continue to use model estimates and still need ongoing calibration.
- `apps/api/lib/roadmap-service.js` transactionally persists versioned drafts and prerequisite edges, lists versions, and activates drafts while superseding the prior active version. It persists the configured-model-generated `learningBrief` JSON and `learningBriefConfirmedAt`. Draft cards display the brief, assumptions, deliverable, capabilities, prerequisites, and scope boundaries; learners must explicitly confirm the brief before activation. Learners can submit up to 1,200 characters of clarification to generate a separate draft; the original goal remains intact, the clarification reaches the model, and the prior draft is preserved. Activation rejects unconfirmed briefs with `LEARNING_BRIEF_CONFIRMATION_REQUIRED`. Migration `20261018040000_enhanced_learning_brief` adds the two roadmap fields.
- apps/api/lib/mission-scheduler.js is a pure, tested scheduler. It spaces sessions across the week in the learner's timezone, respects daily time budget, splits oversized topics, and does not invent tasks after roadmap work is exhausted.
- apps/api/lib/mission-service.js schedules missions from an active roadmap, persists idempotent mission instances, checks prerequisites, records mission completion, updates topic progress, and awards XP in a transaction. XP is 10 + ceil(estimated minutes / 5), capped at 60, and unique mission/idempotency keys prevent duplicate rewards.
- apps/api/routes/missions.js exposes authenticated weekly generation, date-range listing, and completion endpoints. Generation is rate-limited.
- Gamification now exposes an authenticated `GET /api/v1/gamification?timeZone=Asia%2FKolkata` summary. The server derives XP and completed-mission counts from PostgreSQL, calculates consecutive active calendar days in the supplied IANA timezone, calculates levels at 100 XP per level, and persists unique user achievements (`first_mission`, `missions_10`, `xp_100`, `streak_3`, `streak_7`). The React dashboard displays level progress, current streak, completed missions, and unlocked achievements. Streak activity is based on verified mission completions; assessments do not currently count as streak activity.
- Topic assessments: apps/api/lib/assessment-generator.js generates validated 5–8 question multiple-choice checks through the same local/hosted AI provider; the API stores the answer key server-side, never returns it before submission, scores submissions server-side, persists attempts, and updates topic mastery evidence. `apps/api/routes/assessments.js` exposes authenticated topic assessment generation, retrieval, and attempt submission. The React goal/roadmap UI now lets learners open and submit these assessments and review feedback.
- Prisma schema and migration 20261018010000_daily_missions_progress add DailyMission, MissionCompletion, XpTransaction, and UserTopicProgress with indexes and foreign keys.
- Unit tests cover assessment validation/scoring, provider configuration/response validation, roadmap validation, mission scheduling/timezones, and other pure logic. apps/api/test/database.integration.test.js covers auth/session lifecycle, goal creation/deletion and user isolation, roadmap draft/activation behavior, assessment answer-key hiding and mastery, mission scheduling/completion, duplicate XP prevention, gamification XP/streak/achievement persistence, and user isolation. It passes against the isolated PostgreSQL test database when run with the root .env loaded.

## Validation
Latest validation after the single-model, realism, and output-truncation fix: `npm test` passed 44 tests, 0 failed, 0 skipped against PostgreSQL; `npm run check` and `npm run build` passed with zero lint warnings/errors. The test suite covers the E4B-only brief/planning/review pipeline, clarification propagation, and API persistence/confirmation-before-activation. `npm test` loads the root `.env` when present and automatically runs PostgreSQL integration when `TEST_DATABASE_URL` is configured. Live Ollama smoke initially exposed a separate truncation bug: the roadmap response ended mid-JSON with `finish_reason=length` at 4,095 total tokens, because E4B's hidden reasoning consumed the default 4k context. Setting `reasoning_effort: 'none'` fixed the issue; the Java smoke completed successfully with six topics, and the exact guitar goal generated seven topics totaling 2,880 minutes at 150 minutes/week (~20 weeks). Its steps included chord execution, rhythm, transitions, song sections, full run-throughs, and polishing. This minimum is a conservative guardrail, not a universal guarantee; other skill domains still need quality calibration. Previous samples: ML deployment 1,140 minutes (~6 weeks), ESP32 obstacle-avoidance robot 1,320 minutes (~8 weeks). A live assessment-generation smoke test had previously returned a validated six-question quiz.

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

## Incremental learning chunks (2026-10-18)
- Roadmap generation now creates bounded learning chunks rather than estimating an entire curriculum. The planning horizon is configurable from 1–28 days; total focused minutes are capped to daily availability multiplied by the number of practice days in that horizon.
- The authenticated POST /api/v1/learning-goals/:goalId/roadmaps/questions endpoint runs goal-specific AI clarification. It asks at most four high-impact questions with selectable options, and can return no questions when the goal is already clear.
- The React UI offers 3, 7, 14, 21, or 28 day planning horizons. Answers and planning horizon are passed into roadmap generation.
- `applyChunkBudget` remains a tested utility, but live generation no longer silently scales estimates to make an unrealistic plan appear to fit. Planner and reviewer prompts are scoped to the chunk, and the generator requests revision or rejects the draft if the total or per-session budget still fails.
- Each generated roadmap stores chunk number, planning horizon, chunk budget, learner answers, and the previous active chunk ID in the existing learningBrief JSON. Earlier versions remain in roadmap history.
- Subsequent chunk generation reads the previous active chunk's mission completion state, topic progress, and recent assessment attempts, then passes this evidence into the next planning prompt.
- Named song prompts prohibit inventing exact chords, tabs, lyrics, or strumming patterns without a supplied or verified reference. The AI clarification stage can ask which trusted tutorial or chart should be followed; the UI also accepts a freeform source link or extra constraint. A deterministic guard rewrites song-specific chord/progression/strumming activities into source-verification and generic practice until a reference is provided.
- Validation: 47 tests passed against the isolated PostgreSQL test database; npm run check and npm run build passed. A live Ollama question-generation call succeeded, and a live guitar chunk returned six activities totaling exactly 150 minutes for 30 minutes/day across five practice days. The live smoke checked budget compliance, not source-specific musical accuracy.

## Instructional realism and local model reasoning (2026-10-19)
- Roadmap generation now explicitly plans from the learner's stated ability, not just the target outcome. A true beginner must be taught setup/program structure and worked examples before guided modification and independent work; activities that assume untaught syntax are rejected by the reviewer.
- For beginner Java goals, the first session must introduce a runnable Hello World program. A deterministic guard corrects common incorrect claims that String is a primitive type and flags plans that combine first-time array and loop learning in one session.
- The planner must generate one session per available practice day, with each session within the daily time limit. The independent review audits prerequisite knowledge, teachability, factual correctness, session duration, and sequence. If revision still leaves an overlong session or an instructional sequencing violation, generation fails rather than silently shortening the estimate.
- Local Ollama requests now use the native `/api/chat` endpoint so `options.num_ctx` can be set per request. Defaults are `AI_CONTEXT_LENGTH=16384` and `AI_REASONING_EFFORT=medium`; these can be lowered/changed in the root `.env` if memory or model compatibility requires it. Hosted OpenAI-compatible providers retain the Chat Completions endpoint and receive the configured reasoning effort.
- The local `.env` now selects `gemma4:e2b` because the previously configured `gemma4:e4b` failed CUDA startup in this environment. A live local Ollama smoke generated a five-session, 150-minute Java beginner chunk at 30 minutes per session using E2B with a 16k context and medium reasoning. The generated plan correctly classifies String as a reference type and separates loops, arrays, and strings. This validates the generation path, not a guarantee that every generated lesson is factually perfect.
- Validation after these changes: `npm test` passed 50 tests (including PostgreSQL integration), `npm run check` passed, and `npm run build` passed. A live native-Ollama roadmap smoke also passed.

## UI refresh (2026-10-19)
- Refreshed the Pathwise landing/onboarding screen with a more expressive headline, warmer layered background, clearer form step labels, a more prominent primary action, improved field focus states, and responsive spacing.
- Made the signed-in workspace easier to scan with clearer section hierarchy, saved-goal count, elevated goal cards, and visually distinct roadmap cards.
- Updated page title, theme color, and meta description. No API or data model behavior changed.
- Validation: `npm run check`, `npm run build`, and `git diff --check` passed. Visual appearance has not been browser-screenshot verified.

## Duolingo-inspired UI pass (2026-10-19)
- Signed-in learners with saved goals now get a learning-workspace layout: persistent desktop navigation, home/path/achievement links, streak panel, profile/level summary, and a one-click way to add a goal. On mobile the navigation becomes a compact horizontal bar.
- Restyled the learning dashboard around bright progress-green actions, friendly rounded cards with tactile borders, color-coded XP/streak/mission/achievement stats, and a connected vertical learning-path treatment for roadmap topics.
- The guest onboarding flow and existing API handlers remain in place. Creating another goal from the signed-in workspace reveals the existing form rather than introducing a separate flow.
- Validation: `npm run check`, `npm run build`, and `git diff --check` passed. This is a Duolingo-inspired direction, not a pixel-for-pixel copy; browser screenshot verification remains outstanding.

## Authentication and landing-flow repair (2026-10-19)
- Separated account authentication from learning-goal creation in the React landing form. Guests now see a dedicated Create account / Sign in choice with only the relevant account fields; they no longer need to fill out a skill and outcome just to sign in.
- Registration and login now finish as their own action. After authentication, the app loads saved goals, roadmaps, missions, and gamification data; learners with existing goals return to the workspace, while new accounts are prompted to create their first goal.
- Sign-out clears the client-side learner state and returns the form to sign-in mode. The header only provides a sign-out action when the workspace sidebar is absent, avoiding duplicate sign-out controls.
- The initial service check now uses `/api/v1/ready`, which verifies database connectivity, rather than `/api/v1/health`, which only proves the API process is alive.
- Backend auth and persistence already use PostgreSQL users, bcrypt password hashes, and persisted hashed session tokens; the database integration test verified registration, login, session lookup, logout, and invalidation. This UI defect was caused by coupling sign-in to the required learning-goal fields, not by evidence that accounts were in-memory.
- Validation after the repair: `npm test` passed 50/50 tests including PostgreSQL integration; `npm run check`, `npm run build`, and `git diff --check` passed. Browser interaction/screenshot testing remains outstanding.

## Signed-out landing page redesign (2026-10-19)
- Reworked the signed-out landing experience into a full responsive story: animated brand hero with account actions, learning-plan/practice/progress cards, a connected-path visual showcase, and a final account CTA. Existing authentication and goal form behavior remains in place.
- Added CSS-built 3D glass sphere, floating cube, orbital rings, XP token, and miniature path decoration with subtle pointer-responsive depth; added a larger path illustration with connected learning nodes, floating chips, and scroll-revealed sections.
- Added IntersectionObserver reveal transitions, hover depth on cards, responsive layouts, and reduced-motion fallbacks. Decorative art is hidden from assistive technology; the path showcase has a text label.
- No animation or illustration library was added; visuals use CSS and existing Lucide icons.
- Validation: `npm run check`, `npm run build`, `npm test` (50/50), and `git diff --check` passed. Actual browser screenshot/interaction verification remains outstanding; do not claim pixel-level visual QA.

## Playful editorial design pass (2026-10-19)
- Reworked the signed-out landing page away from generic bordered-card grids toward an editorial, more human-feeling layout: oversized expressive headline, more conversational copy, asymmetric organic forms, staggered feature storytelling, and pill-shaped quest/action elements.
- New palette: warm paper and ink-plum foundations, jade-green progress/action color, coral for energy, marigold for reward moments, and soft lilac for depth. The account panel now sits over an offset organic shape instead of a standard bordered white box.
- Reframed the landing language around quests, XP, levels, habits, and small wins without promising social features or adding fake user stats. Existing account and learning-goal workflows are unchanged.
- The signed-in learning dashboard receives the same palette direction and softer, less boxy treatment.
- Validation after this pass: `npm run check`, `npm run build`, `npm test` (50/50 including database integration), and `git diff --check` passed. Browser screenshot/interaction QA has not yet been performed.

## Landing page visual direction v2 (2026-10-19)
- Revisited the signed-out landing page after researching education landing-page references. The visual direction now borrows principles, not branded assets: airy editorial spacing and illustrated subject-led composition from the Keet landing-page study, plus the continuous, legible progress-path concept described in Duolingo's official home-screen redesign article.
- Replaced the prior warm paper/jade/coral/lilac identity with a clearer chalk/ink/ultramarine palette, using butter yellow, soft mint, and coral as controlled reward accents.
- Removed card-like containers from the hero feature stats, account panel, auth-mode switch, feature storytelling, and roadmap showcase. Form inputs use underline-led styling; the feature story uses staggered editorial columns and open space rather than a three-card grid.
- Kept account, sign-in, goal creation, and backend behavior unchanged. This pass changes visual styling and the presentation of the existing stat component only.
- Validation: `npm run check`, `npm run build`, `npm test` (50/50, including PostgreSQL integration), and `git diff --check` passed. Playwright/Puppeteer are not installed in the workspace, so browser screenshot/interaction QA is still outstanding.
