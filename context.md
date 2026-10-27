File: context.md

File: context.md

File: context.md

File: context.md

File: context.md

File: context.md

File: context.md




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

## Git commit message convention
- Before creating or amending a commit, inspect recent `git log` entries and follow the repository's Conventional Commit style, using prefixes such as `feat:`, `fix:`, `test:`, or `chore:` as appropriate.
- Use spaces between words in the subject. Do not join words with hyphens or underscores; for example, use `fix: refresh deadline feasibility outlook`, not `fix-refresh-deadline-feasibility-outlook`.
- If a commit subject violates this rule, amend it to match. Include material `context.md` updates in the relevant implementation commit; avoid unnecessary standalone context-only commits.

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

## Immediate review on a declining mastered topic (2026-10-21)
- If a topic remains marked mastered but the two latest assessment scores differ by a decline of at least 10 percentage points, the next-step policy now recommends a retrieval review immediately instead of waiting until the shorter 7 day interval expires.
- Score deltas are rounded to percentage points before threshold comparisons, avoiding floating point edge cases at exactly 10 points.
- Added a regression test for a 99% to 89% decline within the previous day. Validation: `npm test` passed 71/71, `npm run check`, `npm run build`, and `npm run test:e2e` (8/8) passed. Run `git diff --check` before committing.

## Assessment retake consistency (2026-10-21)
- After submitting an assessment, the dashboard now refreshes both the adaptive next step/mastery summary and the persisted roadmap data used for topic status and latest score labels.
- Extended PostgreSQL integration coverage to submit a failed attempt followed by a passing attempt and verify progress transitions from IN_PROGRESS to MASTERED, attempt count increments, and mastery score updates.
- Added Playwright coverage for a learner scoring 54% on an initial assessment, retaking it at 92%, and then seeing the latest check update and next step change from reinforcement to the next unmastered topic.
- Validation: `npm test` passed 71/71 including PostgreSQL integration; `npm run test:e2e` passed 9/9. Re-run `npm run check`, `npm run build`, and `git diff --check` after this batch's final edits.

## Targeted practice in weekly mission generation (2026-10-21)
- Weekly mission generation reads each active roadmap topic's latest assessment score alongside progress status. A recent score below 85% overrides an old COMPLETED or MASTERED label for scheduling purposes and yields a short practice only session instead of a new learn session.
- Practice only scheduling is supported by the mission scheduler and uses a 15 minute target within the daily budget. Historical mastery and completed minute evidence remain intact.
- PostgreSQL integration coverage includes repeated assessments where the learner's latest score falls again after previous mastery; the next generated week adds targeted practice. Scheduler unit coverage verifies the mission type and description.
- Validation: `npm test` passed 72/72 including PostgreSQL integration; `npm run check`, `npm run build`, and `npm run test:e2e` (9/9) passed. Run `git diff --check` before commit.

## Assessment regression and targeted mission recovery (2026-10-21)
- A low retake no longer leaves a stale historical mastery score in `UserTopicProgress`. Scores of 85% or above mark the topic mastered; a weaker retake reopens it as completed work that needs practice, and stores the latest score rather than the maximum ever achieved.
- Weekly mission generation already had targeted practice support, but the active roadmap query must load the current user's latest assessment attempt for that topic. The generated practice is short (up to 15 minutes) and marked `PRACTICE`, instead of silently skipping the topic due to stale progress.
- Completing targeted practice must not demote a previously completed topic to `IN_PROGRESS`, since this would block downstream topics whose prerequisite is already complete.
- Integration coverage now verifies that a weak retake updates status and mastery score and that the next generated mission is targeted practice. `npm test` passes 72/72 including PostgreSQL integration.

## Immediate review visibility for declining mastered topics (2026-10-21)
- A mastered topic with a decline of at least 10 percentage points is now marked `reviewDue` in the mastery snapshot immediately, even when the latest assessment happened less than 7 days ago. This aligns the dashboard's review count with the recommendation policy.
- Added a regression test for a 99% to 89% decline one day after the prior assessment; verifies the topic's review interval remains 7 days but it is already due, and due review count increments.
- Validation: `npm test` passed 73/73 including PostgreSQL integration. Final checks to run: `npm run check`, `npm run build`, `npm run test:e2e`, and `git diff --check`.

## Safe adaptation of an existing weekly plan (2026-10-21)
- Added `POST /api/v1/learning-goals/:goalId/missions/adapt`, which uses the existing safe replan path: it refuses to replace an in progress session, deletes only unstarted current week missions, and retains completed sessions and XP.
- The goal card now exposes an explicit `Adapt this week` action when a current plan has unstarted sessions and the mastery snapshot identifies a practice gap. The dashboard refreshes the plan and recovery/next-step data after adaptation.
- Integration coverage verifies the adapted plan still schedules targeted practice, preserves the daily minutes budget, and has unique mission IDs. The E2E assessment retake journey now exercises the adaptation action.

