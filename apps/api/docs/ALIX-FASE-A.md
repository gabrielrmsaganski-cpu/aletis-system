# ALIX — Fase A (proatividade push)

Quatro capacidades novas, todas prontas e degradando com graça enquanto o WhatsApp não está conectado.

## 1 · Canal de push unificado (A.1)

**Arquivo:** `src/services/alix/push/AlixPushChannel.ts`

- Destino real: WhatsApp Cloud API (Meta) via `WhatsAppService.sendText`
- Destino fallback: log (console + JSONL em `storage/alix-push/YYYY-MM-DD.jsonl`)
- Dedupe: mesma mensagem+destino em <60s é ignorada
- Rate limit: 1 msg / 5s por destino
- Dryrun: `ALIX_PUSH_DRYRUN=true` → imprime "DRYRUN → destino: preview" sem chamar a Meta

Integração viva: `ProactiveService.recordInsight()` agora dispara `sendInsight()` automaticamente para insights com `urgencia='critico'` (e `importante` se `ALIX_PUSH_ALLOW_IMPORTANTE=true`).

## 2 · Briefing diário 7h (A.2)

**Arquivos:**
- `src/services/alix/push/DailyBriefingService.ts`
- `src/services/alix/ProactiveService.ts` (scheduleDailyBriefing)

Formato WhatsApp-ready com 4 blocos:
1. **Mercado** — top altas/baixas commodities (7d), USD, Selic, IPCA + narrativa curta
2. **Agenda** — hot-leads pendentes, leads para reengajar, confirmações HITL abertas
3. **Atenção 48h** — insights críticos e importantes recentes
4. **Foco do dia** — CTA para ALIX

Cron interno: agenda próximo disparo para 07:07 local; após disparar, reagenda para +24h.

## 3 · Streaming real (A.3)

**Arquivo:** `src/routes/alix.ts` (endpoint `POST /api/alix/chat/stream`)
**Mudança:** `src/services/AlixService.ts` `chat()` agora aceita `onToolCall` callback.

Antes: `token` event chunking 48 chars a cada 10ms APÓS o chat completo.
Agora:
- `start` imediato
- `thinking` com texto "analisando…"
- `tool` EM TEMPO REAL enquanto o LLM chama cada tool (via callback do `runClaude`)
- `ping` heartbeat a cada 10s (evita percepção de conexão morta)
- `token` word-by-word com delay 4ms
- `done` com payload completo

## 4 · Tool noticias_agro_hoje (A.4)

**Arquivo:** `src/services/alix/tools/news.ts`

Tool leve no Orchestrator com cache 30min. Aceita:
- `queries: string[]` — lista customizada
- `topico: 'macro'|'safra'|'crise'|'legislacao'` — atalho

Default: 4 queries (Selic Copom, safra 2026, RJ agro, MCR). Usa `WebSearchProviderFactory` (Claude nativo preferido, Tavily como fallback). Quando Claude nativo é usado, retorna hint para o LLM chamar `web_search` embutida com as queries.

---

## Variáveis de ambiente (Fase A)

### Obrigatórias para ligar push real ao WhatsApp

```
# 1) Conectar WhatsApp Cloud API (Meta) — quando tiver número business ativo:
WHATSAPP_TOKEN=EAA...                   # System User Token da Meta (longo prazo)
WHATSAPP_PHONE_NUMBER_ID=123456789      # phone number id do WhatsApp Business
WHATSAPP_VERIFY_TOKEN=seu_verify_token  # para webhook GET handshake
WHATSAPP_API_VERSION=v19.0              # opcional, default v19.0
WHATSAPP_BUSINESS_ACCOUNT_ID=...        # opcional, só p/ operações avançadas

# 2) Destino dos pushes da ALIX — número do Christian em E.164:
ALIX_PROACTIVE_PUSH_WHATSAPP=+5541999999999
```

### Opcionais de comportamento

```
# Habilita/desabilita todo o canal de push (default true)
ALIX_PUSH_ENABLED=true

# Dryrun: loga "DRYRUN" sem enviar (útil para testar formatação)
ALIX_PUSH_DRYRUN=false

# Permite push também para urgência 'importante' (default só 'critico')
ALIX_PUSH_ALLOW_IMPORTANTE=false

# Briefing diário: horário local (default 07:07)
ALIX_BRIEFING_ENABLED=true
ALIX_BRIEFING_HOUR=7
ALIX_BRIEFING_MINUTE=7
ALIX_BRIEFING_SKIP_WEEKEND=false

# News: fallback Tavily quando Claude nativo não funciona
TAVILY_API_KEY=tvly-...
```

---

## Endpoints admin

| Endpoint | O que faz |
|---|---|
| `GET /api/alix/push/health` | Status: enabled, dryRun, destino (log/whatsapp), número alvo, nextBriefingAt |
| `POST /api/alix/push/test` | Envia mensagem de teste (respeita flags). Body opcional: `{ "body": "..." }` |
| `POST /api/alix/briefing/run` | Dispara briefing sob demanda (dev/admin) |

---

## Como ligar o WhatsApp quando pronto

1. No Meta Business Suite, crie um app WhatsApp Business e obtenha `System User Token` + `Phone Number ID`
2. Adicione número de teste ao destinatário na plataforma Meta (ou aceite mensagens inbound para iniciar janela de 24h)
3. Popule as 4 variáveis `WHATSAPP_*` no `.env`
4. Defina `ALIX_PROACTIVE_PUSH_WHATSAPP=+55...`
5. Restart da API: `pnpm --filter @aletis/api dev`
6. Validar: `curl -X POST http://localhost:3011/api/alix/push/test` — se retornar `destination.kind === 'whatsapp'` e `messageId`, chegou.
7. Validar briefing: `curl -X POST http://localhost:3011/api/alix/briefing/run`

Enquanto não houver WhatsApp, tudo roda em modo log e registra em `storage/alix-push/*.jsonl` para inspeção posterior.
