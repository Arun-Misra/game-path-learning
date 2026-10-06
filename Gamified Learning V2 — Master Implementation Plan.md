# Gamified Learning V2
## Master Implementation Plan & TODO

**Product vision:** A personalised learning platform that turns any skill a user wants to learn into an actionable, adaptive learning journey, with backend-enforced progress tracking and gamification.

**Core principle:** The frontend presents the experience. The backend owns the application state, business rules, and authoritative decisions.

---

# 1. Product Requirements

The application must allow a user to:

1. Describe any skill they want to learn.
2. Explain their existing knowledge and experience.
3. Define a target outcome.
4. Specify how much time they can commit.
5. Receive a personalised, structured learning roadmap.
6. Follow daily missions derived from that roadmap.
7. Complete exercises and assessments.
8. Track progress and demonstrated mastery.
9. Earn XP, levels, streaks, and achievements through genuine learning activity.
10. Receive adjustments to their future learning plan based on their performance and availability.

The system must not depend on a predefined catalogue of skills. Users should be able to learn programming, mathematics, guitar, robotics, fitness-related skills, or other subjects.

The roadmap-generation system must accommodate different learning requirements rather than forcing every skill into an identical content template.

## Definition of success

A user can create an account, describe an unfamiliar skill, provide their background and schedule, receive and review a personalised roadmap, complete a mission, and see their progress persist after refreshing the application or signing in again.

The application must be functional end to end, not merely a collection of screens.

---

# 2. Architecture Decisions

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query
- Zod for appropriate client-side validation

Responsibilities:
- Render the interface.
- Collect user input.
- Display roadmaps, missions, and progress.
- Send API requests.
- Present loading, error, and success states.
- Provide responsive interactions and animations.

The frontend must not make authoritative business decisions or access the database directly.

## Backend

- Node.js
- Express
- TypeScript
- Prisma
- Zod
- Vitest
- OpenAPI for API documentation

Responsibilities:
- Authentication and authorization.
- Input validation.
- Learning-goal management.
- AI orchestration.
- Roadmap generation and validation.
- Prerequisite analysis.
- Scheduling and mission generation.
- Assessment processing.
- Progress and mastery calculations.
- XP, streaks, and achievement calculations.
- Database transactions.
- Analytics and reporting.

## Database

**PostgreSQL with JSONB.**

Use relational tables for users, goals, roadmaps, topics, prerequisites, missions, assessments, progress, and gamification records.

Use JSONB for genuinely variable structures, including generated exercises, assessment configurations, and skill-specific learning content.

Do not create a separate database schema for each skill.

Do not store the entire application state in a single JSON document.

## Repository structure

Create a new application alongside the existing project, with its own implementation and Git history as appropriate.

Proposed structure:

    gamified-learning-v2/
    ├── apps/
    │   ├── web/
    │   └── api/
    ├── packages/
    │   └── contracts/
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── tests/
    ├── .env.example
    ├── .gitignore
    ├── package.json
    └── README.md

The precise structure can be refined after inspecting the existing project and deciding how to organise the new repository.

---

# 3. Phase 0 — Workspace and Repository Foundation

## TODO

- [ ] Reconnect to the coding workspace.
- [ ] Verify the correct workspace and repository root.
- [ ] Inspect the existing project's directory structure.
- [ ] Check Git status before making changes.
- [ ] Inspect the current frontend, routing, components, styles, and assets.
- [ ] Identify existing features worth referencing or reimplementing.
- [ ] Identify existing authentication, database, and business-logic implementations.
- [ ] Record the current Git branch and recent commit history.
- [ ] Create the new application in a separate directory or repository.
- [ ] Confirm that the original application remains untouched.
- [ ] Initialise or configure Git for the new application.
- [ ] Add environment files to `.gitignore`.
- [ ] Create `.env.example` without real credentials.
- [ ] Establish the development commands for the frontend, backend, and tests.
- [ ] Verify that the initial application builds and starts successfully.

