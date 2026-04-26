# ALETIS — Runbook operacional

> Guia passo-a-passo para onboard, deploy, debug e recovery.
> Última atualização: 2026-04-26

---

## Índice rápido

- [Onboard local (dev)](#1-onboard-local-dev)
- [Onboard ambiente novo (staging/prod)](#2-onboard-ambiente-novo-stagingprod)
- [Deploy](#3-deploy)
- [Comandos comuns](#4-comandos-comuns)
- [Debug](#5-debug)
- [Recovery](#6-recovery)
- [Migrações de dados](#7-migrações-de-dados)
- [Pipeline de prospecção](#8-pipeline-de-prospecção)
- [Cenários de incidente](#9-cenários-de-incidente)

---

## 1. Onboard local (dev)

```bash
# 1.1 Pré-requisitos
node --version    # >= 20 (recomendado 22)
pnpm --version    # >= 9.15.4

# 1.2 Clonar
git clone https://github.com/gabrielrmsaganski-cpu/aletis-system.git
cd aletis-system

# 1.3 Instalar
pnpm install

# 1.4 Build da knowledge-base (API depende do dist)
pnpm -F @aletis/knowledge-base build

# 1.5 (Opcional) Postgres local
# Sem PG, o sistema funciona com Map em RAM + arquivos JSON em storage/.
# Com PG: criar DB e setar DATABASE_URL no .env (ver §2)

# 1.6 Subir api + web em terminais separados
pnpm --filter @aletis/api dev   # porta 3011
pnpm --filter @aletis/web dev   # porta 5173

# Frontend → http://localhost:5173
# API     → http://localhost:3011/api/health
```

**Sem `.env`**: dev mode abre CORS para todos, JWT cai num secret default
com warn, fontes externas (BCB/CEPEA/etc) são públicas.

---

## 2. Onboard ambiente novo (staging/prod)

```bash
# 2.1 Provisionar Postgres (criar DB aletis)
createdb -U postgres aletis

# 2.2 .env mínimo (não comitar!)
cat > .env <<EOF
NODE_ENV=production
PORT=3011
HOST=0.0.0.0

# Segurança obrigatória em prod
JWT_SECRET=$(openssl rand -hex 32)
CORS_ALLOWED_ORIGINS=https://app.aletis.com.br,https://aletis.com.br

# Postgres (Wave-PG)
DATABASE_URL=postgresql://aletis:SENHA@HOST:5432/aletis
ALETIS_PG_ENABLED=1
DATABASE_POOL_MAX=20

# ALIX (Azure AI Foundry)
CLAUDE_FOUNDRY_BASE_URL=https://aisaganski-1936-resource.services.ai.azure.com
AZURE_AI_SERVICES_KEY=<rotated key>
ALIX_USE_LLM=true
EOF

# 2.3 Aplicar migrations (cria 17 tabelas + indexes)
pnpm --filter @aletis/api db:migrate

# 2.4 Popular do storage (se houver storage/ pré-existente)
pnpm --filter @aletis/api migrate:storage

# 2.5 (Opcional) Popular leads PGFN se tiver leads-agro.json
pnpm --filter @aletis/api migrate:leads

# 2.6 Build prod
pnpm --filter @aletis/api build
pnpm --filter @aletis/web build

# 2.7 Start api
pnpm --filter @aletis/api start
```

---

## 3. Deploy

### Arquitetura mínima recomendada
```
[Cloudflare Tunnel / nginx] ──▶ apps/api (Node 22, PM2 ou systemd)
                            ──▶ apps/web (estático: Cloudflare Pages
                                ou nginx servindo dist/)

apps/api ──▶ Postgres 17 (mesma VM ou managed Azure DB)
         ──▶ /metrics scraped por Prometheus
```

### CI verificações antes do deploy
1. `pnpm typecheck` (5 workspaces verde)
2. `pnpm --filter @aletis/api test` (58/58 testes verde)
3. CI GitHub Actions verde no SHA atual (`gh run list`)

### Deploy zero-downtime (PM2)
```bash
pm2 reload ecosystem.config.js  # graceful restart
pm2 logs aletis-api --lines 50  # verificar startup
```

---

## 4. Comandos comuns

### Tipo / Test / Build
```bash
pnpm typecheck                          # 5 workspaces
pnpm --filter @aletis/api test          # Vitest
pnpm --filter @aletis/api test:watch    # dev TDD
pnpm --filter @aletis/api test:coverage # report HTML em coverage/
```

### DB (Drizzle)
```bash
pnpm --filter @aletis/api db:generate   # cria nova migration a partir do schema
pnpm --filter @aletis/api db:migrate    # aplica migrations
pnpm --filter @aletis/api db:push       # syncroniza schema sem migration (dev)
pnpm --filter @aletis/api db:studio     # GUI em http://localhost:4983
```

### Migrações de storage
```bash
pnpm --filter @aletis/api migrate:storage   # storage/ → PG (idempotente)
pnpm --filter @aletis/api migrate:leads     # leads-agro.json (94MB) → lead_pgfn
```

### Ingestão de fontes externas
```bash
pnpm --filter @aletis/api ingest:pgfn       # PGFN Dívida Ativa (46M linhas)
pnpm --filter @aletis/api ingest:dou        # DOU agro+crise scraper
pnpm --filter @aletis/api ingest:socios     # BrasilAPI sócios PF
pnpm --filter @aletis/api ingest:sicar      # SICAR (atualmente em manutenção Dataprev)
```

### Smoke API
```bash
curl -sS http://localhost:3011/api/health           # status
curl -sS http://localhost:3011/api/fontes/status    # 36 fontes
curl -sS http://localhost:3011/metrics              # Prometheus
curl -sS http://localhost:3011/api/clientes         # smoke CRM
```

---

## 5. Debug

### Logs estruturados
```bash
# API logs (dev: pino-pretty colorized)
pnpm --filter @aletis/api dev | bunyan -o short    # com bunyan parser

# Filtrar por trace
journalctl -u aletis-api | grep 'traceId":"abc123'
```

### Cliente reportando erro 5xx
1. Pegar `x-trace-id` do response do client (sempre ecoa via header)
2. Buscar nos logs: `grep '"traceId":"<id>"'`
3. Stack está no log com `level: error` + `err.stack`

### PG diagnóstico
```bash
psql $DATABASE_URL -c '
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC LIMIT 10;'

# Latência de queries (precisa pg_stat_statements ativo)
psql $DATABASE_URL -c '
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;'
```

### audit_log (mutações de domínio)
```sql
-- Últimas 50 mutações em clientes
SELECT criado_em, ator, acao, recurso,
       dados_depois->>'estagio' AS estagio
FROM audit_log
WHERE recurso LIKE 'cliente:%'
ORDER BY criado_em DESC LIMIT 50;

-- Transitions de fontes externas (state-flap detection)
SELECT criado_em, recurso,
       dados_antes->>'status' AS de,
       dados_depois->>'status' AS para
FROM audit_log
WHERE acao = 'fonte_state_transition'
ORDER BY criado_em DESC LIMIT 50;
```

---

## 6. Recovery

### Cenário: PG corrompido / down
- API continua funcionando (storage/ é fonte de verdade)
- Quando PG voltar, `pnpm migrate:storage` re-popula
- Idempotente: re-rodar não duplica (usa upsert ON CONFLICT)

### Cenário: storage/ corrompido / perdido
- Se ALETIS_PG_ENABLED=1, **boot orchestrator** hidrata Map a partir do PG
- Re-criar storage/ vazio: `mkdir -p storage/{clientes,...}`
- Restart API: PG → Map; próximas mutações reescrevem o storage

### Cenário: rollback de migration
```bash
# Drizzle não tem down-migration nativa. Snapshot do PG antes:
pg_dump aletis > /backup/aletis-$(date +%F).sql

# Em caso de problema:
psql aletis < /backup/aletis-2026-04-26.sql
```

### Cenário: vazamento de credenciais
1. **Rotacionar imediatamente**:
   - `JWT_SECRET` (invalida todos tokens Portal)
   - `AZURE_AI_SERVICES_KEY` (Azure portal)
   - `DATABASE_URL` password
2. Reiniciar API: `pm2 reload`
3. Auditar `audit_log` por atividade suspeita das últimas 24h

---

## 7. Migrações de dados

### Adicionar nova entidade ao PG (template)

```typescript
// 1. apps/api/src/db/schema.ts
export const minhaEntidade = pgTable(
  'minha_entidade',
  { id: text('id').primaryKey(), payload: jsonb('payload').notNull(), /* ... */ },
  (t) => ({ /* indexes */ }),
)

// 2. Gerar migration
// $ pnpm --filter @aletis/api db:generate

// 3. Aplicar
// $ pnpm --filter @aletis/api db:migrate

// 4. apps/api/src/db/MinhaEntidadeRepository.ts
export async function upsertMinhaEntidade(x) {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    await db.insert(minhaEntidade).values(...).onConflictDoUpdate(...)
  } catch (err) {
    console.warn('[MinhaEntidadeRepo.upsert] fail:', err.message)
  }
}

// 5. Plugar no Service correspondente (dual-write fire-and-forget)
class MyService {
  save() {
    // ... write to disk first ...
    void (async () => {
      const repo = await import('../../db/MinhaEntidadeRepository.js')
      await repo.upsertMinhaEntidade(...)
    })()
  }
}

// 6. Test integração em tests/db/minha-entidade-repository.test.ts
```

### Re-rodar migration completa em ambiente novo
```bash
pnpm --filter @aletis/api db:migrate    # cria tabelas
pnpm --filter @aletis/api migrate:storage   # popula
pnpm --filter @aletis/api migrate:leads     # popula PGFN se houver
```

---

## 8. Pipeline de prospecção

### PGFN (offline)
1. Download manual do dump PGFN (46M linhas, ~5 GB)
2. `pnpm --filter @aletis/api ingest:pgfn` filtra agro → 39k leads
3. Output: `storage/prospeccao/leads-agro.json` (94 MB)
4. `pnpm --filter @aletis/api migrate:leads` popula `lead_pgfn` no PG

### DOU (diário)
- Cron sugerido: 06:00 UTC dias úteis
- `pnpm --filter @aletis/api ingest:dou`
- Heurística atual: keywords agro + crise (RJ, falência, leilão, execução fiscal/judicial)
- Hot-leads: integrar com `getProspeccaoService().registrarHotLead(...)`

### SICAR (atualmente bloqueado)
- Portal oficial em manutenção Dataprev
- Pipeline pronto: `pnpm download:sicar` + `pnpm refresh:sicar`
- Quando voltar, ativar cron 4×/dia

### SOCIO_AGRO (BrasilAPI)
- Expande PJs em sócios PF via BrasilAPI
- `pnpm --filter @aletis/api ingest:socios`
- Output: `storage/prospeccao/socios-expansion.json`

---

## 9. Cenários de incidente

### "Dashboard mostra 0 clientes mas eu sei que tem 3"
1. `curl http://localhost:3011/api/clientes` — confirma se API retorna
2. Se sim, problema é frontend → DevTools console + Network tab
3. Se não, verificar Map em memória:
   - PG ativado? `echo $ALETIS_PG_ENABLED` deve ser 1
   - PG funcional? `psql -c 'SELECT count(*) FROM cliente'`
   - Boot orchestrator rodou? `grep "ALETIS-PG" /var/log/aletis-api.log`
4. Se PG vazio mas storage tem clientes, rodar `pnpm migrate:storage`

### "Fontes mostram 19/36 offline"
- **Já resolvido na sessão NASA P0-01**. Bug histórico do
  `maxContentLength: 2048` no probe foi corrigido. Se voltar:
  1. Verificar `apps/api/src/services/DataSourceManager.ts:619`
  2. Rodar probe manual: `curl -X POST http://localhost:3011/api/fontes/probe`
  3. Inspecionar `audit_log` por `fonte_state_transition` recente

### "ALIX retorna error 401 da Azure"
1. Verificar `AZURE_AI_SERVICES_KEY` válido
2. `curl -X POST http://localhost:3011/api/alix/llm/health`
3. Se Azure CLI logado (`az login`), AAD pode estar funcionando vs key
4. `FOUNDRY_PREFER_KEY=1` força uso da key over AAD

### "Rate-limit derrubando users legítimos"
- Padrão é 300 req/min — generoso, mas se subir SaaS multi-tenant,
  pode bater. Escalar via `RATE_LIMIT_MAX=1000` ou implementar
  rate-limit por API key (não por IP).

### "PG está cheio (disco)"
1. `audit_log` cresce sem limite — adicionar TTL/partição:
   ```sql
   DELETE FROM audit_log WHERE criado_em < NOW() - INTERVAL '90 days';
   ```
2. `alix_insight` idem
3. Considerar `pg_partman` para particionamento automático

### "CI falhando após PR"
1. `gh run view --log-failed` mostra erro raw
2. Reproduzir local: `pnpm typecheck && pnpm --filter @aletis/api test`
3. Se for env-dependente: verificar `vitest.config.ts` carrega .env
4. Push fix incremental sem amend (preserve audit trail)

---

## 10. Recursos externos

- Repo: https://github.com/gabrielrmsaganski-cpu/aletis-system
- CI: https://github.com/gabrielrmsaganski-cpu/aletis-system/actions
- Drizzle Studio (local): http://localhost:4983 (após `db:studio`)
- PG admin: psql / pgAdmin / DBeaver
- Postgres docs: https://www.postgresql.org/docs/
- Drizzle ORM docs: https://orm.drizzle.team/
- Fastify docs: https://www.fastify.io/docs/

---

**Em caso de dúvida**: consultar `aletis-audit/RELATORIO-NASA.md` (auditoria
360° interna feita em 2026-04-25) e `apps/api/docs/` para documentação
específica por módulo.
