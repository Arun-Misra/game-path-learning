# Pathwise — Gamified Learning

Pathwise is a personalised learning platform that turns a learner’s goal into a practical, adaptive plan. Learners describe what they want to achieve, their current experience, available study time, and target date. The application uses AI to create a small learning chunk, then adapts future work using progress and assessment evidence instead of locking the learner into a rigid, one-size-fits-all syllabus.

## Highlights

- **Personalised learning goals** — capture the target outcome, experience level, daily time budget, weekly frequency, and optional deadline.
- **Rolling learning chunks** — generate the next manageable portion of a longer plan, then continue from verified progress rather than restarting from scratch.
- **AI-assisted planning** — create structured learning briefs and roadmap topics through an OpenAI-compatible provider, with server-side validation and review.
- **Missions and progress tracking** — schedule study sessions around a learner’s time budget and timezone, and record completion evidence.
- **Adaptive practice** — use assessment results and topic progress to recommend review, reinforcement, or the next step.
- **Gamification** — award experience points (XP) for completed missions while preventing duplicate rewards.
- **Project milestones** — turn a goal’s intended outcome into milestones with success criteria and saved evidence.
- **Accounts and sessions** — register and sign in with password hashing and an HTTP-only session cookie.
- **Persistence** — store users, goals, roadmaps, missions, assessments, progress, milestones, achievements, and XP records in PostgreSQL.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React, JavaScript, Vite |
| Styling | Tailwind CSS |
| Client-side data | TanStack Query |
| Routing and UI | React Router, Lucide |
| Backend | Node.js, Express |
| Validation | Zod and server-side roadmap validation |
| Database | PostgreSQL |
| ORM and migrations | Prisma |
| AI | OpenAI-compatible chat completions API (Groq configured by default in the example environment) |
| Testing | Node.js built-in test runner; Playwright for end-to-end tests |
| Deployment configuration | Vercel |

## Repository layout

```text
.
├── apps/
│   ├── api/                 # Express API, authentication, services and tests
│   └── web/                 # React + Vite frontend
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # Versioned database migrations
├── scripts/                 # Database and development utilities
├── .env.example             # Environment variable template
├── package.json             # npm workspaces and root scripts
└── vercel.json              # Vercel web/API routing configuration
```

## Requirements

Install the following before starting:

- Node.js with support for the Node flags used by the project’s scripts.
- npm.
- A PostgreSQL database.
- An API key and model access for your chosen AI provider, unless you configure a compatible local Ollama endpoint.

## Local setup

### 1. Install dependencies

From the repository root:

```bash
npm install
```

The root install script generates the Prisma Client.

### 2. Configure environment variables

Copy `.env.example` to `.env` in the repository root, then set values for your environment. Do not commit `.env` or put secrets in frontend variables.

Minimum configuration for a local PostgreSQL database and hosted AI provider:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/gamified_learning?schema=public"
TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/gamified_learning_test?schema=public"

AI_BASE_URL="https://api.groq.com/openai/v1"
AI_API_KEY="your-provider-api-key"
AI_MODEL="openai/gpt-oss-120b"

PORT=3000
WEB_ORIGIN="http://localhost:5173"
NODE_ENV="development"
```

These are example values. Replace the database credentials and configure a model available to your provider. The project also supports compatible hosted APIs through `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`. The roadmap generator can use a local Ollama-compatible endpoint; see `.env.example` and the generator configuration for defaults.

**Keep all API keys and database credentials server-side.** Never use a real secret in source code, screenshots, issues, or commits. If a secret is exposed, rotate it.

### 3. Prepare the database

Make sure the database in `DATABASE_URL` exists and is accessible, then apply the committed migrations:

```bash
npx prisma migrate deploy
npm run db:generate
```

For active schema development, use:

```bash
npm run db:migrate
```

This runs Prisma’s development migration workflow and requires a working development database. Do not point migration or test commands at a production database unless you have deliberately reviewed the migration and backup plan.

### 4. Start the application

Run the API and frontend together:

```bash
npm run dev
```

Or start each workspace separately:

```bash
npm run dev:api
npm run dev:web
```

The API defaults to port `3000`; Vite normally serves the frontend on port `5173` and proxies `/api` requests to the local API. If you change the ports, update the corresponding environment and Vite configuration.

## Useful commands

Run these from the repository root.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and API together |
| `npm run dev:web` | Start the Vite frontend |
| `npm run dev:api` | Start the Express API |
| `npm run build` | Build the frontend for production |
| `npm run check` | Run API syntax checks and frontend linting |
| `npm test` | Run API tests |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run db:validate` | Validate the Prisma schema |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Create/apply a development migration |
| `npm run db:studio` | Open Prisma Studio |
| `npm run smoke:assessment` | Run the assessment smoke test |
| `npm run smoke:roadmap-quality` | Run roadmap quality checks |
| `npm run smoke:continuity` | Check continuity between generated learning chunks |
| `npm run smoke:ollama` | Run the Ollama smoke test |

Some smoke tests call the configured AI provider and may require a working key, network access, model availability, and a configured database. Review each script before running it against shared data.

## Testing

### API tests

```bash
npm test
npm run check
npm run build
```

Some database integration tests require `TEST_DATABASE_URL`. Use a **separate, disposable PostgreSQL test database**—never a production database or a database containing data you need to preserve.

Example PowerShell setup:

```powershell
$env:TEST_DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/gamified_learning_test?schema=public"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npx prisma migrate deploy
npm test
```