## Completion criteria

The new project has an independent codebase, a working development environment, a clean Git state, and a documented understanding of the existing frontend design.

Do not start a large-scale migration before this foundation is established.

---

# 4. Phase 1 — Backend and Database Foundation

## 4.1 Backend setup

- [ ] Initialise the Express and TypeScript application.
- [ ] Configure development and production scripts.
- [ ] Add environment-variable validation.
- [ ] Configure centralised error handling.
- [ ] Configure request validation.
- [ ] Establish consistent API response and error formats.
- [ ] Add request logging and appropriate security middleware.
- [ ] Configure CORS for the intended frontend origin.
- [ ] Add health-check and readiness endpoints.
- [ ] Configure API versioning where appropriate.
- [ ] Establish the OpenAPI contract.
- [ ] Create module and service boundaries.

## 4.2 PostgreSQL setup

- [ ] Configure PostgreSQL connectivity.
- [ ] Integrate Prisma.
- [ ] Create the initial Prisma schema.
- [ ] Configure database migrations.
- [ ] Define foreign-key relationships.
- [ ] Define uniqueness constraints.
- [ ] Define indexes for important queries.
- [ ] Establish transaction-handling conventions.
- [ ] Add a development seed mechanism.
- [ ] Verify migrations against a fresh database.
- [ ] Verify that the application can connect and execute queries.

## 4.3 Initial data model

Introduce the following entities when required by the corresponding workflows:

- [ ] `users`
- [ ] `sessions` or the chosen authentication persistence model
- [ ] `learning_goals`
- [ ] `skill_assessments`
- [ ] `roadmaps`
- [ ] `roadmap_versions`
- [ ] `roadmap_topics`
- [ ] `topic_prerequisites`
- [ ] `user_topic_progress`
- [ ] `daily_missions`
- [ ] `mission_completions`
- [ ] `assessment_attempts`
- [ ] `xp_transactions`
- [ ] `achievements`
- [ ] `user_achievements`
- [ ] `learning_activity`

The exact schema must follow the real workflows. Avoid adding unnecessary tables or creating abstractions without a demonstrated need.

## Completion criteria

The API starts successfully, PostgreSQL connectivity works, migrations run reliably, and the first integration tests can interact with a real test database.

---

# 5. Phase 2 — Authentication and User Management

## TODO

- [ ] Implement registration.
- [ ] Implement login.
- [ ] Implement logout.
- [ ] Implement the authenticated-user endpoint.
- [ ] Implement secure password hashing if using local password authentication.
- [ ] Configure secure session handling.
- [ ] Add authentication middleware.
- [ ] Add resource-level authorization checks.
- [ ] Protect user-specific API endpoints.
- [ ] Prevent users from accessing another user's goals, roadmaps, missions, or progress.
- [ ] Validate all authentication-related requests.
- [ ] Add rate limiting to sensitive endpoints.
- [ ] Handle expired sessions and unauthenticated requests.
- [ ] Test invalid credentials and unauthorized access.

## Security requirements

- Authentication must be verified by the backend.
- The backend must derive user identity from the verified session or token.
- The backend must never trust a user ID supplied in the request as proof of identity.
- Secrets must remain server-side.
- Session and cookie configuration must account for HTTPS, CSRF, and deployment origins.

## Completion criteria

A user can register, log in, access their own protected resources, log out, and no longer access protected resources without a valid authenticated session.

---

# 6. Phase 3 — Personalised Onboarding

This is the entry point to the product's main learning workflow.

## 6.1 Capture the learning goal

- [ ] Allow users to describe any skill in natural language.
- [ ] Capture the intended outcome.
- [ ] Support optional target dates.
- [ ] Preserve the user's original goal description.
- [ ] Validate and persist the goal through the backend.
- [ ] Allow users to review and edit their goal before generating a roadmap.

