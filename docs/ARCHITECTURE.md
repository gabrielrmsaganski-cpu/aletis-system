# ALETIS — Architecture

> Última atualização: 2026-04-26 — pós Wave-PG-17 + 24 commits

Plataforma de Finanças Estratégicas & Agrobusiness construída como
monorepo pnpm. Backend Fastify + Postgres (Drizzle ORM, dual-write
best-effort), frontend React 18 + Vite, e camada ALIX (assistente
LLM via Azure AI Foundry / Anthropic Claude).

---

## 1. Topologia de alto nível

```
┌─────────────────────┐       ┌──────────────────────────┐
│  apps/web (Vite)    │       │   Cloudflare Tunnel /    │
│  React 18 + Tailwind│ ───▶  │   reverse-proxy externo  │
│  porta 5173         │       └──────────────────────────┘
└──────────┬──────────┘                    │
           │  /api/* → proxy               │
           ▼                                ▼
┌─────────────────────┐       ┌──────────────────────────┐
│  apps/api (Fastify) │ ───▶  │  Azure AI Foundry        │
│  porta 3011         │       │  (Claude Sonnet 4.6      │
│  Node 22            │       │   + Opus 4.7 + Speech)   │
└──┬──────────────────┘       └──────────────────────────┘
   │
   ├──▶ Postgres 17 (DATABASE_URL)
   │      └─ 17 tabelas Drizzle (cliente, dossie, proposta,
   │         lead_pgfn, alix_*, financeiro_*, fonte_status,
   │         bsc_snapshot, audit_log)
   │
   ├──▶ storage/ (fonte de verdade legacy + cache file-based)
   │      └─ JSON / JSONL por entidade
   │
   ├──▶ Fontes externas (36):
   │      BCB SGS · CEPEA/ESALQ · CONAB · INMET · CPTEC · IBGE ·
   │      ANP · NASA POWER/FIRMS · OpenMeteo · COMEX STAT ·
   │      INPE DETER · ZARC · ABIOVE · SICOR · BrasilAPI ·
   │      ViaCEP · Google Maps · Receita Federal · PGFN
   │
   └──▶ Observability: /metrics (Prometheus) + Pino structured logs
```

---

## 2. Stack

### Backend (`apps/api`)
- **Runtime**: Node 22, Fastify 5, TypeScript 5.7, ESM
- **DB**: Postgres 17 + Drizzle ORM 0.45 + drizzle-kit
- **LLM**: @anthropic-ai/sdk via Azure AI Foundry endpoint customizado
- **Test**: Vitest 4 + 17 suites / 58 testes
- **Plugins**: @fastify/{cors, jwt, multipart, rate-limit} + fastify-metrics
- **HTTP client**: axios + axios-retry (2x backoff exp em 429/5xx)
- **Crypto**: scrypt nativo (Portal do Cliente JWT)
- **PDF**: pdf-lib + unpdf (read)
- **Excel**: exceljs / xlsx
- **Web scraping**: puppeteer + puppeteer-extra-stealth (CEPEA bypass)

### Frontend (`apps/web`)
- **Runtime**: React 18 + Vite 6 + TypeScript 5.9 + Tailwind 3.4
- **Routing**: react-router-dom 6 com future flags v7 ativadas
- **Charts**: recharts 2.15 + leaflet 1.9
- **Icons**: lucide-react
- **Pages**: 24 rotas lazy-loaded (Dashboard, CRM, Prospecção,
  Propostas, Contratos, Mercado, Crédito, WhatsApp, ALIX, Clima,
  Financeiro, Custeio, Relatórios, Fontes, Configurações,
  Ferramentas, Portal Cliente, Cliente Detalhes/Dossie 3 IDs)

### Pacotes (`packages/`)
- `@aletis/shared-types`: tipos compartilhados api↔web
- `@aletis/financial-calc`: TIR, VPL, SAC/PRICE, equivalência
- `@aletis/contabil-calc`: SIMPLES nacional, presumido, MEI
- `@aletis/knowledge-base`: súmulas STJ, MCR, Plano Safra,
  Proagro, jurisprudência rural

---

## 3. Persistência — dual-write best-effort

Todas as entidades de domínio têm **dois caminhos paralelos** de
persistência ativados pela flag `ALETIS_PG_ENABLED=1`:

1. **Disco (fonte de verdade legacy)**: `apps/api/storage/{entidade}/...`
   - JSON atômico (write tmp + rename) ou JSONL append-only
   - Carregado em Maps RAM no boot do server
