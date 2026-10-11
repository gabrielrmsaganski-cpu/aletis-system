# ALETIS - Arquitetura de IA (ALIX)

> Referencia operacional da arquitetura OpenAI-only do ALIX.

## Visao Geral

O ALIX usa exclusivamente a API oficial da OpenAI. Chat, analise de negocios,
documentos, memoria, RAG, pesquisa web, transcricao e voz compartilham uma
politica central de modelos e uma unica camada de telemetria.

Principais componentes:

- Responses API com streaming SSE real e chamadas de ferramentas;
- Structured Outputs para classificacao e extracao de documentos;
- memoria curta, resumo de conversas e fatos estruturados de longo prazo;
- RAG com chunks, embeddings e busca textual;
- selecao deterministica de ferramentas por dominio;
- pesquisa web nativa da OpenAI;
- custos, tokens, cache e latencia registrados por workflow.

## Modelos E Funcoes

| Funcao | Modelo padrao | Motivo |
|---|---|---|
| Orquestrador, CRM e inteligencia do cliente | `gpt-5.6-terra` | equilibrio entre raciocinio, velocidade e custo |
| Analise profunda de operacoes e documentos | `gpt-5.6-sol` | maior capacidade para decisoes complexas, conflitos e contratos longos |
| Dossie consolidado de novo cliente | `gpt-5.6-sol` | cruza todos os documentos e recomenda fontes autoritativas |
| Geracao documental e pesquisa web | `gpt-5.6-terra` | qualidade consistente com ferramentas e contexto longo |
| Extracao, classificacao, resumo, memoria e WhatsApp | `gpt-5.6-luna` | alto volume e baixa latencia |
| RAG | `text-embedding-3-small` | busca semantica de custo controlado |
| Audio recebido | `gpt-4o-transcribe` | transcricao com vocabulario orientado ao dominio |
| Audio enviado | `tts-1-hd` | voz de alta qualidade |

A lista permitida e a atribuicao por funcao ficam em
`apps/api/src/services/llm/LLMConfig.ts`. Um valor de ambiente desconhecido e
ignorado em favor do padrao da funcao. Providers e modelos fora dessa politica
sao rejeitados.

## Configuracao

```env
ALIX_LLM_PROVIDER=openai
OPENAI_API_KEY=

ALIX_ORCHESTRATOR_MODEL=gpt-5.6-sol
ALIX_CHAT_MODEL=gpt-5.6-sol
ALIX_DEAL_ANALYZER_MODEL=gpt-5.6-sol
ALIX_ONBOARDING_DOSSIER_MODEL=gpt-5.6-sol
ALIX_CRM_WRITER_MODEL=gpt-5.6-terra
ALIX_CLIENT_INTELLIGENCE_MODEL=gpt-5.6-terra
ALIX_DOC_GENERATOR_MODEL=gpt-5.6-terra
ALIX_WEB_RESEARCHER_MODEL=gpt-5.6-terra
ALIX_DOC_ANALYZER_MODEL=gpt-5.6-sol
ALIX_DOC_EXTRACTOR_MODEL=gpt-5.6-luna
ALIX_DOC_CLASSIFIER_MODEL=gpt-5.6-luna
ALIX_SUMMARIZER_MODEL=gpt-5.6-luna
ALIX_MEMORY_MODEL=gpt-5.6-luna
ALIX_DEFAULT_MODEL=gpt-5.6-sol
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_TTS_MODEL=tts-1-hd
OPENAI_TTS_VOICE=nova
OPENAI_TTS_FORMAT=opus

ALIX_USE_LLM=true
ALIX_STREAMING_ENABLED=true
ALIX_HISTORY_WINDOW=30
ALIX_MAX_TOOLS_PER_REQUEST=24
OPENAI_TIMEOUT_MS=120000
OPENAI_MAX_RETRIES=2
```

O endpoint da API e fixo em `https://api.openai.com/v1`. A chave precisa ser
uma chave valida da plataforma OpenAI; chaves de gateways ou clouds de terceiros
nao sao aceitas.

## Fluxo Do Chat

```text
Frontend
  -> POST /api/alix/chat/stream-v2
  -> OrchestratorService carrega contexto e memoria
  -> ToolSelector escolhe apenas as ferramentas relevantes
  -> OpenAI Responses API executa o stream
  -> tool calls sao executadas e o stream continua pelo previous_response_id
  -> deltas de texto sao enviados imediatamente por SSE
  -> resposta, uso, fontes e auditoria sao persistidos
```

O limite de ferramentas reduz tokens, ambiguidade e latencia sem remover as
capacidades do CRM. Os schemas de ferramentas seguem o modo estrito exigido
pela OpenAI: propriedades declaradas, campos requeridos e sem propriedades
adicionais.

As ferramentas `visao_geral_sistema` e `pesquisar_sistema` permanecem
disponiveis no chat para perguntas transversais. Elas consolidam CRM,
propostas, documentos, prospeccao, agenda e confirmacoes pendentes sem exigir
que o consultor conheca o modulo onde cada informacao esta armazenada.

### Endpoints

