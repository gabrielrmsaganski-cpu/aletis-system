# 🚀 ALETIS — Guia de Migração de Servidor

Guia passo-a-passo para mover o sistema ALETIS (API + Web + Site) entre servidores **com zero perda de dados** e tempo de downtime mínimo.

---

## Visão geral

A migração tem 3 fases:

```
┌─ Servidor antigo ─┐     ┌─ Servidor novo ─┐
│  1. Backup        │ ──► │  2. Provision    │
│  (banco+storage)  │     │  (clone+up)      │
└───────────────────┘     │                  │
                          │  3. Restore      │
                          │  (banco+storage) │
                          └──────────────────┘
```

Tempo típico: **15-30min** (dependendo do tamanho dos volumes).

---

## Pré-requisitos no servidor novo

- **Docker** ≥ 24 e **Docker Compose** plugin v2+
- **2 GB RAM mínimo** (recomendado 4 GB; ALIX é parrudo)
- **20 GB disco** (10 GB para PG + uploads + 10 GB para SICAR opcional)
- **Acesso SSH e Git** ao repositório `gabrielrmsaganski-cpu/aletis-system`
- Portas livres: `3011` (API), `5173` (Web), `3000` (Site), `5432` (Postgres — só se for expor)

```bash
# Verificar
docker --version          # Docker version 24+
docker compose version    # Docker Compose version v2+
free -h                   # Mem: pelo menos 2Gi available
df -h /                   # /  pelo menos 20G available
```

---

## Fase 1 — Backup no servidor antigo

```bash
cd /caminho/para/aletis-system
./scripts/migration/backup.sh
# → gera ./backups/aletis-backup-YYYY-MM-DD-HHMMSS.tgz
```

O backup inclui:
- Dump completo do Postgres (`pg_dump` com `--clean --if-exists`)
- Tar do volume `aletis-api-storage` (uploads do Portal do Cliente)
- Tar do volume `aletis-site-storage` (leads.jsonl do site)
- Manifesto com data, host e SHA do git

Copie o arquivo para o servidor novo:

```bash
scp backups/aletis-backup-*.tgz NOVO_SERVIDOR:/tmp/
```

---

## Fase 2 — Provision no servidor novo

### 2.1. Clonar o repositório

```bash
cd /opt   # ou onde preferir
git clone https://github.com/gabrielrmsaganski-cpu/aletis-system.git
cd aletis-system
```

### 2.2. Configurar `.env`

```bash
cp .env.example .env
nano .env
```

**Mínimo obrigatório para produção:**

```bash
# Gere secrets fortes
openssl rand -hex 32  # → cole em JWT_SECRET
openssl rand -hex 24  # → cole em METRICS_TOKEN

# Edite no .env:
NODE_ENV=production
JWT_SECRET=<o que você gerou>
METRICS_TOKEN=<o que você gerou>
CORS_ALLOWED_ORIGINS=https://app.aletis.com.br,https://aletis.com.br
DATABASE_URL=postgres://aletis:SENHA_FORTE@postgres:5432/aletis
POSTGRES_PASSWORD=SENHA_FORTE
ALETIS_PORTAL_BASE_URL=https://app.aletis.com.br

# Se já tinha credenciais no servidor antigo, copie aqui:
AZURE_AI_SERVICES_KEY=<copie do .env antigo>
WHATSAPP_TOKEN=<copie do .env antigo>
WHATSAPP_PHONE_NUMBER_ID=<copie>
RESEND_API_KEY=<copie>
TAVILY_API_KEY=<copie>
DATAJUD_API_KEY=<copie>
```

> **Lembre:** o `.env` real nunca está no Git (correto). Você precisa copiar manualmente as credenciais sensíveis do servidor antigo.

### 2.3. Subir os serviços

```bash
docker compose up -d --build
```

A primeira execução vai:
1. **Build** das imagens Docker (api, web, site) — ~3-5min
2. Subir o **Postgres** com healthcheck
3. Subir a **API**, que vai automaticamente:
   - Aplicar todas as migrations Drizzle (`ALETIS_AUTO_MIGRATE=1`)
   - Hidratar pendências/uploads/tokens válidos do PG (se backup já restaurado)
   - Listar tabelas e logar contagens
4. Subir o **Web** (Nginx servindo `/dist`)
5. Subir o **Site** (Next.js standalone)

**Verifique se tudo subiu:**

```bash
docker compose ps
# Todos com STATUS = Up (healthy)

# Healthcheck rápido
curl http://localhost:3011/api/health
# {"success":true,"data":{"status":"ok",...}}

# Healthcheck profundo (PG + storage + ALIX)
curl http://localhost:3011/api/health/deep | jq .
# {"success":true,"data":{
#   "status":"ok",
#   "checks":{
#     "postgres":{"ok":true,"tookMs":3},
#     "storage":{"ok":true,"detail":"./storage/portal-uploads"},
#     "alix":{"ok":true,"detail":"Foundry credentials present"}
#   }
# }}
```

---

## Fase 3 — Restore dos dados

```bash
./scripts/migration/restore.sh /tmp/aletis-backup-YYYY-MM-DD-HHMMSS.tgz
```

O script vai:
1. Extrair o `.tgz` em diretório temporário
2. Restaurar o **dump SQL** no Postgres (sobrescreve dados existentes — `--clean`)
3. Restaurar o volume **aletis-api-storage** (uploads)
4. Restaurar o volume **aletis-site-storage** (leads)
5. **Reiniciar API e Site** para re-hidratar Maps em memória do PG