2. **Postgres (espelho via Drizzle)**: tabelas com payload JSONB
   completo + colunas chave indexadas
   - `INSERT ... ON CONFLICT UPDATE` (idempotente) ou append-only
   - Falha de PG vira `console.warn` — hot-path **nunca** quebra

Exemplos:
- `routes/clientes.ts` → `persistCliente()` (Map.set + pgUpsertCliente + auditAsync)
- `services/financeiro/FinanceiroService.save()` → writeFile + dumpAll PG
- `services/cliente/DossieRepository.save()` → fs.writeFile + upsertDossie PG
- `services/alix/learning/FeedbackService.record()` → appendFile + appendFeedback PG
- `services/bsc/BscService.snapshot()` → appendFile JSONL + appendBscSnapshot PG

### Boot orchestrator (server.ts)
- Quando flag liga + PG tem registros → sobrescreve Map em RAM com PG
- PG vazio → dump do Map atual no PG (one-shot bootstrap)
- Garante que estado pós-restart é consistente com último mutação

### Schema PG (17 tabelas)
| Tabela | Propósito | PK | Cardinalidade típica |
|---|---|---|---|
| `cliente` | CRM core | id text | 3..milhares |
| `dossie` | Dossiê agro | (clienteId, versao) | 1..N por cliente |
| `proposta` | Propostas técnicas | id text | dezenas |
| `lead_pgfn` | Leads PGFN agro indexados | cnpjCpf | **39 140** |
| `alix_session` | Sessões de chat ALIX | id text | dezenas |
| `alix_message` | Mensagens chat | id text | centenas |
| `alix_memory` | Memória estruturada por cliente | clienteId | 1..milhares |
| `alix_insight` | Insights diários (proativo) | bigserial | milhares |
| `alix_confirmation` | Pendings + batches de aprovação | id text | dezenas |
| `alix_feedback` | NPS / thumbs em respostas | bigserial | milhares |
| `fonte_status` | Snapshot das 36 fontes | nome | 36 |
| `financeiro_receita` | Receitas operacionais | id text | dezenas/mês |
| `financeiro_despesa` | Despesas com clienteVinculo | id text | dezenas/mês |
| `financeiro_imposto` | DAS/INSS/ISS/DARF | id text | mensal |
| `financeiro_lancamento` | Extrato OFX | id text | centenas/mês |
| `bsc_snapshot` | Balanced Scorecard | bigserial | append-only |
| `audit_log` | Trilha LGPD | bigserial | milhares |

### Migration scripts
- `pnpm db:migrate` — aplica drizzle-kit migrations (4 SQL files)
- `pnpm migrate:storage` — script unificado: lê todo storage e popula PG
- `pnpm migrate:leads` — popula 39k leads PGFN do leads-agro.json (94 MB)

---

## 4. Segurança defensiva

### Em camadas
1. **CORS**: whitelist via `CORS_ALLOWED_ORIGINS` em prod (fail-fast se não setado)
2. **Rate-limit**: 300 req/min global por IP (allowList localhost)
3. **JWT**: secret em `JWT_SECRET` — **fail-fast em prod**, warn em dev
4. **Upload MIME**: helper `isMimeAllowed` aplicado em alix-documents (415 antes do toBuffer)
5. **axios-retry**: 2x exp backoff em 429/5xx/network — atenua spike transitório
6. **trace-id**: gera UUID base64url ou aceita `x-trace-id` válido (regex `[A-Za-z0-9_-]{6,128}`); rejeita XSS
7. **Audit log LGPD**: `auditAsync()` em todas mutações de cliente/proposta/dossie + transitions de fontes externas
8. **Idempotência**: helpers fire-and-forget; falha PG não bloqueia request

### JWT (Portal do Cliente)
- Hash scrypt em `PortalAuthService`
- Token 12h, payload contém só `clienteId`
- Re-busca cliente em cada request para verificar status ativo

---

## 5. Observabilidade

### Logs estruturados (Pino)
- Em dev: pino-pretty (colorized, HH:MM:ss)
- Em prod: JSON estruturado com `traceId` + `reqId`
- Hooks: `onRequest` (incoming) + `onResponse` (status + latência)

### Métricas (Prometheus)
- `/metrics` ativo via `fastify-metrics`
- 395+ linhas: process_cpu_*, nodejs_eventloop_lag_*, http_request_duration_seconds_bucket por método/route/status
- Agregável via Prometheus + Grafana (não incluído na infra deste repo)

