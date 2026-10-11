# ALETIS — Agent Guidelines

## Project Context

ALETIS is a financial/agricultural consultancy platform ("Finanças Estratégicas & Agrobusiness"). It manages rural credit renegotiation, client CRM, proposal generation, processos de assessoria (operational checklists), and market intelligence for a team of agricultural finance consultants.

## Technology Stack

- **Monorepo**: pnpm workspaces
- **API**: Fastify 5, Drizzle ORM, PostgreSQL, Zod, Vitest
- **Web**: React 18, Vite, React Router, Tailwind CSS, Recharts, Leaflet
- **Site**: Next.js 14 institutional site
- **Packages**: `@aletis/contabil-calc`, `@aletis/financial-calc`, `@aletis/knowledge-base`, `@aletis/shared-types`

## Critical Rules

### Money Handling
- **Never** use JavaScript `number` for monetary values in API logic
- Database: `numeric(18,2)` or `numeric(19,4)` via Drizzle
- API responses: return money as **strings** (or use a Decimal library)
- Frontend: format with `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`

### Dual-Write Database
The system is transitioning from in-memory Maps + JSON files to PostgreSQL.
- When `ALETIS_PG_ENABLED=1`, prefer PG for reads
- Always dual-write to both Map AND PG on mutations
- Validate `payload` JSONB columns with Zod before insertion
- All timestamps use `withTimezone: true`

### Build Order
`knowledge-base` must build before `api` because the API imports from `packages/knowledge-base/dist/`.

```bash
pnpm -F @aletis/knowledge-base build
pnpm --filter ./apps/api build
pnpm --filter ./apps/web build
```

### Type Safety
- Strict TypeScript everywhere (`strict: true` in tsconfig)
- API routes use Zod for request/response validation
- Shared types live in `packages/shared-types/`

### Route/File Naming
- API routes: `kebab-case.ts` in `apps/api/src/routes/`, auto-registered by `server.ts`
- Frontend pages: `PascalCase.tsx` in `apps/web/src/pages/`
- Services: `PascalCaseService.ts` in `apps/api/src/services/`
- Repositories: `PascalCaseRepository.ts` in `apps/api/src/db/`

## Code Style

- Use async/await, avoid callback pyramids
- Prefer `const`/`let`, no `var`
- Error handling: use Fastify's `reply.status(xxx).send({ error, message })` pattern in API
- Frontend errors: use existing `Toast` component or component-level error boundaries
- Comments in Portuguese (project standard)
- No `console.log` in production paths; use Fastify's built-in logger (`request.log`)

## When Modifying Code

1. If adding a new entity → check if it should go to PG schema + repository + Map
2. If modifying financial calculations → check `financial-calc` or `contabil-calc` packages first
3. If adding a new template/checklist → update `manifest.ts` and add DOCX template to `templates/`
4. If adding routes → add to `apps/api/src/routes/` and auto-register by filename
5. If adding frontend pages → add to `apps/web/src/pages/` and update routing in `App.tsx`

## Testing

- API: Vitest (`apps/api/tests/`). Run with `pnpm --filter @aletis/api test`
- Frontend: no tests configured yet. If adding, prefer Vitest + React Testing Library
- Build checks: `pnpm typecheck` across all workspaces

## Security Notes

- JWT auth via `@fastify/jwt` with HttpOnly cookies
- Sensitive fields are redacted from logs (see `server.ts` redact config)
- LGPD compliance: `audit_log` table tracks all mutations
- Rate limiting enabled via `@fastify/rate-limit`

## Skills Available

The following skills are available for working with this system:

- `aletis-system-navigator` — Architecture, module map, schema reference
- `aletis-financial-workflows` — Monetary calculations, rural credit, taxes
- `aletis-data-persistence` — Dual-write patterns, migrations, repositories
- `aletis-document-generation` — DOCX/PDF templates, checklists, document vault

Use these skills whenever working on the corresponding domain.