Example:

"I want to learn machine learning so I can build and deploy my first working model."

## 6.2 Capture existing knowledge

- [ ] Ask about the user's experience level.
- [ ] Capture known topics and relevant background.
- [ ] Allow users to describe their knowledge in their own words.
- [ ] Distinguish self-reported knowledge from assessment evidence.
- [ ] Support skill-specific diagnostic questions.
- [ ] Store assessment answers and results.
- [ ] Identify likely prerequisite gaps.

## 6.3 Capture availability

- [ ] Capture available minutes per day.
- [ ] Capture available days per week.
- [ ] Capture preferred session duration.
- [ ] Capture an optional completion target.
- [ ] Validate the schedule.
- [ ] Calculate available weekly learning time.
- [ ] Explain when the target appears unrealistic.

## Completion criteria

The backend has enough validated information to generate a learning plan tailored to the user's goal, background, target, and schedule.

The onboarding interface must save progress so users do not lose their answers if they navigate away or encounter an error.

---

# 7. Phase 4 — Personalised Learning Engine

This is the defining feature of the application.

## 7.1 Skill understanding

- [ ] Interpret the user's natural-language goal.
- [ ] Extract the target outcome.
- [ ] Identify relevant skill domains and subskills.
- [ ] Preserve the original description.
- [ ] Validate the structured interpretation.
- [ ] Ask for clarification when the goal is too ambiguous to plan reliably.

## 7.2 Knowledge and prerequisite analysis

- [ ] Identify prerequisite topics.
- [ ] Construct topic dependencies.
- [ ] Use assessment evidence to estimate existing proficiency.
- [ ] Identify missing prerequisites.
- [ ] Avoid automatically skipping topics based only on a self-selected level.
- [ ] Detect duplicate or contradictory topics.
- [ ] Detect circular prerequisite dependencies.

## 7.3 Roadmap generation

- [ ] Generate a structured learning path.
- [ ] Organise topics into milestones.
- [ ] Include learning objectives.
- [ ] Include prerequisite relationships.
- [ ] Include estimated durations.
- [ ] Include learning resources where available.
- [ ] Include practical exercises.
- [ ] Include completion criteria.
- [ ] Include assessment criteria.
- [ ] Validate the generated structure.
- [ ] Persist the roadmap in PostgreSQL.
- [ ] Assign a version to the roadmap.
- [ ] Preserve the user's previous roadmap when generating a revision.
- [ ] Support retry when generation fails.
- [ ] Prevent partially generated roadmaps from appearing complete.

## 7.4 Time allocation

- [ ] Calculate available weekly time.
- [ ] Estimate total learning effort.
- [ ] Schedule topics according to prerequisites.
- [ ] Split oversized topics across multiple sessions.
- [ ] Include practice and revision time.
- [ ] Reserve time for assessments.
- [ ] Detect unrealistic schedules.
- [ ] Explain scheduling trade-offs.
- [ ] Persist the resulting schedule.

## 7.5 AI integration

- [ ] Define the AI provider behind a backend interface.
- [ ] Keep API credentials on the server.
- [ ] Request structured output.
- [ ] Validate output against a schema.
- [ ] Reject invalid prerequisite graphs.
- [ ] Reject malformed or incomplete roadmaps.
- [ ] Add timeouts and controlled retries.
- [ ] Handle rate limits and provider errors.
- [ ] Persist generation status.
- [ ] Make generation idempotent where appropriate.
- [ ] Record useful generation metadata for debugging.

The AI should propose learning content. Backend rules should validate it, persist it, schedule it, and enforce the application's invariants.

## 7.6 Roadmap review

- [ ] Display milestones and topics.
- [ ] Show estimated durations.
- [ ] Show prerequisite relationships.
- [ ] Show how the plan fits the user's availability.
- [ ] Allow users to review the proposed plan.
- [ ] Allow supported adjustments before activation.
- [ ] Activate the confirmed roadmap.
- [ ] Preserve the version used for subsequent progress tracking.