## Deterministic roadmap continuity guard (2026-10-21)
- Added a deterministic quality check for follow-up chunks: exact normalized topic-title repeats are flagged when prior evidence shows completed/mastered work and a latest assessment of at least 85%, unless the new session explicitly states a purposeful review or reinforcement intent.
- Incomplete topics and completed topics with weak recent assessment evidence remain eligible for repetition. The guard is included in the revision feedback and checked again after the revised proposal to prevent the model from reintroducing the same unjustified repeat.
- Added unit coverage for mastered repeats, low-score gaps, incomplete topics, purposeful retrieval practice, unrelated topics, and missing prior context.
- Validation: npm test passed 75/75 including PostgreSQL integration; npm run check, npm run build, and git diff --check passed. npm run test:e2e passed 9/9. All requested checks passed before commit.

## Continuation smoke audit and test stability (2026-10-21)
- Expanded `apps/api/continuity-smoke.js` to report prior and next chunk descriptions, learning objectives, time estimates, and prerequisites rather than only topic titles. This makes semantic progression auditable instead of treating distinct titles as proof.
- Live Ollama continuation produced a coherent progression: the first chunk introduced Spring Boot setup, PostgreSQL entities, repositories, GET/POST endpoints, and validation; the next chunk advanced to updates/deletion, derived queries, JPQL search, and integration testing. No exact topic-title repeats appeared. Integration testing revisits validation/search deliberately to verify the full API, not to restart instruction.
- The full smoke run produced the detailed output but exceeded the command runner's 240 second limit, so it is not recorded as a clean passing command despite the output being generated. The smoke remains relatively slow because it makes multiple local model requests.
- The default Playwright run attempted nine workers and Chromium crashed/timeouts on this Windows environment. All nine tests passed with one worker, then all nine passed with two workers. Set `workers: 2` in `playwright.config.js` to keep local browser testing reliable without serializing the suite.
- Validation after these changes: `npm run check` and `npm run build` passed; `npm run test:e2e` passed 9/9 with the new default of two workers; `git diff --check` passed. The earlier `npm test` passed 75/75 after database migrations were applied.

## Roadmap estimate and capacity reliability (2026-10-21)
- Roadmap generation now requires a per-session time breakdown for concept/explanation, worked example, guided practice, independent practice, and review/check. Deterministic validation requires non-negative integer phase values, at least three meaningful phases, and an exact match between their sum and `estimatedMinutes`; the independent reviewer also audits the breakdown.
- The generator no longer has a budget helper that silently scales estimates down to fit. `applyChunkBudget` now preserves the estimates and reports whether the proposal fits, and generation revises or rejects over-budget work instead of falsifying time.
- Planning reserves approximately 20% of stated daily availability as a buffer. The effective per-session and total chunk caps are computed from that reduced capacity, and the UI distinguishes calendar days, study sessions, planned workload, available capacity, and reserved buffer.
- `learningBrief` now records planning days, estimated practice days, daily availability, planned daily minutes, total available capacity, planned workload cap, and buffer minutes.
- The phase breakdown is validated during generation but is not persisted as a separate database field; only the verified total estimate is saved. Mission completion now optionally captures self-reported actual minutes in the existing JSON evidence field. The next chunk retrieves up to 30 recent completed sessions and, after at least three valid timing samples, passes the median actual/estimated ratio and examples to both planner and reviewer prompts. This is evidence-guided calibration, not yet a deterministic multiplier.
- Added tests for breakdown arithmetic/shape, safety-buffer prompts, consistent session counts, and honest over-budget behavior.

