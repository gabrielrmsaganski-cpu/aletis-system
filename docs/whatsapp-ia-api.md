# WHATSAPP IA API - ALETIS

API interna do ALETIS para operar WhatsApp com Evolution API, CRM, IA, checklist de elegibilidade, documentos, agenda e handoff humano.

## Arquitetura

```text
WhatsApp
  -> Evolution API
  -> POST /api/whatsapp/webhook
  -> WhatsApp IA API
  -> CRM + IA + Checklist + Google Calendar + Documentos
  -> Outbox
  -> Evolution API
  -> WhatsApp
```

A IA conversa e organiza a linguagem. O backend decide estado, elegibilidade, agenda, documentos, handoff e persistencia.

## Arquivos principais

- `docker-compose.whatsapp.yml`: Evolution API, Evolution Manager, Postgres, Redis e MinIO.
- `docker/evolution-manager/`: build local do Manager v2 a partir do repositorio oficial, com nginx estavel.
- `.env`: ja contem a secao real WhatsApp IA com API key e webhook secret gerados localmente.
- `.env.whatsapp.example`: modelo limpo para outro ambiente.
- `config/whatsapp-eligibility.default.json`: checklist de elegibilidade configuravel.
- `apps/api/src/routes/whatsapp.ts`: webhook e endpoints operacionais.
- `apps/api/src/services/whatsapp/*`: servicos de Evolution, estado, CRM lead, IA, audio, documentos, agenda, outbox e handoff.
- `apps/web/src/pages/WhatsApp.tsx`: Central WhatsApp IA.

## Subir infraestrutura

```bash
docker compose -f docker-compose.whatsapp.yml up -d
docker compose -f docker-compose.whatsapp.yml --profile manager up -d
```

URLs locais:

- Evolution API: `http://localhost:8080`
- Evolution Manager: `http://localhost:3008` apenas como apoio técnico local.
- ALETIS API: `http://localhost:3011`
- Central no ALETIS: `/whatsapp`

## Variaveis

As variaveis criticas ja foram inseridas no `.env` local sem expor segredo no codigo:

- `WHATSAPP_PROVIDER=evolution`
- `EVOLUTION_API_URL=http://localhost:8080`
- `EVOLUTION_API_KEY=<gerada no .env>`
- `EVOLUTION_INSTANCE_NAME=aletis-principal`
- `EVOLUTION_WEBHOOK_URL=<url local assinada>`
- `WHATSAPP_WEBHOOK_SECRET=<gerado no .env>`
- `WHATSAPP_ELIGIBILITY_CONFIG_PATH=./config/whatsapp-eligibility.default.json`
- `WHATSAPP_STORAGE_DIR=./storage/whatsapp-media`
- `GOOGLE_CALENDAR_DRY_RUN=true`

Para producao, trocar:

- `WHATSAPP_PUBLIC_BASE_URL`
- `EVOLUTION_PUBLIC_URL`
- `EVOLUTION_WEBHOOK_URL`
- `GOOGLE_CALENDAR_ENABLED=true`
- `GOOGLE_CALENDAR_DRY_RUN=false`
- `GOOGLE_CALENDAR_CREDENTIALS_PATH` ou token OAuth equivalente

## Criar/conectar instancia

Criar instancia pela API ALETIS:

```bash
curl -X POST http://localhost:3011/api/whatsapp/evolution/instances \
  -H 'Content-Type: application/json' \
  -d '{"instanceName":"aletis-principal","qrcode":true}'
```

Buscar QR/conectar:

```bash
curl -X POST http://localhost:3011/api/whatsapp/evolution/instances/aletis-principal/connect
```

Configurar webhook:

```bash
curl -X POST http://localhost:3011/api/whatsapp/evolution/webhook/set \
  -H 'Content-Type: application/json' \
  -d '{"instance":"aletis-principal"}'
```

O endpoint usa `EVOLUTION_WEBHOOK_URL` do `.env`. O segredo pode ir por header ou pela query assinada que ja foi gravada no `.env` local.
Na Evolution API `2.3.7`, o client ALETIS envia o payload no formato real aceito pelo container: `{ "webhook": { ... } }`.

## Endpoints ALETIS