## Completion criteria

A user can enter an arbitrary skill, receive a validated personalised roadmap, review it, confirm it, and revisit the same persisted roadmap later.

---

# 8. Phase 5 — Daily Missions and Scheduling

The roadmap defines the long-term path. Missions turn that path into daily action.

## TODO

- [ ] Generate missions from the active roadmap.
- [ ] Respect topic prerequisites.
- [ ] Respect daily availability.
- [ ] Split topics into manageable activities.
- [ ] Include learning, practice, revision, and assessment activities.
- [ ] Assign estimated durations.
- [ ] Define completion criteria.
- [ ] Persist daily mission instances.
- [ ] Prevent duplicate mission generation for the same scheduling context.
- [ ] Handle missed days.
- [ ] Recalculate upcoming missions when appropriate.
- [ ] Support a useful empty state when no mission is scheduled.
- [ ] Allow users to view upcoming work.
- [ ] Expose mission data through authenticated API endpoints.

## Completion criteria

The user receives actionable daily missions derived from their own roadmap, with durations that reasonably fit their available time.

The system must not generate arbitrary tasks merely to award XP.

---

# 9. Phase 6 — Mission Completion, Assessments, and Progress

## 9.1 Mission completion

- [ ] Implement the mission-completion endpoint.
- [ ] Authenticate the request.
- [ ] Verify that the mission belongs to the authenticated user.
- [ ] Verify that the mission is eligible for completion.
- [ ] Validate any required exercise or assessment submission.
- [ ] Record completion in a database transaction.
- [ ] Record XP in the same transaction.
- [ ] Prevent duplicate completion rewards.
- [ ] Return authoritative updated state.
- [ ] Test repeated and concurrent completion requests.
- [ ] Test transaction rollback when an operation fails.

## 9.2 Assessments and mastery

- [ ] Implement assessment attempts.
- [ ] Store answers and results as appropriate.
- [ ] Validate submissions on the backend.
- [ ] Calculate assessment results server-side.
- [ ] Track topic-level proficiency.
- [ ] Distinguish completion from demonstrated mastery.
- [ ] Use assessment evidence to inform future learning.
- [ ] Add targeted revision when the user struggles.

## 9.3 Progress tracking

- [ ] Track topic progress.
- [ ] Track milestone completion.
- [ ] Track learning-goal progress.
- [ ] Record learning activity.
- [ ] Track actual time spent where measurable.
- [ ] Provide historical progress.
- [ ] Ensure progress survives refreshes and new sessions.
- [ ] Preserve historical records across roadmap revisions.

## Completion criteria

Mission completion, assessments, and progress are persisted correctly. Repeated requests cannot grant duplicate rewards, and users cannot manipulate progress by changing browser state.

---

# 10. Phase 7 — Gamification

Gamification must reward meaningful learning activity.

## TODO

- [ ] Define XP rules.
- [ ] Implement authoritative XP calculation.
- [ ] Implement levels.
- [ ] Implement streak calculation using the user's configured timezone.
- [ ] Implement achievement definitions.
- [ ] Implement achievement eligibility rules.
- [ ] Persist unlocked achievements.
- [ ] Prevent duplicate XP transactions.
- [ ] Prevent duplicate achievement unlocks.
- [ ] Track activity required for streak calculations.
- [ ] Handle missed days consistently.
- [ ] Return authoritative gamification state from the API.
- [ ] Add unit and integration tests.

## Completion criteria

XP, levels, streaks, and achievements are derived from persisted backend events, not frontend calculations.

---

# 11. Phase 8 — Frontend and Visual Integration

Reuse the existing application's visual identity without inheriting its architectural limitations.

## TODO