## Rolling roadmap generation
- Goal creation asks for a target duration in days and stores the calculated date in the existing `LearningGoal.targetDate` field; the dashboard shows the saved target date.
- The first generated roadmap chunk defaults to 3 calendar days. The learner's target date remains separate from the current chunk's `planningDays`.
- Local Ollama structured roadmap generation defaults to low reasoning and a topic-count-based output-token budget (3,072 tokens for a 2–3-session chunk, capped at 6,144 for larger chunks) to reduce incomplete JSON/retry loops. Enable `AI_DEBUG=true` to log structured-JSON parse failures and the roadmap service error code without logging prompts or credentials.
- Activating the initial roadmap calls `POST /api/v1/learning-goals/:goalId/missions/initial`, which schedules the first up to 3 study dates (not a full week) and enforces the 20% daily buffer.
- After a mission completion, the frontend calls `POST /api/v1/learning-goals/:goalId/roadmaps/roll-forward?timeZone=...` with the mission's scheduled date. The API waits until all sessions for that date are complete and only generates when fewer than 3 upcoming study dates remain.
- Rolling generation creates 1–2 study dates of continuation work, greedily packs topics within the buffered daily budget, preserves existing/completed missions, activates the continuation chunk, and schedules it after already-planned dates. A per-process goal lock avoids duplicate concurrent generation on a single API instance.
- Rolling generation stops at the saved goal deadline and returns a no-op when the buffer is full, the day is unfinished, or no study date remains before the deadline. A persistent `RoadmapGenerationRun` ledger now uses a unique `(learningGoalId, triggerDate)` key and a 10-minute lease to prevent duplicate cross-instance generation on refresh/retry; completed runs return their existing roadmap/missions, active leases no-op, and failed/expired runs can be retried.
- The enhanced learning brief now estimates remaining total effort and provides a confidence level. Pathwise compares that estimate with buffered study capacity through the saved deadline and shows an on-track, at-risk, over-capacity, overdue, or no-deadline outlook. Later chunks receive the previous estimate plus completion, assessment, unfinished-session, and timing evidence to update the remaining estimate; it is advisory, not a guarantee.
- Roadmap generation receives the browser's IANA time zone for deadline-capacity calculations. Tests cover deadline capacity bands, missing estimates, completed-run idempotency, and an active cross-instance generation lease. The database migration is `20261021020000_rolling_generation_runs`.

## Roadmap generation 502 investigation (2026-10-21)
- Investigated the reported `POST /api/v1/learning-goals/:goalId/roadmaps/generate` 502 after approximately 108 seconds. The affected saved goal was `Java`, target outcome `Ge good in DSA`, beginner, 60 minutes/day, 7 days/week.
- Replayed the generator directly with that goal and a 3-day chunk. The live Ollama run succeeded in approximately 102 seconds and produced three sessions totaling 128 minutes, within the 144-minute buffered chunk budget. It required five model requests (enhanced brief, draft, review, revision, and deterministic repair), so the earlier 502 was not reproduced; model output variability remains a likely contributor, not a confirmed root cause.
- Added opt-in `AI_DEBUG=true` diagnostics for each structured provider request (start, HTTP latency/status, token counts, parse outcome), reviewer decision/issue codes, and each deterministic repair validation attempt. Logs deliberately omit prompts, goal text, API keys, and credentials. The roadmap service already logs the final generation error code and message in debug mode.
- Validation after this diagnostic change: `npm test` passed 82/82 including PostgreSQL integration; `npm run check`, `npm run build`, `npm run test:e2e` (9/9), and `git diff --check` passed. The direct live Ollama reproduction passed. A 502 must be considered unresolved until a full authenticated API generation is observed succeeding or the newly logged failing error code is captured.

## Rolling window completeness audit (2026-10-21)
- Audited the requested initial-three-day and completion-triggered rolling window. The existing flow already schedules up to three initial study dates, only generates when upcoming dates fall below three, carries progress/assessment/timing evidence forward, preserves the saved goal deadline, and respects the 20% daily buffer.
- Closed two gaps found in the audit: (1) rolling generation previously had only a process-local lock, so separate API workers could both spend GPU time and create separate roadmap versions; (2) the learning brief explicitly instructed the model not to estimate the total remaining work, so deadline feasibility was not surfaced.
- Added persistent `RoadmapGenerationRun` idempotency keyed by goal and trigger date, with a 10-minute lease, retryable failed/expired runs, and returning the already-generated result on repeated requests. Initial mission rows also remain protected by the existing database uniqueness constraint.
- Enhanced learning briefs now contain `estimatedRemainingMinutes` and `estimateConfidence`. The service calculates available study dates/minutes through the goal deadline using the buffered daily cap and attaches a feasibility status/recommendation; the dashboard surfaces this outlook and asks for scope/time/deadline trade-offs when capacity is insufficient.
- Validation after this audit: `npm run db:validate`, Prisma Client generation, test and development DB migrations, `npm test` (86/86), `npm run check`, `npm run build`, `npm run test:e2e` (9/9), and `git diff --check` passed. The live software-engineering smoke test passed with a 250-minute remaining-work estimate at low confidence and a 103-minute first chunk; the smoke output now exposes the remaining-work estimate and confidence for review. The development server was restarted after Prisma generation.

