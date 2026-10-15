
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

## Landing page visual pass v3 and browser QA (2026-10-19)
- Revisited real learning-product references, focusing on Khan Academy's clear light canvas and restrained mint/energy-point/streak accents, plus Brilliant's expressive, geometric learning illustrations. References: https://www.khanacademy.org/ and https://brilliant.org/.
- Replaced the ultramarine-heavy palette with a cleaner white/ink/mint system, using yellow only for XP/reward moments and orange for streak/energy accents. Removed decorative gradients from the page canvas and reduced oversized blank spacing in the hero and story sections.
- Aligned the hero copy toward the top instead of vertically centering it beside the account form, reduced the headline and section gaps, and kept the landing features open rather than boxed. The form and auth flows remain functional.
- Installed `@playwright/test` and Chromium; added `npm run test:e2e`, `playwright.config.js`, and `tests/e2e/landing.spec.js`. Browser tests check desktop and mobile content, horizontal overflow, and account/sign-in mode switching.
- Browser QA ran against Chromium at 1440x1000 and 390x844. Both passed, with no horizontal overflow; sign-in mode hides the optional name field and uses the correct password placeholder. Expected unauthenticated `/auth/me` requests return 401 during signed-out page initialization; there were no page JavaScript errors.
- Validation: `npm run check`, `npm run build`, `npm test` (50/50), `npm run test:e2e` (2/2), and `git diff --check` passed.

## Signed-out landing direction v4 (2026-10-19)
- User supplied https://caring-slide-969894.framer.app/ as the target inspiration. Browser-inspected the live Framer page: “Storm Lab — Never Stop Exploring”, an immersive performance-gear concept with a near-black canvas, oversized Manrope headlines, restrained white/gray UI, signal-orange accent (#ff3300), compact technical labels, and interactive instrument-panel details.
- Rebuilt the signed-out Pathwise landing styling around that visual language (inspiration only; no copied assets): charcoal/black canvas, hard white uppercase display type, Manrope, orange as the sole accent, compact section rhythm, technical micro-labels, an orange-framed sign-up area, dark form controls, and a high-contrast learning-path visual. Updated the hero and feature copy to “NEVER STOP LEARNING.”
- Kept changes scoped to signed-out landing presentation; authentication, learning goal submission, and signed-in dashboard color variables/behavior are not intentionally changed.
- Installed @playwright/test and Chromium. Browser-run verification used Chromium at 1440x1000 and 390x844: page loaded, no horizontal overflow at either size, auth mode switched correctly, and no page JavaScript errors were observed. Full-page screenshots were captured locally for inspection.
- Validation: npm run check, npm run build, npm test (50/50), npm run test:e2e (2/2), and git diff --check passed.

## Framer-inspired landing and dashboard pass (2026-10-19)
- Used the user-supplied Storm Lab Framer page as the reference: near-black canvas, oversized Manrope typography, signal-orange accents, compact technical labels, and restrained monochrome details. The learning product borrows the art direction without copying brand assets.
- Re-aligned the signed-out hero, form, 3D decorations, feature story, and learning-path showcase to the dark/orange identity. Reduced some of the oversized vertical gaps and kept the account form and auth-mode switch working.
- Reworked the signed-in dashboard to match the same visual language: dark navigation rail, orange active state and primary actions, a welcome/next-move hero, an open four-metric strip rather than four bordered tiles, and tighter goal/roadmap content. The next-move action scrolls to the actual learning goals; the title uses the learner's first name when available.
- Installed @playwright/test and Chromium. Fixed the Playwright dev-server configuration to use a dedicated port so it doesn't mistake an unrelated Vite process on 5173 for the app.
- Browser checks ran at desktop 1440×1000 and mobile 390×844. Landing page and sign-in mode switching passed with no horizontal overflow or browser page errors. An authenticated visual QA flow created a temporary account and goal, captured dashboard screenshots at both sizes, verified the welcome panel and four metrics, then deleted the temporary account and related data; no horizontal overflow or browser page errors.
- Validation: npm run check, npm run build, npm test (50 tests passed), npm run test:e2e (2/2), and git diff --check passed. Screenshots were generated locally for QA; they are not product assets.

