# Gamified Learning V2 — Context

## Product
Build a personalised learning platform for **any skill**, not a fixed course catalogue. A learner describes the skill, current knowledge, desired outcome, and available time. The system should generate a validated roadmap, schedule useful missions, track demonstrated progress, and adapt future work.

## Engineering principles
- The backend owns persistence, identity, business rules, progress, and rewards.
- The frontend collects input and presents authoritative API state.
- Use PostgreSQL and Prisma; relational entities for core records and JSON only for genuinely variable learning content.
- Keep the original application untouched. It is a reference only; visual parity has not yet been assessed because its source was not available in this workspace.
- Use generated scaffolds as the foundation. Prefer JavaScript over TypeScript for application code where practical.

## Current structure
- `apps/web`: React + Vite JavaScript scaffold, Tailwind CSS, React Router, TanStack Query, Zod, Lucide.
- `apps/api`: Express JavaScript scaffold, with security middleware and versioned API routes.
- `prisma/schema.prisma`: Prisma/PostgreSQL initial domain schema.
- `Gamified Learning V2 — Master Implementation Plan.md`: primary project requirements and implementation order.

## Current status
- Vite React JavaScript scaffold created by `npm create vite@latest apps/web -- --template react`.
- Express JavaScript scaffold created by `npx express-generator apps/api --no-view`.
- Prisma initialisation created by Prisma CLI.
- A first responsive onboarding screen exists. Its form is currently presentation-only; it explicitly does not claim to save a learning goal.
- API health endpoint: `GET /api/v1/health`.
- API tests cover health and consistent 404 responses.
- Prisma schema validates and client generation succeeds.
- No database connection has been verified and no migration has been applied yet. Configure a real local PostgreSQL URL before migrating.
- No commit has been made yet; inspect Git diff and run all checks before the first foundation commit.

## Commands
- `npm install`
- `npm run dev` — start API and web concurrently
- `npm run dev:web`
- `npm run dev:api`
- `npm run build`
- `npm test`
- `npm run check`
- `npm run db:validate`
- `npm run db:generate`
- `npm run db:migrate` — requires configured PostgreSQL

## Next priorities
1. Verify the generated app and API run independently.
2. Add validated learning-goal creation and retrieval backed by Prisma/PostgreSQL.
3. Add a database migration after a real local database is configured.
4. Connect the onboarding form to the API and show genuine saving/error states.
5. Add authentication before exposing user-owned records.
6. Continue in the master plan's dependency order. Avoid expanding the schema prematurely.

## Constraints
- Do not claim data is persisted until database-backed APIs are implemented and tested.
- Do not claim the original visual design has been copied without access to the original source.
- Keep master/reference documents stable; update this context only when status or key decisions materially change.