## Live deadline outlook refresh (2026-10-21)
- Roadmap listing now recalculates deadline feasibility against the current date, saved goal deadline, current daily availability, and remaining-work estimate instead of returning only the status stored when the chunk was generated. This prevents the dashboard from continuing to show an old on-track status after a deadline passes or the capacity outlook changes.
- The roadmap list endpoint accepts a validated IANA `timeZone` query parameter. Dashboard roadmap-list requests now send the browser's timezone.
- Over-capacity recommendations now quantify the minute shortfall, the average minutes needed per remaining study day, the extra daily minutes above the buffered plan, and approximate additional study/calendar days. These are planning estimates; calendar-day extension is approximate when study days are distributed unevenly.
- Added a PostgreSQL-backed API integration test that creates a real user, goal, and roadmap, then verifies the same saved roadmap changes from `ON_TRACK` to `DEADLINE_PASSED` as the goal's persisted target date changes, even though the original saved outlook was stale.
- Verification: `npm test` passed 87/87 including PostgreSQL integration; `npm run test:e2e -- --workers=2` passed 10/10 after updating route mocks for timezone query strings; `npm run check`, `npm run build`, and `git diff --check` passed. Dashboard E2E uses mocked API data; the new API integration test exercises real PostgreSQL persistence and the live endpoint.

## Learning design research and longitudinal follow-up (2026-10-22)
- Added `Pathwise Learning Design Research 2026-10-22.md` with research across learning science, the roadmap.sh catalogue and representative Full Stack / DSA / Machine Learning paths, Duolingo's adaptive lessons and Music course, JustinGuitar, Fender Play, Ableton Learning Music, and deliberate-practice evidence. It documents design implications, domain-specific lesson archetypes, an evaluation scorecard, priorities, source links, and scope limitations.
- Follow-up generation now queries up to four recent ACTIVE/SUPERSEDED roadmap versions for the goal and supplies their topics, progress, recent assessment attempts, and mission status to the generator, rather than losing long-term context after one rolling chunk.
- Continuation prompts distinguish completion from mastery, self-report from objective evidence, latest assessment attempts from older scores, and quiz evidence from practical performance. The reviewer now audits those distinctions too.
- Each generated follow-up draft gets a deterministic `continuationSummary` that explains recent evidence signals and lists the next chunk's focus; the roadmap draft UI displays it for the learner.
- Added unit tests for four-chunk context, continuation summaries, and a weak retake not being overridden by an older strong score. Validation: `npm test` passed 90/90 including PostgreSQL integration; `npm run check`, `npm run build`, `npm run test:e2e -- --workers=2` (10/10), and `git diff --check` passed.
- Added `Pathwise Cross Domain Generation Audit 2026-10-22.md` after a four-domain live Ollama smoke sample (ML deployment, guitar, beginner Spanish, ESP32 robotics). The harness now reports chunk duration separately from estimated time to the full goal.
- The live audit uncovered a priority defect: `applyRealismFloor` exists but is not called by `generateRoadmap`; a named-song guitar sample returned only 250 remaining minutes despite the intended 1,800-minute beginner-song floor. The guard must be wired into the actual pipeline and the remaining-effort estimate must stay consistent before relying on deadline outlook for this case.
- Research findings are hypotheses for Pathwise, not proof of improved learner outcomes. Next: fix the unused realism floor, then test first-chunk and persisted continuation generation across domains with an explicit scorecard.

## Cumulative practice routines and first-chunk effort guard (2026-10-22)
- Added domain-aware cumulative-practice guidance to `buildPrompt` and the independent roadmap review. Guitar/instrument sessions retrieve recent chords/techniques, introduce new material gradually, and integrate the growing set into music; language sessions recycle vocabulary in listening and production; coding revisits concepts through changed inputs/tests; robotics reruns known-good subsystem checks before adding and integrating one change; a general fallback uses retrieval, focused practice, and authentic integration.
- The explicit guitar progression in the prompt is: Day 1 learn two chords; Day 2 recall and switch between them, then introduce a third; Day 3 revisit all three, isolate the weakest transition, and add only a manageable next step. It also says not to require perfection before moving forward and to use observable performance evidence.
- Updated the learning-design research report with a cumulative-practice section, a day-by-day guitar example, and examples for language, coding, robotics, academics, creative and physical skills. Public JustinGuitar course sequencing/consolidation guidance was reviewed as a real-world example.
- Fixed the beginner guitar-song realism floor so it applies to the first-chunk remaining-goal estimate only, not by scaling current chunk topics (which would violate phase arithmetic and session budgets). It now sets a conservative 1,800-minute remaining estimate at low confidence, keeps current chunk duration unchanged, and does not reset that floor for continuations with prior learning context.
- Added tests for cumulative-practice guidance in guitar/language/coding/robotics and for the realism floor preserving chunk timing and respecting continuation context.
- Validation after these changes: `npm test` passed 92/92; `npm run test:e2e -- --workers=2` passed 10/10; `npm run check`, `npm run build`, and `git diff --check` passed. A targeted live guitar smoke attempt could not reach the configured local Ollama provider (`ROADMAP_PROVIDER_UNAVAILABLE`; Ollama was stopping/unavailable), so live output confirmation remains pending. The audit report records this as an infrastructure failure, not a generation pass.