- [ ] Inspect the original design system.
- [ ] Identify reusable colours, typography, spacing, icons, components, and layouts.
- [ ] Reimplement suitable components in the new frontend.
- [ ] Configure application routing.
- [ ] Build authentication screens.
- [ ] Build the onboarding flow.
- [ ] Build the roadmap-generation experience.
- [ ] Build the roadmap visualisation.
- [ ] Build the daily-missions screen.
- [ ] Build progress and gamification views.
- [ ] Build the dashboard.
- [ ] Build profile and learning-preference screens.
- [ ] Add loading, empty, success, and error states.
- [ ] Handle expired sessions.
- [ ] Handle failed API requests.
- [ ] Add appropriate responsive layouts.
- [ ] Ensure important interactions work with keyboard navigation.
- [ ] Verify that all persistent operations use the backend API.
- [ ] Remove direct frontend database access.
- [ ] Remove authoritative business rules from the frontend.

## Proposed navigation

- Dashboard
- My Learning Paths
- Roadmap
- Missions
- Progress
- Profile

## Completion criteria

The new frontend feels visually consistent with the original application, but all important data and decisions come from the new backend.

---

# 12. Phase 9 — Adaptive Learning

Once the initial workflow works reliably, improve the plan based on demonstrated learning.

## TODO

- [ ] Record assessment outcomes.
- [ ] Record exercise performance.
- [ ] Compare estimated and actual completion times.
- [ ] Detect repeated difficulties.
- [ ] Identify weak prerequisite topics.
- [ ] Schedule additional practice where necessary.
- [ ] Reduce unnecessary revision when mastery is demonstrated.
- [ ] Recalculate future scheduling when availability changes.
- [ ] Handle missed days without treating the entire roadmap as failed.
- [ ] Version significant roadmap revisions.
- [ ] Record why revisions occurred.
- [ ] Preserve completed work when a roadmap changes.
- [ ] Let users review significant proposed changes.

## Completion criteria

The application can make justified changes to future missions using recorded evidence without destroying existing progress or arbitrarily replacing the learning path.

---

# 13. Phase 10 — Testing and Reliability

Testing is part of implementation, not a final optional activity.

## Unit tests

- [ ] Validate learning-goal input.
- [ ] Validate roadmap structures.
- [ ] Validate prerequisite graphs.
- [ ] Test time-allocation logic.
- [ ] Test mission scheduling.
- [ ] Test assessment calculations.
- [ ] Test XP calculations.
- [ ] Test streak calculations.
- [ ] Test achievement eligibility.

## Integration tests

- [ ] Registration and login.
- [ ] Authentication and authorization.
- [ ] Learning-goal creation.
- [ ] Roadmap generation and persistence.
- [ ] Roadmap retrieval.
- [ ] Mission generation.
- [ ] Mission completion.
- [ ] Duplicate completion requests.
- [ ] Transaction rollback.
- [ ] Assessment submission.
- [ ] Progress persistence.
- [ ] Roadmap revision.

## End-to-end tests

- [ ] Register a new user.
- [ ] Create a learning goal.
- [ ] Complete onboarding.
- [ ] Generate and confirm a roadmap.
- [ ] Retrieve daily missions.
- [ ] Complete a mission.
- [ ] Verify XP and progress.
- [ ] Refresh the page and verify persistence.
- [ ] Sign out and sign back in.
- [ ] Verify that another user cannot access the first user's data.

## Reliability checks

- [ ] Handle AI-provider failure.
- [ ] Handle database errors.
- [ ] Handle expired sessions.
- [ ] Handle malformed requests.
- [ ] Handle repeated requests safely.
- [ ] Verify migrations on a fresh database.
- [ ] Check logs for sensitive information.
- [ ] Verify that secrets are not committed.

---

# 14. Phase 11 — Deployment and Documentation

## TODO