## Dashboard goal creation and palette consistency fix (2026-10-19)
- Fixed the “New learning goal” blank-space bug: the dashboard conditionally mounts the goal form after the initial reveal observer has already run, leaving the newly mounted section at its hidden pre-reveal opacity. The reveal observer now re-runs when authentication, the goal-form toggle, or goal count changes, and only observes elements that have not already revealed.
- Added a dashboard-specific class and layout for the goal creation section so it occupies the main content column, rather than inheriting signed-out landing positioning.
- Extended the Storm Lab-inspired charcoal/ink/signal-orange styling to goal creation inputs and nested roadmap/learning-brief surfaces. Removed remaining bright white/pale-green panels inside the signed-in learning goals area so it follows the dashboard palette.
- Added a Playwright regression test that mocks an authenticated learner with an existing goal, clicks “New learning goal,” verifies the form is actually revealed and usable, checks that the goal panel has no white nested surfaces, and checks desktop/mobile overflow.
- Validation so far: `npm run check`, `npm run build`, and `npm test` (50/50 including PostgreSQL integration) passed; the initial dashboard reveal regression test passed. Extending the E2E check to the expanded form at mobile width exposed horizontal overflow, so a single-column mobile layout override was added. The final rerun is pending because the workspace command runner is currently refusing additional commands due to its concurrency limit. The API on port 3000 was already running; an extra duplicate dev process was stopped.

## Assessment test bench (2026-10-19)
- Added a separate frontend route at `/assessment-test`, styled as a developer utility and separate from the learner-facing dashboard.
- The page lists every topic in the user's active roadmaps and provides an action per topic. Clicking it loads or generates the topic assessment, submits a deterministic attempt using option index 0 for every question through the normal authenticated API, and displays the server-scored result and topic mastery status.
- This intentionally does not expose answer keys, force a pass, or bypass assessment scoring. The submitted attempt may fail; the utility is for quickly exercising generation, attempt persistence, scoring, and topic-progress updates.
- VS Code diagnostics are clean for `apps/web/src/App.jsx` and `apps/web/src/AssessmentTestPage.jsx`. Shell validation (`npm run check`, `npm run build`, `git diff --check`) could not run because the workspace command runner reported its concurrency limit; runtime/browser verification remains outstanding.

## Roadmap chunk continuity and adaptive difficulty (2026-10-20)
- Fixed continuation instructions for subsequent roadmap chunks. The planner previously carried beginner-oriented Java instructions into later chunks, risking repeated introductory material.
- The generator now adapts to the learner's stated experience, explicit intent (learning, revision, practice, or mastery), clarifications, and demonstrated capability. It must not impose a preset beginner/intermediate/advanced sequence or treat a newly generated roadmap as proof the learner is starting from zero.
- Revision requests should favor retrieval practice, gap diagnosis, and targeted reinforcement rather than automatically teaching concepts from scratch. Foundational setup is included only when relevant to that learner and outcome.
- Later chunks receive explicit continuity instructions and prior topic/activity/progress/assessment context in brief enhancement, planning, and review. The service passes topic descriptions/objectives, progress, recent assessment results, completed/incomplete missions, prior chunk number, and continuation rules; the long-term goal remains unchanged.
- The Java first-program guard now respects explicit revision/practice intent as well as prior chunk evidence. Java factual correctness checks remain.
- Added regression tests for continuation prompts, adaptive experience/revision intent, reviewer continuity audits, and the intent-aware Java onboarding guard.
- Validation at the time: `npm test --workspace apps/api` passed 54/54 tests; `npm run check`, `npm run build`, and `git diff --check` passed. The dedicated live continuity smoke was added and later passed; details are in the following section.