## Learner-led roadmap generation refactor (2026-10-22)
- Removed the hardcoded beginner guitar-song remaining-effort floor; remaining effort must come from the model's goal- and evidence-specific estimate rather than a domain-specific constant.
- Roadmap generation no longer requires exactly one topic per study day. The model may choose a useful number of sessions rather than filling a quota.
- The learner's stated minutes are now the available planning budget instead of an automatic 80% cap. Session estimates still must be realistic and fit the available window; the planner should defer work rather than compress it.
- Phase-by-phase lesson breakdowns are optional guidance, not a hard validation gate. The coach should choose the teaching structure appropriate to the skill and learner rather than forcing every activity into the same five phases.
- Updated prompts toward adaptive coaching: use prior knowledge and demonstrated evidence to choose the next useful step, keep practice cumulative when relevant, and avoid fixed day-by-day domain sequences.
- Second-pass coaching refinement: teaching phases are no longer required in every session, assessment scores are interpreted in context rather than fixed universal bands, and the reviewer no longer triggers repairs solely because a numeric score falls below an arbitrary threshold. Remaining-effort estimation is prompted as a capability-based, uncertainty-aware planning hypothesis.
- Added a learner check-in to each session: `I got stuck`, `About right`, or `Too easy`. The selected feeling and reflection are saved with completion evidence and carried into the next rolling chunk. The coach prompt now responds to those signals with targeted scaffolding or stretch work instead of treating every learner as following a fixed sequence.- Reframed planner, reviewer, and repair prompts around an adaptive coach that proposes the next useful step instead of enforcing a fixed curriculum. Completion reflections and the learner’s `STUCK` / `ABOUT_RIGHT` / `TOO_EASY` check-in now feed into future chunk context; low scores are treated as a signal to inspect errors rather than an automatic route change.
- Named-song guitar goals now have a deterministic bridge to a trusted arrangement reference. If the model avoids song-specific details entirely, the rolling chunk still includes reference work; when the reference is missing, the planner uses a safe progression (reference + first chord, second chord + transition, then rhythm/transfer) and does not assume a second chord was taught before asking for transitions.

## Experimental roadmap display flow (2026-10-22)
- Work is isolated on branch `fix/roadmap-generation-display`; master was not committed to or modified by a branch commit.
- The dashboard's Generate learning plan action now calls roadmap generation directly and skips the clarification-question endpoint. The initial chunk defaults to three calendar days.
- While the model runs, the goal card shows a live status indicator and keeps the action disabled to prevent duplicate requests. On success, the saved roadmap is inserted into the goal card immediately; if the response omits topics, the UI reloads the saved roadmap before displaying it. API errors are shown in the existing notice area.
- Added a Playwright regression test that verifies the questions endpoint is not called and the returned day-by-day roadmap appears in the UI.
- Validation: `npm run check`, `npm run build`, `npm test` (99/99), `npm run test:e2e -- --workers=2` (11/11), `npm run db:validate`, and `git diff --check` passed. The E2E uses a mocked AI response; a live-model browser round trip has not yet been verified.

## Experimental generator malformed JSON recovery (2026-10-22)
- On branch `fix/roadmap-generation-display`, the direct Ollama generator now tries balanced JSON objects (including JSON wrapped in markdown or brief surrounding text) instead of assuming the first-to-last braces form one object.
- If the model output is malformed or lacks the required boolean `viable`, the generator makes one bounded repair request asking for a single valid JSON object. It does not ask the learner clarification questions or add another planning/review stage.
- Regression coverage includes a malformed first response followed by a valid repaired response. Validation now passes: API tests 100/100, check/lint, production build, E2E 11/11, Prisma validation, and `git diff --check`.
- The browser E2E still mocks the model. A live Ollama request has not been confirmed after this repair. If the API still logs `Failed running './bin/www'`, capture the API terminal's stack trace immediately before that line; the Vite port 5173 message only means another process already owns that port, so Vite picked 5174.

## Ollama format selection for roadmap generation (2026-10-22)

- The experimental roadmap generator selects Ollama's `format: "json"` for model names containing `gemma4`, because Gemma 4 supports JSON-only mode rather than schema-constrained output.
- Other local Ollama models receive a JSON Schema requiring a boolean `viable` field and defining the expected roadmap shape.
- The OpenAI-compatible remote path continues to use `response_format: { type: "json_object" }`.
- Regression coverage verifies Gemma 4 gets the string `"json"` and another local model gets the schema object.

## Recovery when viable decision omits roadmap (2026-10-23)

- Experimental roadmap generation now uses its single bounded repair attempt for malformed JSON, a missing boolean `viable`, or a viable response that omits the actual roadmap fields.
- The missing-content repair explicitly asks for a `roadmap` object with title, summary, topics, and the required topic fields, and says not to return only a viability assessment.
- A model-declared non-viable goal is still returned immediately with its reason; it is not retried into a potentially misleading plan.
- Regression coverage verifies a `viable:true` response without roadmap content is repaired into a usable roadmap.