- [ ] Select hosting for the frontend.
- [ ] Select hosting for the backend.
- [ ] Select managed PostgreSQL hosting.
- [ ] Verify database connectivity and connection pooling.
- [ ] Configure production environment variables.
- [ ] Configure production CORS and cookie settings.
- [ ] Apply production migrations safely.
- [ ] Deploy the frontend.
- [ ] Deploy the API.
- [ ] Verify production authentication.
- [ ] Verify the full learning workflow in production.
- [ ] Verify error handling and application logs.
- [ ] Write the README.
- [ ] Document local development setup.
- [ ] Document environment variables.
- [ ] Document the architecture.
- [ ] Document database migrations.
- [ ] Document API endpoints.
- [ ] Document testing commands.
- [ ] Document deployment procedures.
- [ ] Prepare a 3–5 minute demonstration of the working application.

## Completion criteria

A fresh developer can follow the README to configure the application, run the required services, apply migrations, and execute the tests.

The deployed application must support the same essential workflows as the tested local application.

---

# 15. Git and Engineering Practices

## TODO

- [ ] Check Git status before significant changes.
- [ ] Use meaningful, focused commits.
- [ ] Avoid committing generated files unnecessarily.
- [ ] Never commit credentials or secrets.
- [ ] Keep migrations version-controlled.
- [ ] Run relevant tests before commits.
- [ ] Verify build results before commits.
- [ ] Review diffs for unintended changes.
- [ ] Keep the original project available as a reference.
- [ ] Avoid unnecessary changes to reference documentation.
- [ ] Maintain a concise `context.md` for future coding sessions.
- [ ] Update the TODO list when tasks are completed or priorities materially change.

Commit working milestones rather than making one enormous commit at the end.

---

# 16. Recommended Implementation Order

The following is the dependency order. Work on independent tasks in parallel only when doing so will not create integration problems.

1. Workspace access and repository inspection.
2. New project setup and Git foundation.
3. PostgreSQL, Prisma, migrations, and backend skeleton.
4. Authentication and authorization.
5. Learning-goal and onboarding APIs.
6. Structured roadmap-generation pipeline.
7. Roadmap validation, persistence, and versioning.
8. Roadmap review and activation.
9. Deterministic scheduling and daily missions.
10. Mission completion and transactional XP.
11. Assessments and topic-level progress.
12. Streaks, levels, and achievements.
13. Dashboard and progress visualisations.
14. Reuse and integration of the original visual style.
15. Adaptive scheduling and targeted revision.
16. Comprehensive testing and security verification.
17. Production deployment.
18. Documentation and demonstration.

Frontend work can begin earlier where useful, but API contracts should be established before building large numbers of connected screens.

---

# 17. Immediate TODO — Start Here

The first execution session should focus on concrete work.

- [ ] Restore the terminated coding-workspace session.
- [ ] Confirm workspace access.
- [ ] Read the original repository's Git status.
- [ ] Inspect its frontend entry points, routes, components, styles, and assets.
- [ ] Inspect the current database and backend implementation.
- [ ] Identify reusable visual components and existing product flows.
- [ ] Establish the new application's location and Git strategy.
- [ ] Create the new project skeleton.
- [ ] Configure the frontend and backend development commands.
- [ ] Configure PostgreSQL and Prisma.
- [ ] Create the first migration.
- [ ] Verify that both applications can run independently.

Do not begin by generating every screen or building the entire database schema in one pass. Establish the foundation, then implement the first complete user journey.

---

# Final Product Definition

The product is a **personalised learning engine with backend-owned state and adaptive progression**.

Its primary workflow is:

**Learning goal → Existing knowledge → Target outcome → Available time → Assessment → Personalised roadmap → Daily missions → Demonstrated learning → Adaptive progression.**

Its engineering foundation is:

**React + TypeScript → Express + TypeScript → PostgreSQL + JSONB.**

Its central quality requirement is:

**Every important user action must produce correct, validated, persistent state, and the learning path must be genuinely tailored to the individual rather than merely presenting a generic roadmap.**