### SLA das fontes externas
- Probe periódico (10 min) em todas as 36 fontes
- Estado em `fonte_status` table (PG espelho)
- State transitions (online↔offline↔degraded) → audit_log
- Endpoints `/api/fontes/historico` + `/uptime` calculam SLA por janela
- UI `/fontes` mostra dashboard com NPS, latência, timeline

---

## 6. ALIX — assistente IA

### Arquitetura multi-agente
- **Orchestrator**: roteia query → agente especialista (DealAnalyzer,
  CRMWriter, DocGenerator, WebResearcher)
- **Tools** (registradas em `services/alix/tools/`):
  - calculators (financeiro, contábil)
  - clima (NASA POWER, INMET, CPTEC)
  - crm-read (clientes, propostas)
  - tj-processos (TJSP, TJMS, TJPR via scraping)
  - sicar-live + incra-sigef
  - calendario-safra, news (DOU + agro)
  - playbooks (templates de fluxos)

### Persistência
- Sessions + messages no PG (alix_session/message)
- Memória por cliente em `alix_memory` (perfil + proximasAcoes + alertas + histórico)
- Insights diários append-only em `alix_insight`
- Feedback (NPS) em `alix_feedback` com agregação por rating

---

## 7. Pipeline de prospecção

### Fontes
- **PGFN Dívida Ativa**: ingest offline via script (download + parse 46M linhas → 39k leads agro)
- **DOU Diário Oficial União**: scraping via Puppeteer (Liferay AJAX);
  filtra atos com keywords agro + crise (RJ, falência, leilão, execução fiscal/judicial)
- **SICAR**: portal oficial Dataprev (atualmente em manutenção; pipeline pronto)
- **Sócio Expansion**: BrasilAPI lookups por CNPJ → expande PJ em sócios PF
- **MapBiomas**: mapa de uso/cobertura (atualmente fora)

### Endpoints chave
- `POST /api/prospeccao/buscar` — filtros completos em RAM (Map filter)
- `GET /api/prospeccao/leads/sql` — filtros indexados via PG (Wave-PG-12)
- `GET /api/prospeccao/hot-leads` — leads quentes sem contato 14d
- `GET /api/prospeccao/stats` — agregados por UF/score/judicial

---

## 8. CI/CD

GitHub Actions em `.github/workflows/ci.yml`:

| Job | Duração média | Ação |
|---|---|---|
| Install + cache | 30s | pnpm install --frozen-lockfile |
| Typecheck (5 workspaces) | 1m | pnpm typecheck |
| Vitest (apps/api) | 1m | pnpm --filter @aletis/api test |
| Build artifacts | 1m15s | knowledge-base build + web build + api build + upload artifact |

Concurrency `cancel-in-progress` por ref evita CI redundante.

---

## 9. Variáveis de ambiente

| Env | Default | Obrigatório em prod | Propósito |
|---|---|---|---|
| `PORT` | 3011 | não | Porta API |
| `HOST` | 0.0.0.0 | não | Host bind |
| `NODE_ENV` | development | sim (=production) | Gates fail-fast |
| `LOG_LEVEL` | info | não | Pino level |
| `JWT_SECRET` | — | **SIM** | Portal do Cliente |
| `CORS_ALLOWED_ORIGINS` | — | **SIM** | CSV de origins |
| `RATE_LIMIT_MAX` | 300 | não | req/min por IP |
| `RATE_LIMIT_WINDOW` | 1 minute | não | janela rate-limit |
| `DATABASE_URL` | — | quando ALETIS_PG_ENABLED=1 | postgres:// |
| `ALETIS_PG_ENABLED` | 0 | recomendado em prod | dual-write toggle |
| `DATABASE_POOL_MAX` | 10 | não | pg pool size |
| `CLAUDE_FOUNDRY_BASE_URL` | — | quando ALIX_USE_LLM=true | Azure endpoint |
| `AZURE_AI_SERVICES_KEY` | — | sim | Azure key |
| `ALIX_USE_LLM` | true | não | toggle ALIX |
| `ALIX_PROACTIVE_ENABLED` | true | não | proactive ingest |

Ver `.env.example` para o conjunto completo (não comitado em produção).

---

## 10. Próximos passos sugeridos

- **Wave-PG-16**: migrar `storage/inventario/` + `storage/custeio/` para PG (última do storage runtime)
- **P2-26 Redis**: adapter Redis no node-cache para multi-instância
- **P2-32 PWA**: service worker offline para consultor em campo
- **k6 load test**: validar rate-limit + cache + axios-retry sob carga
- **Sentry / OpenTelemetry**: traces distribuídos (tracing além do x-trace-id)
- **Multi-tenant**: separação de schemas PG por tenant para SaaS