## Roadmap generation update (2026-10-23)

- Removed the viability judgement from the experimental generator prompt and output schema. The model's job is to return the roadmap, not decide whether generation is allowed.
- A response with a complete roadmap is accepted whether or not it contains an optional viability field; a response that omits roadmap content gets one bounded repair request focused on the roadmap itself.
- The structured schema for non-Gemma local models now requires title, summary, and topics, with no viability property. Gemma 4 continues to use JSON-only format mode.
- Regression coverage verifies generation succeeds without a viability field and the prompt/schema do not require one.

## Experimental generator chunk-boundary fix (2026-10-23)

- The live Gemma 4 request used the overall goal deadline as the generation horizon. For a goal roughly 39 days away, the prompt asked for day-by-day topics over that entire period; the model hit its 8,192-token output cap on both the first response and repair request, then returned a 502 because no complete roadmap content was available.
- The experimental generator now separates the overall goal deadline from the rolling chunk length. It receives `planningDays` from the roadmap service (default 3), asks only for the next chunk, and explicitly says the deadline is not the chunk length.
- The output budget is now bounded by chunk size: 2,048 tokens for a one-day chunk, 3,072 for two or three days, and 6,144 for larger chunks. The repair prompt repeats the chunk limit instead of asking for a full curriculum.
- Added tests for the next-chunk prompt, planningDays propagation/default, and token budget. Validation: `set AI_CONTEXT_LENGTH=16384&& npm test` passed 103/103; `git diff --check` passed. The workspace .env sets a 32,768-token context, which makes three pre-existing tests expecting 16,384 fail unless the test command overrides that variable.
- Backup copies were created before editing; keep them outside the repository so they do not appear as untracked project files.

## Experimental generator single-request change (2026-10-23)
- The experimental generator now makes exactly one model request per generation. It no longer sends a second repair prompt after malformed JSON or a response missing roadmap fields; those cases return a specific generation error instead.
- The prompt explicitly asks for one concise JSON object and preserves the existing rolling-chunk limit. This removes the extra 6-second repair request observed in recent live logs, but does not by itself reduce the first request's ~29-second generation time.
- Regression tests assert one provider call for successful output, malformed JSON, and missing roadmap content. set AI_CONTEXT_LENGTH=16384&& npm test passed 103/103.
- Trade-off: malformed/incomplete model output now fails immediately instead of attempting recovery. A live Ollama smoke test and the remaining check/build/E2E/database validation have not yet been run after this change.

## Unrestricted initial roadmap generation (2026-10-23)
- The initial Generate learning plan endpoint now asks the model to plan the complete learning journey rather than limiting it to the rolling `planningDays` value.
- Initial generation has no application-set output-token ceiling: native Ollama receives `num_predict: -1`, and the hosted request omits `max_tokens`. It remains a single model request, with no automatic repair call.
- Follow-up rolling chunks remain bounded because the mission scheduler must place those sessions within the available dates and daily time budget. The roadmap validator still validates fields and prerequisite integrity, but no longer caps the number of topics at 40.
- Added tests for the unrestricted initial prompt and unbounded local/hosted request settings. `set AI_CONTEXT_LENGTH=16384&& npm test` passed 104/104. Live Ollama verification and full check/build/E2E/database validation are pending.

## Rolling continuation idempotency repair (2026-10-26)

- Fixed a continuation-generation blocker where generation runs were uniquely keyed by learning goal + trigger date. After one chunk generated, a later chunk completed on the same date could find the earlier chunk's completed run and return `ALREADY_GENERATED` instead of generating the next chunk.
- `RoadmapGenerationRun` idempotency is now scoped to source roadmap + trigger date. Each active chunk can therefore generate its own continuation on the same date, while retries for that same source chunk/date remain idempotent. Updated the Prisma unique constraint and added migration `20261026100000_scope_rolling_runs_to_source_roadmap`.
- Updated the dashboard's continuation feedback to explicitly handle `CHUNK_HAS_UNFINISHED_SESSIONS` and `GENERATION_IN_PROGRESS`, and to surface other non-generation reasons instead of silently leaving a stale notice.
- Regression coverage checks that a continuation lookup uses the active source roadmap key and does not reuse a previous chunk's generation run.
- Validation on 2026-10-26: API tests passed 118/118 including PostgreSQL integration; root `npm run check`, `npm run build`, and `npm run db:validate` passed. The migration was applied successfully to the isolated `gamified_learning_test` database with `npm run db:migrate:test`.
- E2E result: 10/11 passed. One existing mocked generation journey failed waiting for the fixture title “Guitar day-by-day plan”; this needs separate investigation and the suite is not considered fully green. No claim of live Ollama continuation or full multi-chunk browser verification has been made.
- Working branch: `feat/streamed-weekly-roadmap-generation`. Preserve the pre-existing untracked files `apps/web/src/App.jsx.backup-20261024` and `apps/web/streamed-app-check.js`; do not stage unrelated files.

