# ALETIS — Guia de deploy e migração

Este guia cobre subir o sistema ALETIS em um novo servidor, seja do zero
ou migrando de uma instância existente. Alvo: servidor Linux (testado em
Ubuntu 24.04 / Azure), Node 20+, pnpm 9+.

---

## 1. Pré-requisitos

| Item | Versão testada | Como instalar |
|---|---|---|
| Node.js | 20.x ou 22.x | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -` + `sudo apt install nodejs` |
| pnpm | 9.x | `npm install -g pnpm@9` |
| git | qualquer | `sudo apt install git` |
| Chromium deps (puppeteer) | — | `sudo apt install -y chromium-browser libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2` |
| nginx (opcional) | 1.20+ | `sudo apt install nginx` |

**Espaço em disco recomendado:** 10 GB (código + node_modules + storage
runtime). Se for habilitar SICAR com todas as UFs, reservar **~20 GB
adicionais**.

---

## 2. Clone + instalação de dependências

```bash
git clone https://github.com/gabrielrmsaganski-cpu/aletis-system.git
cd aletis-system
pnpm install
```

O `pnpm install` cuida dos workspaces automaticamente (apps/api,
apps/web, packages/*).

---

## 3. Configuração de ambiente

```bash
cp .env.example .env
```

Abra `.env` e preencha — **mínimo absoluto para produção:**

| Variável | Obrigatória? | Como obter |
|---|---|---|
| `JWT_SECRET` | **sim** em prod | `openssl rand -hex 32` |
| `PORT` | default 3001 | — |
| `NODE_ENV` | `production` em prod | — |

**Integrações opcionais** (cada bloco pode ficar vazio se não usar):

- **WhatsApp Cloud API (Meta):** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID` — habilita o
  bot WhatsApp da Alix. Setup passo-a-passo no próprio `.env.example`.
- **Azure Speech (STT/TTS):** `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`
  — transcrição e síntese de áudio para WhatsApp.
- **Azure AI Foundry (Alix LLM):** `CLAUDE_FOUNDRY_BASE_URL`,
  `CLAUDE_MODEL_SONNET` — cérebro do Alix (Claude Sonnet 4.6). Sem isso,
  Alix cai em fallback de regras.
- **2captcha:** `TWOCAPTCHA_API_KEY` — resolve captchas em SICAR/Receita.
- **SICAR:** `SICAR_DOWNLOAD_DIR`, `SICAR_UFS` — prospecção via CAR.

> Fontes de dados **públicas** (BCB, CEPEA via NoticiasAgricolas, INMET,
> IBGE, ANP, NASA FIRMS, OpenMeteo, AwesomeAPI, ComexStat) funcionam
> **sem nenhuma chave**.

---

## 4. Build de produção

```bash
# 1. Build do pacote knowledge-base (precisa existir antes da API)
pnpm -F @aletis/knowledge-base build

# 2. Build do frontend (gera apps/web/dist/)
pnpm --filter ./apps/web build

# 3. Build da API (gera apps/api/dist/)
pnpm --filter ./apps/api build
```

O `apps/web/dist/` é estático — sirva com nginx, cloudfront, ou
`pnpm --filter ./apps/web preview` (porta 5173).

---

## 5. Rodando

### 5.1 Dev (hot reload)

```bash
# A partir da raiz do repo
pnpm dev
```

Isso inicia **api (3001)** + **web (5173)** em paralelo via Turborepo.

### 5.2 Prod manual

```bash
# Terminal 1 — API
pnpm --filter ./apps/api start

# Terminal 2 — Web (estático)
pnpm --filter ./apps/web preview
```

### 5.3 Prod com systemd (recomendado)

Crie dois user services em `~/.config/systemd/user/`:

**`aletis-api.service`**

```ini
[Unit]
Description=ALETIS API (Fastify)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/azureai/ALETIS/aletis-system
ExecStart=/usr/bin/pnpm --filter ./apps/api start
Restart=on-failure
RestartSec=5
StandardOutput=append:/home/azureai/ALETIS/aletis-system/logs/api.log
StandardError=append:/home/azureai/ALETIS/aletis-system/logs/api.err

[Install]
WantedBy=default.target
```

**`aletis-web.service`**

```ini
[Unit]
Description=ALETIS Web (Vite preview)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/azureai/ALETIS/aletis-system
ExecStart=/usr/bin/pnpm --filter ./apps/web preview
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Ative:

```bash
systemctl --user daemon-reload
systemctl --user enable --now aletis-api aletis-web
sudo loginctl enable-linger $USER   # pra não derrubar ao deslogar
```

### 5.4 Nginx reverse proxy (opcional — habilita HTTPS)

`/etc/nginx/sites-available/aletis`:

```nginx
server {
    listen 80;
    server_name seu-dominio.com.br;

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE do Alix precisa desses dois
        proxy_buffering off;
        proxy_read_timeout 1h;
    }

    # Front
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/aletis /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# HTTPS: sudo certbot --nginx -d seu-dominio.com.br
```

---

## 6. Migração de estado persistente

O código está no git. O **estado operacional** (clientes, sessões,
documentos, memória Alix) vive em `apps/api/storage/` e fica fora do
git (está em `.gitignore`).

Subpastas importantes em `apps/api/storage/`:

| Pasta | Conteúdo |
|---|---|
| `alix-sessions/` | Histórico de conversas da Alix por usuário |
| `alix-documents/` | PDFs/DOCX/XLSX/imagens enviadas pelo usuário pra Alix |
| `alix-outputs/` | Documentos gerados pela Alix (PDF/DOCX/XLSX) |
| `alix-memory/` | Memória Markdown por cliente (Paulo Luciano, Ailton, etc.) |
| `whatsapp-sessions/` + `whatsapp-alix-sessions/` | Threads WhatsApp |
| `clientes/` | Snapshots de análises automáticas |
| `custeio/` | Planos de custeio agrícola |
| `bsc/` | Snapshots append-only de BSC por cliente |
| `financeiro/` | Caixa/receitas/despesas/DAS (JSON local) |
| `prospeccao/` | Leads, blacklist, queue, SICAR enrichment |
| `*-pendentes/`, `eventos/`, `fiscal/`, `planner/`, `tarefas/` | Filas e artefatos de workflow |

**Para migrar o estado:**

```bash
# No servidor ORIGEM
cd /home/azureai/ALETIS/aletis-system
tar czf /tmp/aletis-storage.tgz apps/api/storage/