## Evidence-based next action and Mission Player (2026-10-20)
- Added `GET /api/v1/learning-goals/:goalId/next-step`. It is authenticated and ownership-scoped; it derives a recommendation from the active roadmap, latest assessment attempts, topic progress, and pending missions. Actions include create a roadmap, reinforce a weak topic, check understanding after completed work, continue a pending mission, start the next unmastered topic, or plan the next chunk when current topics are mastered.
- The recommendation endpoint returns only the chosen action and limited evidence, not assessment questions or answer keys. Roadmap listing now includes the learner's own topic progress and latest assessment score metadata (not assessment questions/answer keys), enabling the UI to display progress labels and recent scores.
- Weekly generation now marks overdue unfinished missions on the active roadmap as expired, then schedules remaining work from topic progress and completed-minute evidence. The next-step endpoint filters out past-dated missions using the learner's IANA timezone, so an old missed session does not remain the permanent recommendation.
- The dashboard's next-move panel now displays the evidence-based recommendation. Recommendations refresh after loading the workspace, creating a goal, activating a roadmap, generating missions, completing a mission, and submitting an assessment. The rule-based policy also schedules retrieval review for mastered topics based on elapsed time and mastery score (7, 14, or 30 day intervals); these thresholds are initial defaults and need learner-data calibration.
- Added a Mission Player inside weekly missions. Learners can open a session guide, read its completion instruction and objective checklist, record a short reflection, and complete the session. The reflection and relevant completion criteria are submitted as mission completion evidence; the UI explicitly distinguishes session completion from mastery.
- Fixed mobile horizontal overflow when the dashboard goal-creation form is expanded, and added Playwright coverage for that regression and for mission reflection/evidence submission.
- Added `npm run smoke:continuity`, which generates two consecutive chunks through local Ollama using simulated completed/mastered first-chunk evidence. Two live runs on 2026-10-20 produced distinct progressions: an initial run moved from setup/data models/CRUD into validation/search/testing, and the latest run moved from Spring Boot/CRUD/validation/integration tests into advanced filtering, search, pagination, and error responses. The latest run had zero exact repeated topic titles. The smoke script warns that title differences alone do not prove meaningful progression, so descriptions/objectives still require review.
- Validation after these changes: `npm test` passed 61/61 including the isolated PostgreSQL integration suite; `npm run check`, `npm run build`, `npm run test:e2e` (4/4), and `git diff --check` passed. One parallel E2E run was flaky before the next-step API was mocked; the full suite passed after the test was isolated from that external request.
- Remaining product phases from the proposed roadmap: calibrate spaced-review thresholds against real learner outcomes and add additional end-to-end journeys covering generated content and adaptation across several learner profiles. The score trend rule is a heuristic, not a validated learning-science model. Do not claim the remaining phases are complete.

## Persistent project milestones (2026-10-21)
- Added a `ProjectMilestone` Prisma model and PostgreSQL migration linked to each roadmap, with ordered status, success criteria, completion evidence, and completion timestamps.
- Added authenticated, ownership-scoped routes to list, generate, and update milestones. Milestones are derived from the confirmed learning brief's capabilities and final deliverable, falling back to roadmap topics when capabilities are absent; a missing final deliverable is rejected rather than invented.
- Generation is idempotent. Completion requires at least 20 characters of evidence and all earlier milestones to be completed. The API prevents moving a milestone backwards when later milestones are already completed.
- Added a dashboard milestone sequence with criteria, progress bar, evidence notes, sequential unlocks, and persisted completion states.
- Added service tests, PostgreSQL integration coverage for idempotency, isolation, evidence validation and ordered completion, plus Playwright coverage for the milestone UI.
- Validation after this batch: Prisma Client generation succeeded after stopping this workspace's dev processes that had locked the Windows query-engine DLL; `npm run db:validate`, `npm test` (64/64 including PostgreSQL integration), `npm run check`, `npm run build`, `npm run test:e2e` (5/5), and `git diff --check` passed. The milestone E2E journey verifies creation, ordered progress, evidence persistence, completion feedback, and no horizontal overflow at desktop and mobile widths.

## Mastery snapshot and review visibility (2026-10-21)
- Extended the authenticated next-step response with a mastery summary for the active roadmap. Each topic includes current progress status, latest assessment score and date, activity freshness, review interval/due state, and whether a recent score suggests more practice.
- Summary totals distinguish mastered topics from completed work, count due reviews and practice gaps, and calculate the average of each assessed topic's latest score. The recommendation and dashboard use the same review-interval calculation to avoid drift.
- Added a compact dashboard snapshot per goal with counts, flagged topics, assessment average, and an explicit reminder that completed work is not the same as demonstrated mastery. The dashboard's existing status banner now also surfaces progress-save and completion feedback outside the goal creation form.
- Added unit tests for summary counts, score averaging, review bands, and due reviews; expanded PostgreSQL integration assertions and Playwright coverage for the snapshot, milestone evidence save, completion, and desktop/mobile overflow.
- Validation: `npm test` passed 66/66 including PostgreSQL integration; `npm run check`, `npm run build`, and `npm run test:e2e` (5/5) passed. Review intervals remain initial defaults and need calibration with real learner evidence.

