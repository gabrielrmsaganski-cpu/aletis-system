# WhatsApp Business + Azure Speech — Módulo ALETIS

Integração profunda entre Meta WhatsApp Cloud API, Azure Speech (STT+TTS) e
o cérebro ALIX para atender clientes da ALETIS por WhatsApp com:

- **Conversa humanizada em PT-BR**, voz feminina neural (Francisca)
- **Áudio-in → áudio-out** (transcreve + sintetiza automaticamente)
- **Captura de lead estruturada** (nome → cidade → credor → valor)
- **Detecção de urgência** (penhora, leilão, execução fiscal)
- **Escalada para humano** por gatilho ou valor alto (≥ R$ 500k)
- **Conhecimento do negócio** via ALIX + @aletis/knowledge-base

## Arquitetura

```
┌───────────────┐       ┌───────────────────┐      ┌────────────────┐
│   WhatsApp    │──────▶│  /webhook (POST)  │─────▶│ WhatsAppService│
│   (user)      │       │   Fastify route   │      │ parseInbound() │
└───────────────┘       └───────────────────┘      └────────┬───────┘
        ▲                                                   │
        │                                                   ▼ (se áudio)
        │                                          ┌────────────────┐
        │                                          │ AzureSpeech    │
        │                                          │ STT → texto    │
        │                                          └────────┬───────┘
        │                                                   │
        │                                                   ▼
        │                                          ┌────────────────┐
        │                                          │ WhatsAppBrain  │
        │                                          │ - state machine│
        │                                          │ - lead capture │
        │                                          │ - escalation   │
        │                                          └────────┬───────┘
        │                                                   │
        │                                                   ▼
        │                                          ┌────────────────┐
        │                                          │ AlixService    │
        │                                          │ (fontes + KB)  │
        │                                          └────────┬───────┘
        │                                                   │
        │                                          texto resposta
        │                                                   │
        │           ┌───────────────────────────────────────┘
        │           ▼
        │   ┌────────────────┐   (se user falou áudio)
        │   │ AzureSpeech    │──────┐
        │   │ TTS → ogg      │      │
        │   └────────────────┘      ▼
        │                    ┌────────────────┐
        └────────────────────│ sendAudio() ou │
                             │ sendText()     │
                             └────────────────┘
```

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `AzureSpeechService.ts` | REST client Azure Cognitive Services. STT (audio → texto) e TTS (texto → OGG/Opus). Constrói SSML com pausas naturais e estilo `assistant`. |
| `WhatsAppService.ts` | Wrapper Meta Graph API v21.0. Verificação de webhook, parse de payload inbound, send text/audio/buttons, upload/download de mídia. |
| `WhatsAppBrain.ts` | Máquina de estado conversacional. Persiste sessão por número (JSON). Decide entre capturar lead, delegar pergunta ao ALIX, ou escalar para humano. |
| `../../routes/whatsapp.ts` | Endpoints Fastify: webhook (GET+POST), admin send, status, sessions, test endpoints. |

## Fluxo de lead capture

```
novo
  │ (mensagem inicial)
  ▼
coletando_nome       → "Como posso te chamar?"
  │
  ▼
coletando_cidade     → "De qual cidade e estado?"
  │
  ▼
coletando_credor     → "Com qual banco/credor está a dívida?"
  │
  ▼
coletando_valor      → "Valor aproximado?"
  │
  ├─ valor ≥ R$ 500k ─▶ aguardando_humano (escalado)
  ▼
qualificado          → Aberto para perguntas (delega ALIX)
```

Gatilhos de escalada imediata (sobrepõem o fluxo normal):

- `/penhora|leilão|execução fiscal|despejo|mandado/` → **crítica**
- `/negativação|serasa|protesto|bloqueio/` → **alta**
- `/urgente|pra ontem|preciso já/` → **alta**
- Menção a `falar com humano|consultor|atendente|christian|eduardo` → handoff manual

## Setup rápido

### 1. Azure Speech

```bash
# Portal Azure
1. Create resource → "Speech" (Cognitive Services)
2. Sku: F0 (free, 500k chars/mês) ou S0 (pay-as-you-go)
3. Region: brazilsouth (menor latência para PT-BR)
4. Keys and Endpoint → copiar KEY 1 + Region
```