# Copie pro novo servidor (scp / rsync / S3)
scp /tmp/aletis-storage.tgz usuario@novo-servidor:/tmp/

# No servidor DESTINO
cd /home/azureai/ALETIS/aletis-system   # caminho onde clonou
tar xzf /tmp/aletis-storage.tgz
```

**Atenção:** se as pessoas continuarem usando o servidor origem enquanto
você migra, o estado diverge. Pare a API origem antes do tar:

```bash
systemctl --user stop aletis-api   # no origem
# … dump, transfer, restore …
systemctl --user start aletis-api  # no destino
```

---

## 7. Integrações externas que precisam de atenção no destino

### WhatsApp Cloud API

O webhook aponta pra URL pública. Após migrar, no Meta for Developers:

1. **App > WhatsApp > Configuration > Webhook** → atualize o
   `Callback URL` pro novo domínio (`https://novo-dominio/api/whatsapp/webhook`)
2. Verifique que `WHATSAPP_VERIFY_TOKEN` no `.env` bate com o que está
   cadastrado no Meta.

### Azure Foundry (Alix LLM)

A chave é **stateless** — basta copiar `CLAUDE_FOUNDRY_BASE_URL` e
`AZURE_SPEECH_KEY` (é a mesma resource) no `.env` do destino.
Em Azure VM com Managed Identity, a auth funciona sozinha.

### 2captcha / SICAR

Só relevante se você usa prospecção via SICAR. O saldo de 2captcha é
por conta, não por servidor — `TWOCAPTCHA_API_KEY` funciona igual no
destino.

Os shapefiles SICAR são baixados sob demanda por `pnpm download:sicar`.
Pra não re-baixar 20 GB, **copie `SICAR_DOWNLOAD_DIR` e `SICAR_EXTRACT_DIR`**
junto com o storage.

---

## 8. Smoke tests pós-deploy

Depois de subir os dois serviços, confira:

```bash
# API viva
curl -s http://localhost:3001/api/health | jq .
# Esperado: {"status":"ok", ...}

# Indicadores BCB chegando
curl -s http://localhost:3001/api/mercado/indicadores | jq '.data | length'
# Esperado: > 0 (BCB público, sempre responde)

# Web servindo
curl -sI http://localhost:5173/ | head -1
# Esperado: HTTP/1.1 200 OK

# Alix (se LLM configurado)
curl -s -X POST http://localhost:3001/api/alix/chat \
  -H 'content-type: application/json' \
  -d '{"message":"diga olá em 5 palavras"}' | jq '.data.reply'
```

No browser:

1. Acesse `/` — Dashboard deve carregar com ticker no topo
2. Pressione **⌘K** (macOS) ou **Ctrl+K** (Linux/Windows) — paleta abre
3. Acesse `/ferramentas` — 14 cards em 6 categorias + overview editorial
4. Acesse `/ia` — upload de PDF + chat com Alix (se `ALIX_USE_LLM=true`)

---

## 9. Troubleshooting

**`ECONNREFUSED 127.0.0.1:3001` no front:** API não subiu. `journalctl --user -u aletis-api -f`.

**Alix responde `[Alix sem resposta]`:** `CLAUDE_FOUNDRY_BASE_URL` vazio ou
`ALIX_USE_LLM=false`. Verifique `.env`.

**Puppeteer quebra (`Failed to launch browser`):** faltam libs do Chromium.
Ver seção 1 (linha `sudo apt install ... libnss3 libatk1.0-0 ...`).

**Cache de fonte externa estagnado:** `curl -X DELETE http://localhost:3001/api/fontes/cache`.

**`pnpm install` erra em `sharp`:** build nativo. `pnpm rebuild sharp`.

**SSE do Alix trava via nginx:** confira `proxy_buffering off` e
`proxy_read_timeout 1h` no bloco `/api/`.

**Storage do destino não aparece:** conferir permissões —
`chown -R $USER:$USER apps/api/storage`.

---

## 10. Atualizações futuras

```bash
cd /home/azureai/ALETIS/aletis-system
git pull origin main
pnpm install                              # se package.json mudou
pnpm -F @aletis/knowledge-base build
pnpm --filter ./apps/web build
pnpm --filter ./apps/api build
systemctl --user restart aletis-api aletis-web
```

Rodar os smoke tests da seção 8 depois de cada update.

---

© ALETIS — Christian Kohler