| Metodo | Rota | Descricao |
|---|---|---|
| `POST` | `/api/alix/chat` | conversa sincrona |
| `POST` | `/api/alix/chat/stream` | conversa SSE |
| `POST` | `/api/alix/chat/stream-v2` | conversa SSE com orquestrador e ferramentas |
| `GET` | `/api/alix/sessions` | lista sessoes |
| `GET` | `/api/alix/session/:id` | recupera uma sessao |
| `POST` | `/api/alix/session` | cria uma sessao |
| `DELETE` | `/api/alix/session/:id` | remove uma sessao |
| `GET` | `/api/alix/llm/health` | valida a conexao OpenAI |

Os eventos SSE incluem inicio, deltas de texto, execucao de ferramenta,
conclusao, heartbeat e erro. O texto recebido pelo navegador e o mesmo stream
produzido pelo modelo; nao existe fragmentacao artificial posterior.

## Inteligencia Documental

Documentos passam pelo seguinte pipeline:

1. leitura do arquivo e identificacao do formato;
2. classificacao estruturada do tipo documental;
3. extracao em JSON Schema com campos, confianca e evidencia textual/pagina;
4. validacao e normalizacao no backend;
5. associacao ao cliente, proposta ou processo correspondente;
6. chunking e embeddings para recuperacao futura;
7. revisao humana quando a confianca ou evidencia nao forem suficientes.

No cadastro de cliente, todos os lotes usam a mesma sessao de intake. A ALIX
aguarda a extracao especializada, cruza campos entre os arquivos, preserva
evidencias por campo, aponta divergencias e calcula completude/qualidade. Ao
confirmar o cadastro, o arquivo ja processado e vinculado diretamente ao cofre
do cliente, sem novo upload ou nova leitura.

| Metodo | Rota | Descricao |
|---|---|---|
| `POST` | `/api/clientes/intake-document-preview` | ingere um lote na sessao e devolve leitura profunda por arquivo |
| `POST` | `/api/clientes/intake-dossier-preview` | consolida todos os arquivos da sessao em um dossie unico |
| `POST` | `/api/clientes/:id/documentos/intake` | vincula documentos analisados ao cliente sem reprocessar |

Extratores especializados cobrem identidade, extratos bancarios, propostas,
planilhas, contratos e relatorios tecnicos. Imagens e PDFs digitalizados usam
entrada visual do modelo; arquivos extensos usam processamento map/reduce.

Os schemas compartilhados ficam em
`apps/api/src/services/alix/extraction/DocumentStructuredSchemas.ts`.

## Memoria E RAG

- A janela recente mantem o contexto imediato da conversa.
- Conversas extensas recebem resumo estruturado.
- Fatos duraveis sao gravados com tipo, chave, valor, confianca e origem.
- Documentos sao divididos em chunks limitados, inclusive quando nao possuem
  paragrafos ou pontuacao adequada.
- A reindexacao gera os novos embeddings antes de substituir o indice anterior
  e efetiva a troca em transacao.
- A busca combina full-text e contexto documental com separacao por cliente.

## Observabilidade

Cada execucao registra workflow, modelo, latencia, status, tokens de entrada e
saida, leituras/escritas de cache e custo estimado. Prompts e conteudo bruto de
documentos nao sao gravados na telemetria. A pesquisa web e as chamadas de
ferramentas tambem entram no rastro operacional.

## Testes E Validacao

```bash
pnpm --filter @aletis/knowledge-base build
pnpm --filter @aletis/api typecheck
pnpm --filter @aletis/api test
pnpm --filter @aletis/api build
pnpm --filter @aletis/web build

# Integracao real, somente com uma OPENAI_API_KEY valida
RUN_LLM_TESTS=1 pnpm --filter @aletis/api test -- tests/alix/openai-capabilities.test.ts
```

Testes focados cobrem cliente OpenAI, streaming/raciocinio, schemas estritos,
selecao de ferramentas, chunking do RAG, telemetria e bloqueio de providers
externos.

## Pontos De Extensao

- Novas funcoes de IA devem usar `getModelForRole()` e `runOpenAI()`,
  `streamOpenAI()` ou `generateStructured()`.
- Novas ferramentas devem ser registradas no toolkit do orquestrador e possuir
  schema JSON completo; o seletor passa a inclui-las pelo dominio apropriado.
- Novas extracoes documentais devem retornar evidencia e confianca, nao apenas
  valores soltos.
- Nenhum modulo deve instanciar SDK de outro provider ou sobrescrever o endpoint
  oficial.

## Changelog

**2026-07-30**

- dossie profundo de cadastro com evidencias por campo, conflitos e fonte recomendada;
- contratos longos processados integralmente em map/reduce paralelo;
- vinculo direto do intake ao cofre, sem upload e extracao duplicados;
- pesquisa transversal e visao operacional de todo o sistema no chat ALIX;
- analise documental critica promovida para `gpt-5.6-sol` com raciocinio alto.

**2026-07-29**

- arquitetura consolidada exclusivamente na OpenAI Responses API;
- politica Sol/Terra/Luna centralizada por funcao;
- streaming real com continuidade apos tool calls;
- Structured Outputs aplicados ao pipeline documental;
- pesquisa web, embeddings, audio e memoria migrados para OpenAI;
- telemetria e calculo de custos centralizados;
- providers e clientes legados removidos.