## Frontend refresh after rolling generation (2026-10-27)

- After a successful rolling continuation, the dashboard now reloads the authoritative persisted roadmap list and mission list from the API rather than optimistically inserting the generation response into React state. This avoids relying on a partial or mismatched response shape when rendering the newly generated chunk.
- The success path also refreshes the next-step recommendation and mission recovery state.
- Validation after the change: `npm run check`, `npm run build`, and `npm test` passed; API tests passed 118/118, including PostgreSQL integration. Browser verification of the specific previously generated chunk remains outstanding.

## Server-owned rolling continuation trigger (2026-10-27)

- Mission completion now invokes the rolling continuation gate from the API after the completion and XP transaction commits. The browser no longer needs to successfully fire a separate best-effort roll-forward request for the next chunk to be considered.
- The completion route accepts the browser's validated IANA timezone and passes it to the rolling scheduler. Continuation results or structured continuation errors are returned alongside the saved completion; a continuation failure does not undo the already-persisted completion or XP.
- The dashboard consumes the server-returned continuation result, refreshes persisted roadmaps/missions on generation, and displays failures rather than silently leaving the old chunk visible.
- Updated the mission-player E2E mock for the timezone query and continuation result. Validation: API tests 118/118, `npm run check`, `npm run build`, Prisma validation, and `git diff --check` passed. E2E has 10/11 passing after correcting the mission-player URL mock; the remaining generated-roadmap fixture test still fails to find its expected title and is unrelated to continuation generation.

## Rolling generation retry after a transient lock (2026-10-27)

- Fixed a frontend race where the completion response and dashboard catch-up effect could overlap. If the completion response reports `GENERATION_IN_PROGRESS`, the completion flow now retries the authoritative roll-forward request twice with a short delay instead of treating the lock response as final.
- Dashboard catch-up now releases its per-roadmap in-flight guard after a non-terminal response or request error. This prevents one stale/transient attempt from permanently blocking future catch-up checks for that roadmap.
- This addresses the case where the next chunk was never requested from the AI because an overlapping request returned early at the generation-lock gate. Duplicate model calls remain protected by the server-side lock and persisted generation lease.
- Validation after the change: `npm test` passed 118/118; `npm run check`, `npm run build`, `npm run db:validate`, and `git diff --check` passed. `npm run test:e2e` remains 10/11: the pre-existing mocked generated-roadmap journey still fails to find the fixture title “Guitar day-by-day plan”. Live multi-chunk verification against Ollama has not yet been performed.
## Dashboard toast notifications (2026-10-27)

- Replaced the in-flow green dashboard status banner with a fixed top-of-screen toast, so notices no longer push dashboard content down or leave a large empty area.
- Toasts include a dismiss (�) button, appear with a short downward entrance, and automatically clear after five seconds; CSS fades them upward/out at the end of the five-second window. Repeated notice updates restart the timer.
- Added reduced-motion handling. Existing notice types and message sources remain unchanged.

## Learning goals in the sidebar (2026-10-27)

- Added a compact `YOUR GOALS` list directly below `New learning goal`, with one shortcut per saved learning goal (for example, Java or Guitar), in a chat-history-inspired style.
- Selecting a goal toggles its expanded details and smoothly scrolls its goal card into view. The active expanded goal is highlighted in the sidebar. Goal cards now have stable IDs for navigation.
- The list scrolls independently if the user has many goals; existing create-goal and profile controls remain in place.

## Deadline outlook respects learner time limits (2026-10-27)

- Clarified over-capacity recommendations: Pathwise no longer tells the learner to schedule longer sessions as the default way to meet the deadline. It explicitly keeps the chosen daily limit as the planning constraint and recommends extending the deadline or reducing goal scope; increasing availability is presented only as the learner's choice.
- Added regression assertions to ensure the over-capacity message respects the learner's daily limit and does not instruct them to exceed it.

## Simplified roadmap card information (2026-10-27)

- Removed the verbose workload-capacity and deadline-outlook panels from roadmap cards, along with the large Enhanced learning brief display and its unused detail lists.
- Kept the draft activation confirmation as a short, plain checkbox so the existing confirmation-required activation flow still works.

## Roadmap deletion handler restored (2026-10-27)