The integration suite covers core flows such as account registration and login, goal persistence, roadmap versioning and activation, mission scheduling and completion, XP idempotency, and user-data isolation. Test coverage depends on the test database and environment available when the suite runs.

### End-to-end tests

```bash
npm run test:e2e
```

Run this after installing the project dependencies and configuring the browser/test environment required by Playwright.

## API overview

All versioned API endpoints use the `/api/v1` prefix.

### Health and authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Check whether the API process responds |
| `GET` | `/api/v1/ready` | Check readiness, including database connectivity |
| `POST` | `/api/v1/auth/register` | Register an account |
| `POST` | `/api/v1/auth/login` | Sign in and create a session |
| `GET` | `/api/v1/auth/me` | Get the current signed-in user |
| `POST` | `/api/v1/auth/logout` | End the current session |

Authenticated requests rely on the `pathwise_session` HTTP-only cookie. A `401 UNAUTHENTICATED` response generally means the request did not include a valid session cookie; sign in again and verify the browser is sending cookies with API requests. A healthy `/health` response alone does not guarantee that the database is reachable—check `/ready` as well.

### Learning goals and roadmaps

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/learning-goals` | Create a learning goal |
| `GET` | `/api/v1/learning-goals` | List the current user’s goals |
| `GET` | `/api/v1/learning-goals/:goalId` | Get a goal |
| `GET` | `/api/v1/learning-goals/:goalId/next-step` | Get an adaptive next-step recommendation and mastery snapshot |
| `POST` | `/api/v1/learning-goals/:goalId/roadmaps/generate` | Generate and save a roadmap draft |
| `POST` | `/api/v1/learning-goals/:goalId/roadmaps` | Validate and save a supplied draft |
| `GET` | `/api/v1/learning-goals/:goalId/roadmaps` | List roadmap versions |
| `POST` | `/api/v1/learning-goals/:goalId/roadmaps/:roadmapId/activate` | Activate a roadmap draft |

Timezone-aware endpoints accept a `timeZone` query parameter using an IANA timezone, for example `Asia/Kolkata`.

### Missions, assessments and milestones

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/learning-goals/:goalId/missions/generate` | Generate the next week of missions |
| `POST` | `/api/v1/learning-goals/:goalId/missions/adapt` | Adapt unstarted missions using new evidence |
| `GET` | `/api/v1/learning-goals/:goalId/missions` | List missions and XP |
| `GET` | `/api/v1/learning-goals/:goalId/missions/recovery` | Preview recovery for missed sessions |
| `POST` | `/api/v1/learning-goals/:goalId/missions/recovery/replan` | Replan unfinished work safely |
| `POST` | `/api/v1/learning-goals/:goalId/missions/:missionId/complete` | Complete a mission and award XP once |
| `GET` | `/api/v1/learning-goals/:goalId/project-milestones` | List milestones for the active roadmap |
| `POST` | `/api/v1/learning-goals/:goalId/project-milestones/generate` | Generate project milestones |
| `PATCH` | `/api/v1/learning-goals/:goalId/project-milestones/:milestoneId` | Update milestone status and evidence |

Assessment routes are mounted under `/api/v1/learning-goals/:goalId/assessments`. See `apps/api/routes/assessments.js` for the current request and response details.

## How adaptive planning works

1. The learner defines an outcome, starting experience, time availability, and optional deadline.
2. The AI provider produces a structured learning brief, followed by a draft roadmap for the next small chunk.
3. The API validates the generated content and its prerequisites, reviews the draft, and attempts repair when required checks fail.
4. The learner works through scheduled missions and records completion evidence.
5. Assessment results and topic progress inform recommendations for practice, review, or progression.
6. Later chunks use recent learning evidence to continue from the learner’s current position and avoid unjustified repetition.

Generated plans are suggestions, not guarantees of mastery or a guaranteed completion date. Review the plan and its assumptions against the learner’s real progress.

## Deployment

The repository includes `vercel.json` for routing the frontend and API services. Configure the required environment variables in the deployment platform before deploying:

- `DATABASE_URL` — production PostgreSQL connection string.
- `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` — configured AI provider and model.
- `NODE_ENV=production`.
- `WEB_ORIGIN` — the deployed frontend origin if required by the API’s CORS configuration.

Use the database provider’s recommended connection string for the deployment environment and ensure production migrations have been applied. Never commit production credentials. After deployment, check both `/api/v1/health` and `/api/v1/ready`, then test registration, login, and a protected API request in the browser. If readiness returns `503 DATABASE_UNAVAILABLE`, inspect server-side deployment logs for the database connection failure; the public response intentionally does not expose connection details.

## Known limitations

- AI output quality and availability depend on the selected provider, model, API quota, and network.
- Adaptive intervals are heuristic defaults and are not calibrated against real-world learning outcomes.
- Completion, self-reported confidence, quiz results, and independent performance are different kinds of evidence; none should be treated as a universal mastery guarantee.
- Database-backed integration tests require an isolated test database and the relevant migrations.

## Contributing

1. Create a branch for your change.
2. Keep secrets and local environment files out of commits.
3. Run relevant tests and checks before opening a pull request.
4. Use clear, conventional commit messages such as `feat: add goal progress view`, `fix: preserve mission history`, or `chore: update documentation`.

## License

No license is specified in this repository’s current project metadata. Unless a license file is added, do not assume the code is offered under an open-source license.
