# ALETIS Core IA — arquitetura incremental

Este documento descreve a fundação criada para evoluir o ALETIS como sistema principal de CRM, documentos, IA contextual e automações. O n8n entra apenas como camada opcional de orquestração externa; ele não substitui o core do ALETIS.

## Visão Geral

Fluxo alvo:

```text
ALETIS CRM
  -> Central Inteligente de Documentos
  -> IA contextual por cliente
  -> Eventos de automação
  -> n8n opcional para workflows externos
```

O sistema continua usando as bases existentes:

- `cliente` como cadastro principal e payload de compatibilidade.
- `portal_upload` como cofre/documentos legados.
- `alix_session`, `alix_message`, `alix_memory_fact`, `alix_document_chunk` e `alix_document_embedding` para memória, chat e RAG local.
- `whatsapp_*` para Central WhatsApp IA.

A nova fundação adiciona tabelas normalizadas sem remover o legado.

## Novas Entidades

CRM core:

- `client_contact`: contatos, sócios, contador, banco, familiar e contatos operacionais.
- `client_task`: tarefas, pendências, responsáveis, prioridade e vencimento.
- `client_meeting`: reuniões, agenda e vínculo futuro com Google Calendar.
- `client_contract`: contratos financeiros ou operacionais vinculados ao cliente.
- `client_timeline_event`: linha do tempo normalizada.
- `client_permission`: permissão explícita por usuário e cliente.

Documentos:

- `document_category`: categorias padronizadas.
- `core_document`: documento unificado por cliente.
- `document_version`: histórico de versões.

IA e automação:

- `ai_workflow`: catálogo de workflows internos ou externos.
- `ai_workflow_run`: execução e log de workflow.
- `automation_event`: eventos internos para fila própria e integração opcional com n8n.

## Rotas Principais

CRM core:

- `GET /api/clientes/:id/core`
- `POST /api/clients/:id/contacts`
- `POST /api/clients/:id/tasks`
- `PATCH /api/clients/:id/tasks/:taskId`
- `POST /api/clients/:id/meetings`
- `POST /api/clients/:id/contracts`
- `POST /api/clients/:id/timeline`

Documentos:

- `POST /api/documents/upload`
- `GET /api/clientes/:id/documents`
- `GET /api/documents/:id/download`
- `POST /api/documents/:id/extract`
- `POST /api/documents/:id/index`
- `GET /api/clientes/:id/knowledge-summary`

IA por cliente:

- `POST /api/clientes/:id/ask`

Automações:

- `GET /api/automation/events`
- `POST /api/webhooks/n8n/:eventType`
- `GET /api/integrations/ai-core/status`

## Serviços

- `AccessControlService`: base de RBAC por papel, responsável e permissão explícita.
- `ClientCoreService`: contatos, tarefas, reuniões, contratos e timeline.
- `CoreDocumentService`: upload, extração, listagem, download e indexação local ALETIS.
- `ClientIntelligenceService`: pergunta contextual por cliente com fatos, inferências, sugestões e fontes.
- `AutomationEventService`: registro e despacho seguro de eventos.
- `N8nAutomationService`: adapter futuro para webhooks de automação.
- `google-workspace/*`: OAuth2, token store criptografado, Drive, Docs, Calendar, Gmail e auditoria.

## Permissões

A variável `ALETIS_RBAC_STRICT` controla o modo de segurança:

- `false`: modo compatível com o sistema atual. Permite consultores enquanto o login real não está implantado.
- `true`: exige papel/permissão explícita, responsável pelo cliente ou Admin Master.

Regra planejada:

- Admin Master: acesso global.
- Gestor: equipe/clientes vinculados.
- Consultor: clientes atribuídos ou permissões explícitas.
- Operacional: tarefas e documentos permitidos.
- Cliente externo: apenas próprio cadastro e documentos liberados.

## Documentos e RAG

O upload novo grava em `core_document` e tenta extrair texto via pipeline ALIX já existente. A indexação em `/api/documents/:id/index` usa o RAG local do ALETIS:

- `alix_document_chunk`
- `alix_document_embedding`
- Full Text Search em português
- pgvector quando o banco estiver com a extensão habilitada

Campos relevantes:

- `texto_extraido`
- `embedding_status`
- `rag_status`
- `rag_provider`
- `validade`
- `categoria`
- `status`
- `metadata`

## n8n

Eventos passam por `automation_event`. Mesmo sem n8n, o ALETIS registra a fila interna, status, tentativas e erro. Se `N8N_AUTOMATION_ENABLED=true`, o sistema também despacha eventos para `N8N_WEBHOOK_BASE_URL`.

Eventos iniciais:

- `client_contact_created`
- `client_task_created`
- `client_task_updated`
- `client_meeting_created`
- `client_contract_created`
- `document_uploaded`
- `document_indexed`

Também há endpoint de entrada:

- `POST /api/webhooks/n8n/:eventType`

Use `N8N_INBOUND_SECRET` para proteger callbacks.

## Google Workspace

O ALETIS possui uma camada própria para Google Workspace em `/api/integrations/google/*`. Ela permite conectar uma conta Google por OAuth2, criptografar tokens no backend e vincular recursos ao CRM.

Recursos preparados:

- criação de pasta Google Drive por cliente;
- subpastas padrão para documentos, propostas, contratos, relatórios, anexos e comprovantes;
- upload de arquivos para a pasta correta;
- geração de Google Docs a partir dos dados do cliente;
- criação e cancelamento de eventos no Google Calendar;
- envio explícito de Gmail com registro no histórico;
- auditoria em `google_workspace_audit_log`.

Documento operacional detalhado: `docs/google-workspace.md`.

## Frontend

A área `Arquivos e Processo` do cliente ganhou a aba `Central inteligente`.

Ela mostra:

- indicadores operacionais do cliente;
- upload de documentos;
- status de indexação;
- download;
- criação rápida de tarefas;
- pergunta contextual para IA do cliente;
- fontes documentais usadas na resposta.

## Variáveis De Ambiente

```env
ALETIS_RBAC_STRICT=false
ALETIS_CORE_DOCUMENT_DIR=./storage/core-documents
ALETIS_DOCUMENT_AUTO_INDEX=false
ALIX_CLIENT_INTELLIGENCE_MODEL=gpt-5.6-terra

N8N_AUTOMATION_ENABLED=false
N8N_WEBHOOK_BASE_URL=
N8N_WEBHOOK_SECRET=
N8N_INBOUND_SECRET=
```

## Validação

Comandos recomendados:

```bash
pnpm --filter @aletis/api typecheck
pnpm --filter @aletis/web typecheck
pnpm --filter @aletis/api test -- tests/api/aletis-core.test.ts tests/lib/core-document-service.test.ts
pnpm --filter @aletis/web build
pnpm --filter @aletis/api build
```

## Próximos Passos

1. Ativar login interno real e preencher `client_permission`.
2. Migrar gradualmente `portal_upload` para `core_document`.
3. Criar tela global `Documentos` usando a nova API.
4. Criar painel global `Automações`.
5. Habilitar n8n quando a URL final dos workflows existir.
6. Adicionar versionamento visual de documento e validade com alertas.
