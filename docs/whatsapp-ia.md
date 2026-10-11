# Central WhatsApp IA — ALETIS

Modulo para operar WhatsApp dentro do ALETIS usando Evolution API v2, Evolution Manager, ALIX, checklist de elegibilidade, documentos e agenda do consultor Christian.

Documento operacional completo: `docs/whatsapp-ia-api.md`.

## Arquitetura

```
WhatsApp
  -> Evolution API
  -> POST /api/whatsapp/webhook
  -> Motor WhatsApp IA
  -> CRM + elegibilidade + documentos + Google Calendar
  -> Evolution API /message/sendText/{instance}
```

A IA escreve a conversa. O backend decide elegibilidade, status, agenda, checklist e persistencia.

## Infraestrutura

Subir apenas a infraestrutura WhatsApp:

```bash
cp .env.example .env
openssl rand -hex 32
# coloque o valor em EVOLUTION_API_KEY
docker compose -f docker-compose.whatsapp.yml up -d
```

Subir tambem o Evolution Manager:

```bash
docker compose -f docker-compose.whatsapp.yml --profile manager up -d
```

Servicos:

- `evolution-api`: API WhatsApp em `http://localhost:8080`.
- `evolution-manager`: painel admin em `http://localhost:3008`.
- `evolution-postgres`: banco interno da Evolution.
- `evolution-redis`: cache/fila da Evolution.
- `evolution-minio`: storage local para midias.

## Variaveis principais

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_PUBLIC_URL=http://localhost:8080
EVOLUTION_API_KEY=<segredo>
EVOLUTION_INSTANCE=aletis-principal
EVOLUTION_WEBHOOK_URL=https://seu-dominio/api/whatsapp/webhook
EVOLUTION_WEBHOOK_BASE64=true

WHATSAPP_STORAGE_PROVIDER=local
WHATSAPP_STORAGE_DIR=./storage/whatsapp-media
WHATSAPP_IA_ENABLED=true
WHATSAPP_IA_MODEL=gpt-5.6-luna
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_TTS_MODEL=tts-1-hd
OPENAI_TTS_VOICE=nova
OPENAI_TTS_FORMAT=opus

GOOGLE_CALENDAR_ENABLED=false
GOOGLE_CALENDAR_DRY_RUN=true
GOOGLE_CALENDAR_ID=primary
GOOGLE_OAUTH_ACCESS_TOKEN=
```

Em dev, mantenha `GOOGLE_CALENDAR_DRY_RUN=true`. Assim o sistema mostra horarios e registra o agendamento no ALETIS sem criar evento externo.

## Webhook

Configurar pela API ALETIS:

```bash
curl -X POST http://localhost:3011/api/whatsapp/evolution/webhook/set \
  -H 'Content-Type: application/json' \
  -d '{"instance":"aletis-principal","url":"https://seu-dominio/api/whatsapp/webhook"}'
```

Eventos aceitos:

- `MESSAGES_UPSERT`
- `MESSAGES_UPDATE`
- `SEND_MESSAGE`
- `CONNECTION_UPDATE`

O ALETIS grava todo evento em `whatsapp_webhook_event` e usa idempotencia por `instance + event + message_id`.

## Fluxo funcional

1. Cliente envia mensagem.
2. Webhook normaliza payload da Evolution.
3. ALETIS salva conversa e mensagem.
4. Se IA estiver ativa, o motor pergunta uma etapa por vez do checklist.
5. `EligibilityService` calcula aderencia por regra configuravel.
6. Se elegivel, `GoogleCalendarService` oferece horarios.
7. Cliente escolhe horario por numero.
8. Sistema cria evento real ou dry-run e marca conversa como `reuniao_agendada`.
9. Sistema inicia checklist documental.
10. PDFs, imagens e documentos recebidos sao salvos e classificados.

## Banco

Migrations:

- `apps/api/src/db/migrations/0020_whatsapp_evolution.sql`
- `apps/api/src/db/migrations/0021_whatsapp_ia_api_hardening.sql`

Tabelas:

- `whatsapp_conversation`
- `whatsapp_message`
- `whatsapp_document`
- `whatsapp_eligibility_answer`
- `whatsapp_webhook_event`
- `whatsapp_calendar_event`
- `whatsapp_outbox`
- `whatsapp_contact`
- `whatsapp_media_file`
- `whatsapp_audit_log`

## Endpoints ALETIS

```text
POST /api/whatsapp/webhook
GET  /api/whatsapp/status
GET  /api/whatsapp/instances
POST /api/whatsapp/evolution/webhook/set
GET  /api/whatsapp/conversations
GET  /api/whatsapp/conversations/:id
POST /api/whatsapp/conversations/:id/handoff
POST /api/whatsapp/conversations/:id/ai
POST /api/whatsapp/conversations/:id/send
GET  /api/whatsapp/documents
```

## Testes manuais

Status:

```bash
curl http://localhost:3011/api/whatsapp/status
```

Webhook texto Evolution:

```bash
curl -X POST http://localhost:3011/api/whatsapp/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "event":"messages.upsert",
    "instance":"aletis-principal",
    "data":{
      "key":{"id":"test-msg-1","remoteJid":"556699999999@s.whatsapp.net","fromMe":false},
      "pushName":"Cliente Teste",
      "message":{"conversation":"Oi"},
      "messageTimestamp":1779926400
    }
  }'
```

Reenviar o mesmo payload deve gerar 200 e nao duplicar mensagem.

Conversas:

```bash
curl http://localhost:3011/api/whatsapp/conversations
```

## Tela

Acesse `/whatsapp`.

A tela mostra:

- conversas recebidas;
- status da infraestrutura;
- handoff humano;
- devolucao para IA;
- envio manual;
- checklist documental;
- respostas de elegibilidade;
- documentos recebidos.

## Observacoes de producao

- Nao use `EVOLUTION_API_KEY` do exemplo.
- Use HTTPS publico em `EVOLUTION_WEBHOOK_URL`.
- Configure backup para Postgres da Evolution, Postgres do ALETIS e storage de midias.
- Para Google Calendar real, defina `GOOGLE_CALENDAR_ENABLED=true`, `GOOGLE_CALENDAR_DRY_RUN=false` e um token OAuth valido com escopo de Calendar.
- Para transcricao e sintese de audio, configure uma `OPENAI_API_KEY` valida. Os
  modelos e a voz podem ser ajustados pelas variaveis `OPENAI_TRANSCRIPTION_MODEL`,
  `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` e `OPENAI_TTS_FORMAT`.