- Restored the missing `handleDeleteRoadmap` frontend handler. The roadmap card still rendered its Delete button, but the handler was accidentally removed during the roadmap-card simplification, causing the button to fail when clicked.
- The restored handler keeps the existing safe behavior: ask for confirmation, call the authenticated draft-roadmap DELETE endpoint, remove the deleted draft from frontend state, show success/error feedback, and release the busy state in `finally`.
- Deletion scope remains drafts only; active and superseded chunks are intentionally protected by the API to preserve learning history.
- Regression checks: verify the Delete button invokes the handler, cancellation makes no request, successful deletion removes the draft card, and API errors remain visible.


## Groq hosted generation branch (2026-10-27)
- Created branch `feat/groq-generation` from the current working branch, preserving the pre-existing uncommitted frontend removal and unrelated untracked files.
- Switched AI provider defaults from local Ollama to Groq's OpenAI-compatible API at `https://api.groq.com/openai/v1`, using model `openai/gpt-oss-120b`.
- Updated roadmap, clarification-question, assessment, and experimental roadmap generator defaults; Groq requests use non-strict JSON-schema mode where the existing schemas contain optional fields, followed by existing server-side validation.
- Updated `.env.example` and README setup guidance. The local ignored `.env` now points to Groq and the selected model; its existing `AI_API_KEY` value was preserved and was not displayed. A valid Groq API key is still required for live generation.
- Validation: `npm test` passed 118/118; `npm run check` and `npm run build` passed; `git diff --check` passed. The web lint reports four existing unused-code warnings in the project-milestones UI code that was previously removed. No live Groq request was made because the key's availability was not verified.

## Weekly generation limits and daily availability (2026-10-27)

- Hosted roadmap generation now caps a chunk at the learner's available study days, with an absolute maximum of seven sessions/topics. The planner and reviewer prompts both state this hard limit; the structured output schema also caps topics at seven.
- `planningDays` is treated as a count of study days, capped at seven and at the learner's configured `daysPerWeek`, rather than converted into fewer days using calendar-week arithmetic.
- Each generated session may use up to the user's full configured `minutesPerDay`; the draft and rolling-generation scheduling budgets no longer apply an implicit 80% multiplier. Recovery replanning now uses the same full daily availability.
- Generation flags too many sessions as a required revision issue; a still-invalid revision fails rather than saving extra sessions. The prompt discourages splitting one day's work into multiple short 12–20 minute topic entries when a coherent daily session is appropriate. It does not inflate genuine short activities merely to fill time.
- Regression coverage verifies the weekly prompt uses the configured number of study days, the daily minute limit, and the deterministic excess-session guard.

## Learning workspace UI simplification (2026-10-27)
- The sidebar is now the source of truth for active learning-goal selection. Only the selected goal's card and roadmap are rendered in the main learning-path area; selecting another goal switches the active goal rather than toggling multiple roadmaps open.
- The first saved goal is selected on workspace load when there is no still-valid selection. Newly created goals become selected; deleting the active goal selects another remaining goal when available.
- Simplified the learning path presentation with CSS-only changes: removed nested card borders and the dashed/repeating timeline, using subtle charcoal dividers, a fine solid connector, and more open session rows. Expanded the content width for desktop readability.
- Preserved the existing dark charcoal, off-white text, muted gray, and orange Pathwise palette. No API, generation, assessment, mission, or progress behavior was intentionally changed.

## Learning path layout correction (2026-10-27)
- Follow-up visual review found the single selected goal was still inside a two-column grid, leaving it at half width, and the previous minimalist overrides removed too much card hierarchy.
- Changed the selected goal layout to a single full-width column and restored intentional dark-surface card hierarchy for goal details, roadmap header, and individual sessions.
- Preserved the current charcoal, muted gray, off-white, and orange palette. No functional learning behavior was intentionally changed.

## Existing-user add learning goal form polish (2026-10-27)
- When a signed-in learner already has goals and opens the add-goal flow, hide the onboarding/marketing hero and present a single centered form in the main content area instead of leaving an awkward split layout and unused space.
- Added a clear cancel control to close the add-goal flow without changing the existing goal.
- Kept the current charcoal, off-white, muted-gray, and orange palette. Form submission and goal creation logic are unchanged.

## Goal form defaults (2026-10-27)
- New learning goals default to seven study days per week. The onboarding/add-goal form no longer displays the weekly rhythm selector; the submitted value remains explicitly set to 7.
- Removed the explanatory helper beneath the target-duration field at the user's request. Target duration input and validation are unchanged.
- Existing charcoal/off-white/gray/orange palette is unchanged.

## Floating app notifications (2026-10-27)
- App notices, including streaming roadmap-generation status, render as a fixed top-center toast instead of inline content that changes dashboard/form layout.
- Toast uses the existing charcoal and orange palette, has an accessible status/alert role, and can be dismissed. It overlays the app without consuming document flow space.
- Removed the inline notice from the goal form to prevent duplicate notifications.