## Standalone missed session recovery (2026-10-21)
- Added `GET /api/v1/learning-goals/:goalId/missions/recovery` to expire overdue unfinished sessions, summarize unrecovered misses, and return current-week sessions plus a safe-replan flag.
- Added `POST /api/v1/learning-goals/:goalId/missions/recovery/replan`. It refuses to replan while a current session is in progress, removes only unstarted scheduled sessions from the current week, and builds a fresh plan from remaining topic progress. Completed sessions and XP are preserved.
- Added nullable `DailyMission.recoveredAt` with migration `20261021010000_mission_recovery`. Successful recovery marks prior expired sessions as accounted for, so the panel clears and repeated replan attempts return `NO_MISSED_SESSIONS` instead of endlessly rebuilding the week.
- Dashboard recovery panel lists recent missed sessions, explains the safe replanning behavior, and offers an action only when no active session would be disrupted.
- Integration tests verify visibility, blocked recovery with active work, safe replanning, history marking, and prevention of repeated recovery. Playwright covers the recovery journey and desktop/mobile overflow.
- Validation: `npm run db:validate`, Prisma Client generation, and `npm run db:migrate:test` passed; `npm test` passed 66/66 including PostgreSQL integration; `npm run check`, `npm run build`, and `npm run test:e2e` (6/6) passed.

## Evidence-aware review timing and learner profile journeys (2026-10-21)
- The next-step query now fetches the two most recent assessment attempts per topic. Review intervals use the latest assessment score when available rather than letting a stale stored mastery score override new evidence; stored mastery remains the fallback if no assessment exists.
- A score decline of at least 10 percentage points between the two latest attempts shortens the review interval to 7 days, even for a topic previously marked mastered. Mastery summary includes the previous score and a stable/improving/declining trend signal.
- Added unit coverage for score bands, declining performance, and stale mastery versus recent attempts.
- Added a Playwright dashboard journey that switches between a learner needing reinforcement after a low score and a high-performing learner whose mastered topic is due for retrieval review. Both profiles verify different recommendations and responsive layout.
- The 7, 14, and 30 day intervals remain heuristic defaults; no real learner outcome dataset exists here to justify claiming they are calibrated. Validation for this batch: `npm test` passed 68/68 including PostgreSQL integration; `npm run check`, `npm run build`, `npm run test:e2e` (7/7), and `git diff --check` passed.

## Reinforcement guard for recently weak mastered topics (2026-10-21)
- Recommendation priority now treats any latest assessment below 85% as a reinforcement signal, even if historical progress still labels the topic mastered. This avoids sending a learner to a new chunk immediately after a weak check.
- Added boundary assertions for the 85% threshold, a mastered topic scoring 82%, and an improving trend where the latest score should supersede older mastery.
- Validation: `npm test` passed 70/70 including PostgreSQL integration; `npm run check`, `npm run build`, and `npm run test:e2e` (7/7) passed. `git diff --check` remains to be run before commit.

## Per goal recommendations and reinforcement guard (2026-10-21)
- The dashboard now renders each saved goal's own recommended next step inside its card, in addition to the primary next-move panel. This makes separate goal-specific advice visible when learners maintain multiple active goals.
- A latest assessment below 85% now routes to reinforcement even if older progress data still labels the topic mastered, preventing an immediate leap to a new chunk after a weak check.
- Added boundary tests for the 85% practice threshold and improving assessment trends; added Playwright coverage for two goals with different recommendations and mastery profiles.
- Validation: `npm test` passed 70/70 including PostgreSQL integration; `npm run check`, `npm run build`, `npm run test:e2e` (8/8), and `git diff --check` passed.
