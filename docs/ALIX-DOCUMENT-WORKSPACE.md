# ALIX — Esteira documental e workspace por missões

Este documento descreve as etapas 3 e 4 da evolução da ALIX:

1. uma esteira documental especializada, rastreável e com revisão humana;
2. um workspace que transforma solicitações em missões operacionais.

As estruturas são persistidas no PostgreSQL pela migração
`0030_alix_document_workspace.sql`. A fila `alix-document-pipeline-v1` usa o
mesmo pg-boss da base de conhecimento.

## Esteira documental

O fluxo é sempre executado nesta ordem:

```text
receber → validar → extrair → classificar → cruzar → revisar → cadastrar
```

O cadastro não é automático: ele exige confirmação humana explícita e a
identificação da entidade de destino. Achados abertos ou erros de validação
bloqueiam essa transição.

### Tipos especializados

- contrato;
- CPR;
- CCB;
- matrícula de imóvel;
- CAR;
- CCIR;
- ITR;
- extrato bancário;
- balanço patrimonial;
- DRE;
- proposta.

Cada tipo possui um perfil de campos esperados e obrigatórios. A classificação
combina sinais determinísticos com saída estruturada do modelo. Cada campo
extraído armazena valor textual, valor normalizado, confiança, trecho literal de
evidência, página/aba quando disponível e validade. Valores monetários não são
convertidos para `number` na API.

### Controles automáticos

- hash SHA-256 para documentos duplicados;
- comparação de versões do mesmo documento;
- divergências entre documentos do mesmo cliente;
- campos obrigatórios ausentes;
- campos com baixa confiança ou sem evidência literal;
- vencimentos próximos e documentos expirados;
- achados de validação e revisão com resolução auditável.

Os principais estados são `queued`, `running`, `needs_review`,
`awaiting_registration`, `registered` e `failed`.

### API documental

- `GET /api/alix/document-pipeline/profiles`: tipos, etapas e salvaguardas.
- `GET /api/alix/document-pipeline/stats`: estado atual e achados da última
  execução de cada documento, além dos totais históricos de tentativas.
- `GET /api/alix/document-pipeline`: lista a última execução por documento,
  com filtros.
- `POST /api/alix/document-pipeline`: enfileira um documento.
- `GET /api/alix/document-pipeline/document/:documentId`: última execução.
- `GET /api/alix/document-pipeline/:id`: campos, achados e comparações.
- `POST /api/alix/document-pipeline/:id/rerun`: força nova versão da análise.
- `PATCH /api/alix/document-pipeline/findings/:id`: resolve ou descarta achado.
- `POST /api/alix/document-pipeline/:id/register`: cadastra após HITL.
- `POST /api/alix/document-pipeline/jobs/:id/cancel`: cancela job pendente.

## Workspace por missões

Toda solicitação substancial feita no chat vira uma missão persistente. O
orquestrador registra progresso, etapas, fontes consultadas, modelo, tokens,
custo e resultado. Confirmações textuais simples não geram uma missão nova.

### Modos de trabalho

- análise de cliente (`client_analysis`);
- documental (`documentary`);
- negociação (`negotiation`);
- pesquisa (`research`);
- geração de documento (`document_generation`);
- due diligence (`due_diligence`).

Cada modo possui cinco etapas próprias, exibidas no Centro de Tarefas. A missão
pode ser cancelada durante a execução e retomada depois, preservando contexto e
fontes.

### Contrato de resposta

As entregas da ALIX são organizadas em cinco blocos:

1. conclusão;
2. fatos;
3. riscos;
4. lacunas;
5. próxima ação.

O texto integral também é preservado, e a versão estruturada é gravada na
missão para consumo da interface e de automações futuras.

### API de missões

- `GET /api/alix/missions/modes`: catálogo e contrato de resposta.
- `GET /api/alix/missions/stats`: indicadores operacionais.
- `GET /api/alix/missions`: lista missões com filtros.
- `POST /api/alix/missions`: cria uma missão explícita.
- `GET /api/alix/missions/:id`: detalhe, etapas e fontes.
- `POST /api/alix/missions/:id/cancel`: cancela a missão.
- `POST /api/alix/missions/:id/resume`: retoma a missão.

Os endpoints existentes de chat e streaming aceitam `workMode` e `missionId`.
No streaming, o evento SSE `mission` informa a missão ativa antes das etapas de
execução; o evento `done` também inclui o resumo final.

## Interface

A tela da ALIX inclui:

- seletor dos seis modos de trabalho;
- Centro de Tarefas com progresso, etapas, fontes, custo e controles;
- painel da esteira documental com estados e achados;
- adaptações responsivas para desktop e dispositivos móveis.

## Operação e verificação

Aplicar a migração e reprocessar o acervo:

```bash
pnpm --filter @aletis/api db:migrate
pnpm --filter @aletis/api knowledge:backfill -- --include-session-documents --timeout-minutes=90
```

Variável da nova fila:

```bash
ALIX_DOCUMENT_PIPELINE_CONCURRENCY=1
```

Critérios de saúde:

- zero jobs `failed` na fila documental;
- `completedDocuments` igual à quantidade de documentos elegíveis;
- campos com evidência e confiança disponíveis no detalhe;
- achados abertos visíveis para revisão;
- cadastro recusado sem `reviewConfirmed: true`;
- missões exibindo passos, fontes, custo e resultado estruturado;
- cancelamento e retomada preservando o histórico de eventos.
- jobs interrompidos retomados pelo mesmo `jobId`, com a tentativa anterior
  marcada no histórico antes da nova versão.