Coloque em `.env`:

```
AZURE_SPEECH_KEY=<sua-key>
AZURE_SPEECH_REGION=brazilsouth
AZURE_SPEECH_VOICE=pt-BR-FranciscaNeural
```

### 2. WhatsApp Business (Meta)

```bash
# https://developers.facebook.com/
1. My Apps → Create App → tipo "Business"
2. Add Product → WhatsApp → Set up
3. API Setup:
   - Anote o "Phone number ID" (não o número, é um ID)
   - Gere Temporary access token (válido 24h para testes)
   - Para produção: System User com Permanent Token
4. Configuration → Webhook:
   - Callback URL: https://SEU_DOMINIO/api/whatsapp/webhook
   - Verify Token: escolha qualquer string
   - Subscribe: messages, message_status
```

Coloque em `.env`:

```
WHATSAPP_TOKEN=<temp-or-permanent-token>
WHATSAPP_PHONE_NUMBER_ID=<id-numerico>
WHATSAPP_VERIFY_TOKEN=<mesma-string-do-webhook-setup>
```

### 3. Testar local com ngrok/tunnel

```bash
# terminal 1: API
pnpm --filter ./apps/api dev

# terminal 2: tunnel (HTTPS publico pro Meta)
ngrok http 3001
# → https://abc123.ngrok.io/api/whatsapp/webhook
```

### 4. Verificar que está tudo conectado

```bash
# Config atual (não expõe secrets)
curl http://localhost:3001/api/whatsapp/status | jq

# Simular uma conversa sem Meta (dev)
curl -X POST http://localhost:3001/api/whatsapp/test-brain \
  -H 'Content-Type: application/json' \
  -d '{"waId":"5545999887766","texto":"oi","nomeContato":"Teste"}'
```

## Endpoints

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/whatsapp/webhook` | Handshake Meta (retorna hub.challenge) |
| POST | `/api/whatsapp/webhook` | Recebe mensagens e status do Meta |
| GET | `/api/whatsapp/status` | Config summary (sem secrets) + vozes disponíveis |
| GET | `/api/whatsapp/sessions` | Lista todas as sessões persistidas |
| GET | `/api/whatsapp/session/:waId` | Sessão completa (todas mensagens) |
| DELETE | `/api/whatsapp/session/:waId` | Reseta uma sessão |
| POST | `/api/whatsapp/send-text` | Envia texto arbitrário `{to, text, previewUrl?}` |
| POST | `/api/whatsapp/send-audio-tts` | Sintetiza TTS e envia como voice note `{to, text, voice?, style?}` |
| POST | `/api/whatsapp/test-tts` | Retorna bytes de áudio (teste rápido de voz) |
| POST | `/api/whatsapp/test-brain` | Conversa com o brain sem passar pelo Meta |

## Persistência

- Sessões WhatsApp: `apps/api/storage/whatsapp-sessions/{numero}.json`
- Sessões ALIX paralelas: `apps/api/storage/whatsapp-alix-sessions/*.json`

Cada sessão é keyed pelo `wa_id` (número do telefone). Uma reinicialização
da API preserva todo o histórico e contexto do lead.

## Voz e SSML

O `buildSSML()` remove artefatos de Markdown (**, *, `, __, bullets) antes
de sintetizar — TTS lê literal. Também insere `<break time="350ms"/>` entre
sentenças para cadência natural.

Estilos disponíveis (via `style` no TTS): `assistant` (padrão), `chat`,
`calm`, `empathetic`, `cheerful`, `friendly`.

## Respostas adaptadas

- **Audio-in → audio-out**: se o usuário mandou voz, a resposta sai como
  voice note OGG. Se texto, texto.
- **Sem markdown**: o brain formata respostas em texto puro (TTS não
  fica falando "asterisco asterisco").
- **Chunking**: mensagens acima de 3800 chars são quebradas automaticamente
  em múltiplos envios para respeitar o limite de 4096 do Meta.

## Próximos passos

- [ ] Template messages pré-aprovadas para reabrir conversa > 24h
- [ ] Webhook signature verification (x-hub-signature-256)
- [ ] Métricas de escalada (Slack/e-mail para o consultor)
- [ ] CRM: auto-criar lead no banco de clientes ao qualificar