```text
POST /api/whatsapp/webhook
GET  /api/whatsapp/status
GET  /api/whatsapp/instances
POST /api/whatsapp/evolution/instances
POST /api/whatsapp/evolution/instances/:instance/connect
GET  /api/whatsapp/evolution/instances/:instance/status
POST /api/whatsapp/evolution/webhook/set
GET  /api/whatsapp/conversations
GET  /api/whatsapp/conversations/:id
POST /api/whatsapp/conversations/:id/handoff
POST /api/whatsapp/conversations/:id/ai
POST /api/whatsapp/conversations/:id/send
POST /api/whatsapp/conversations/:id/documents/checklist
GET  /api/whatsapp/documents
```

## Fluxos implementados

- Novo contato cria lead no CRM automaticamente.
- Mensagens sao persistidas com idempotencia por `instance_name + provider_message_id`.
- Estado da conversa fica no backend: `new_lead`, `eligibility_*`, `offering_schedule`, `meeting_scheduled`, `waiting_documents`, `human_takeover`.
- Checklist de elegibilidade faz uma pergunta por vez.
- Score e resultado sao calculados por regra, nao por decisao solta da IA.
- Audio recebido e transcrito exclusivamente pela OpenAI com
  `gpt-4o-transcribe`; respostas em voz usam `tts-1-hd` quando solicitadas.
- PDFs, imagens e documentos sao baixados, salvos e vinculados ao cliente/conversa.
- Agenda funciona em `dry_run` por padrao e pode criar evento real quando Google Calendar for habilitado.
- Handoff humano desliga respostas da IA ate o consultor devolver para IA.
- Toda resposta passa por `whatsapp_outbox`, com status, tentativa, erro e provider message id.

## Testes manuais sem WhatsApp conectado

Status:

```bash
curl http://localhost:3011/api/whatsapp/status
```

Webhook de texto:

```bash
curl -X POST "http://localhost:3011/api/whatsapp/webhook?secret=$(grep '^WHATSAPP_WEBHOOK_SECRET=' .env | cut -d= -f2-)" \
  -H 'Content-Type: application/json' \
  -d '{
    "event":"messages.upsert",
    "instance":"aletis-principal",
    "data":{
      "key":{"id":"manual-test-1","remoteJid":"556699999999@s.whatsapp.net","fromMe":false},
      "pushName":"Cliente Teste",
      "message":{"conversation":"Sou produtor rural e preciso rever uma divida bancaria"},
      "messageTimestamp":1779926400
    }
  }'
```

Listar conversas:

```bash
curl http://localhost:3011/api/whatsapp/conversations
```

Enviar mensagem manual pela outbox:

```bash
curl -X POST http://localhost:3011/api/whatsapp/conversations/<ID>/send \
  -H 'Content-Type: application/json' \
  -d '{"text":"Mensagem manual da equipe ALETIS"}'
```

## Testes automatizados

```bash
pnpm --filter @aletis/api test -- tests/whatsapp
pnpm --filter @aletis/api typecheck
pnpm --filter @aletis/web build
docker compose -f docker-compose.whatsapp.yml config
```

## Banco

Migrations:

- `0020_whatsapp_evolution.sql`: base de conversas, mensagens, documentos, webhook e agenda.
- `0021_whatsapp_ia_api_hardening.sql`: instancias, contatos, estado, media, checklist, resultados, requests documentais, booking, outbox e auditoria.

Tabelas principais:

- `whatsapp_instance`
- `whatsapp_contact`
- `whatsapp_conversation`
- `whatsapp_message`
- `whatsapp_media_file`
- `whatsapp_document`
- `whatsapp_document_request`
- `eligibility_checklist`
- `eligibility_question`
- `eligibility_result`
- `whatsapp_calendar_booking_option`
- `whatsapp_calendar_booking`
- `whatsapp_outbox`
- `whatsapp_audit_log`

## O que falta para operar com numero real

1. Subir Evolution API e Manager.
2. Abrir `/whatsapp` no ALETIS.
3. Clicar em `Gerar QR`.
4. Escanear o QR do WhatsApp.
5. Clicar em `Configurar webhook`.
5. Em producao, trocar URLs locais por dominio HTTPS publico.
6. Para agenda real, configurar credenciais Google Calendar e desligar `GOOGLE_CALENDAR_DRY_RUN`.