**Validação final:**

```bash
# Healthcheck profundo
curl http://localhost:3011/api/health/deep | jq .

# Conta clientes restaurados
docker compose exec postgres psql -U aletis -d aletis -c \
  'SELECT count(*) AS clientes FROM cliente;'

# Verifica magic-links válidos
docker compose exec postgres psql -U aletis -d aletis -c \
  "SELECT count(*) AS tokens FROM portal_token WHERE consumido_em IS NULL AND expira_em > NOW();"
```

Acesse:
- Sistema interno: `http://NOVO_SERVIDOR:5173`
- Portal cliente: `http://NOVO_SERVIDOR:5173/portal-cliente`
- Site institucional: `http://NOVO_SERVIDOR:3000`

---

## Configurar reverse proxy (nginx/Caddy/Traefik)

Em produção real, você vai querer TLS + domínios próprios. Exemplo com Caddy:

```caddyfile
# /etc/caddy/Caddyfile

# API
api.aletis.com.br {
  reverse_proxy localhost:3011
}

# Sistema interno
app.aletis.com.br {
  reverse_proxy localhost:5173
}

# Site institucional + Portal Cliente (mesmo SPA)
aletis.com.br, www.aletis.com.br {
  reverse_proxy localhost:3000
}
```

---

## DNS

Apontar registros A para o IP do novo servidor:

```
api.aletis.com.br      A    NOVO_IP
app.aletis.com.br      A    NOVO_IP
aletis.com.br          A    NOVO_IP
www.aletis.com.br      A    NOVO_IP
```

TTL baixo (300s) durante a janela de migração; depois pode subir.

---

## Smoke test pós-migração (5min)

```bash
# 1. Backend healthy
curl https://api.aletis.com.br/api/health/deep | jq .

# 2. Login portal funciona (use credencial real)
curl -X POST https://api.aletis.com.br/api/portal/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"usuario":"...","senha":"..."}'

# 3. ALIX responde
curl -X POST https://api.aletis.com.br/api/alix/chat \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"smoke","message":"Olá ALIX, você está funcionando?"}'

# 4. Site abre
curl -sI https://aletis.com.br | head -1   # HTTP/2 200
curl -sI https://aletis.com.br/sobre | head -1
curl -sI https://aletis.com.br/insights/dscr-safra-brasileiro | head -1

# 5. Sistema abre
curl -sI https://app.aletis.com.br | head -1
```

---

## Rollback

Se algo deu errado e quiser voltar pro servidor antigo:

1. **Não derrube o servidor antigo** durante a migração (mantenha 24h de overlap).
2. Reverta o DNS para o IP antigo.
3. Marque como down o novo: `docker compose down`.
4. Investigue logs: `docker compose logs --tail=200 api`.

---

## Manutenção contínua

### Logs

```bash
docker compose logs -f api          # API ao vivo
docker compose logs --tail=200 web  # Web últimas 200 linhas
docker compose logs --since 1h      # tudo da última hora
```

### Backup automático (cron)

```cron
# /etc/cron.d/aletis-backup
0 3 * * * aletis cd /opt/aletis-system && ./scripts/migration/backup.sh > /var/log/aletis-backup.log 2>&1
0 4 * * 0 aletis find /opt/aletis-system/backups -name "aletis-backup-*.tgz" -mtime +30 -delete
```

### Atualização de versão

```bash
cd /opt/aletis-system
git pull origin main
docker compose build
docker compose up -d
# Auto-migrate roda no boot da API. Healthcheck confirma.
curl http://localhost:3011/api/health/deep
```

### Métricas Prometheus

`/metrics` é protegido por `METRICS_TOKEN`:

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3011/metrics
```

---

## Troubleshooting

### "auto-migrate falhou — abortando start"

```bash
# Verifica se PG está respondendo
docker compose exec postgres pg_isready -U aletis

# Roda manual para ver erro completo
docker compose exec api node dist/scripts/db-migrate.js
```

### "JWT_SECRET é obrigatório em produção"

Edite `.env` e gere o secret:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d api
```

### Portal não restaurou magic-links

Magic-links têm TTL de 15min. Se já expiraram no momento do backup, eles não voltam ativos. **É comportamento correto** — são tokens temporários por design. Cliente solicita um novo via `/api/portal/auth/magic/request`.

### Volume cheio

```bash
# Tamanho dos volumes
docker system df -v

# Limpar imagens antigas
docker image prune -a
```

---

## Checklist resumido

```
☐ Backup no servidor antigo
☐ Copiar .tgz para servidor novo
☐ git clone + docker version verificado
☐ cp .env.example .env + edição manual com secrets
☐ docker compose up -d --build
☐ docker compose ps (todos healthy)
☐ curl /api/health/deep (status: ok)
☐ ./scripts/migration/restore.sh BACKUP.tgz
☐ docker compose ps (api/site reiniciados)
☐ smoke tests (login, ALIX, site, sistema)
☐ DNS apontando pro novo IP
☐ Reverse proxy configurado com TLS
☐ Cron de backup automático ativo
☐ Servidor antigo mantido por 24h (rollback safety)
☐ Servidor antigo desligado após validação
```

---

**Tempo de migração estimado**: 15-30min (sem reverse proxy/DNS, que adicionam ~10min).

**Downtime perceptível**: <1min (entre o pull do DNS no cliente e o serviço novo responder).
