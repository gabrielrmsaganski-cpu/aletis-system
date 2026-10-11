# WhatsApp IA ALETIS

O modulo integra Evolution API ou Meta WhatsApp Cloud API ao cerebro ALIX. Toda
inteligencia generativa, transcricao e sintese de voz usa diretamente a
plataforma OpenAI.

## Fluxo

1. O webhook normaliza a mensagem e aplica idempotencia.
2. Midias sao baixadas e armazenadas antes do processamento.
3. Audios sao transcritos com `gpt-4o-transcribe`.
4. O `WhatsAppBrain` recupera o contexto e aciona as ferramentas permitidas.
5. Respostas de voz opcionais usam `tts-1-hd` em OGG/Opus.

## Configuracao de IA

```dotenv
OPENAI_API_KEY=
WHATSAPP_IA_ENABLED=true
WHATSAPP_IA_MODEL=gpt-5.6-luna
WHATSAPP_AUDIO_REPLY_ENABLED=false
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_TTS_MODEL=tts-1-hd
OPENAI_TTS_VOICE=nova
OPENAI_TTS_FORMAT=opus
```

`OPENAI_API_KEY` e a unica credencial de IA. O endpoint da OpenAI e fixado no
cliente central e nao pode ser substituido por variavel de ambiente.

## Componentes principais

| Arquivo | Responsabilidade |
| --- | --- |
| `WhatsAppBrain.ts` | Orquestracao conversacional e contexto da sessao |
| `OpenAIAudioService.ts` | Transcricao e sintese de voz OpenAI |
| `AudioService.ts` | Download, armazenamento e transcricao de audios |
| `ConversationStateService.ts` | Estado, mensagens, midias e idempotencia |
| `evolution/EvolutionClient.ts` | Integracao com a Evolution API |

Testes de integracao que consomem a API devem ser executados explicitamente com
`RUN_LLM_TESTS=1`; a suite normal nao realiza chamadas pagas.
