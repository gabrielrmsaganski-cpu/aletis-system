# ALIX — Base de conhecimento e trabalhos duráveis

Este documento descreve a implementação das etapas 1 e 2 da evolução da IA:

1. RAG persistente com citações e Livro de Fatos versionado.
2. Fila PostgreSQL durável para indexação, extração e análises demoradas.

## Arquitetura

```text
Upload / documento CRM / conversa
              |
              v
      pg-boss (PostgreSQL)
       |       |       |
       |       |       +--> análise profunda assíncrona
       |       +----------> extração de fatos
       +------------------> chunks + embeddings
                                  |
                                  v
                     pgvector + busca textual
                                  |
                                  v
                     ferramenta da ALIX com citações
```

O PostgreSQL é a fonte de verdade. Arquivos e metadados existentes continuam
compatíveis; a nova camada é incremental e idempotente.

## RAG persistente

### Fontes

- `alix_document`: documentos recebidos no chat e no portal.
- `core_document`: documentos do cofre/CRM central.

Cada documento é transformado em chunks que preservam, quando disponíveis:

- nome do arquivo;
- página inicial e final;
- aba da planilha;
- sessão e cliente;
- tipo/origem do documento;
- hash do conteúdo.

Os embeddings usam por padrão `text-embedding-3-small` com 1.536 dimensões.
Modelo e dimensões são configuráveis. Uma mudança de conteúdo ou modelo invalida
o cache e provoca nova indexação.

### Estado e idempotência

`alix_rag_index_state` guarda um registro por fonte/documento:

- `pending`;
- `processing`;
- `indexed`;
- `skipped` quando o hash já está atualizado;
- `failed`, com erro e quantidade de tentativas.

Chunks e embeddings de um documento são substituídos na mesma transação. Assim,
uma reindexação não mistura versões do texto.

### Uso pela ALIX

A ferramenta `buscar_conhecimento_cliente` pesquisa somente o cliente ativo e
combina busca textual com similaridade semântica. O retorno inclui trecho,
arquivo, página/aba, similaridade e URL do documento.

A busca lexical da sessão (`buscar_no_indice_documental`) permanece disponível
para anexos da conversa atual.

## Livro de Fatos

### Modelo

`alix_memory_fact` mantém o estado atual de cada chave canônica. Toda criação,
corroboração, mudança, conflito ou revisão humana gera uma linha imutável em
`alix_fact_revision`.

Estados aceitos:

- `confirmed`: confirmado por CRM, consultor ou evidência explícita forte;
- `inferred`: inferência que deve ser tratada com cautela;
- `pending_review`: extraído e aguardando conferência;
- `contested`: há conflito entre fontes/valores;
- `expired`: não deve mais ser usado como fato vigente.

Cada fato pode carregar múltiplas evidências: documento, página, aba, campo,
trecho, sessão, data observada e URL.

### Política de conflito

Um valor confirmado por CRM ou por revisão humana não é sobrescrito por uma
extração documental menos confiável. O fato fica `contested`, o valor confirmado
é preservado e o valor divergente é registrado no histórico de revisões.

### Fontes automáticas

- campos estruturados do CRM: `confirmed`;
- entidades e análises estruturadas de documentos: normalmente
  `pending_review`;
- declarações explícitas do consultor no chat: extraídas por job após a resposta;
- edição/revisão pela API: `confirmed`, `contested` ou `expired`.

O prompt da ALIX recebe o Livro de Fatos do cliente ativo. Itens pendentes ou
contestados são marcados para que o modelo não os apresente como certeza.

## Fila durável

A fila usa `pg-boss` no schema PostgreSQL `pgboss`. O processamento sobrevive a
reinício do processo e usa retry exponencial, expiração, retenção e dead-letter.

Filas:

| Fila | Função | Concorrência padrão |
|---|---|---:|
| `alix-rag-index-v1` | chunks e embeddings | 1 por processo |
| `alix-fact-extract-v1` | fatos de CRM, documento e conversa | 2 por processo |
| `alix-document-deep-analysis-v1` | análise longa | 1 por processo |
| `alix-document-pipeline-v1` | esteira documental especializada | 1 por processo |
| `alix-knowledge-backfill-v1` | orquestra o lote histórico | exclusiva |
| `alix-ai-dead-letter-v1` | trabalhos esgotados | sem worker |

Uploads novos enfileiram RAG e fatos automaticamente. A análise profunda pode
responder `202` e o frontend acompanha o job até conclusão. Se a fila estiver
indisponível, a rota mantém fallback síncrono compatível.

## APIs operacionais

- `GET /api/alix/knowledge/status`: cobertura de RAG, fatos e filas.
- `POST /api/alix/knowledge/backfill`: inicia backfill idempotente.
- `GET /api/alix/jobs/:queue/:id`: estado e resultado de um job.
- `GET /api/alix/knowledge/facts/:clienteId`: fatos atuais.
- `POST /api/alix/knowledge/facts/:clienteId`: cria/confirma fato manual.
- `PATCH /api/alix/knowledge/facts/:id/review`: revisão humana.
- `GET /api/alix/knowledge/facts/:id/revisions`: trilha histórica.

## Operação

Aplicar migrações:

```bash
pnpm --filter @aletis/api db:migrate
```

Iniciar ou retomar o backfill de documentos vinculados a clientes:

```bash
pnpm --filter @aletis/api knowledge:backfill -- --timeout-minutes=90
```

Somente acompanhar um lote já criado:

```bash
pnpm --filter @aletis/api knowledge:backfill -- --monitor-only --timeout-minutes=90
```

Incluir também documentos sem cliente, restritos à sessão:

```bash
pnpm --filter @aletis/api knowledge:backfill -- --include-session-documents
```

Variáveis principais:

- `ALETIS_AI_QUEUE_ENABLED`;
- `ALETIS_AI_QUEUE_SCHEMA`;
- `ALETIS_AI_QUEUE_POOL_MAX`;
- `ALIX_RAG_WORKER_CONCURRENCY`;
- `ALIX_FACT_WORKER_CONCURRENCY`;
- `ALIX_DEEP_ANALYSIS_CONCURRENCY`;
- `ALIX_DOCUMENT_PIPELINE_CONCURRENCY`;
- `OPENAI_EMBEDDING_MODEL`;
- `OPENAI_EMBEDDING_DIMENSIONS`;
- `ALIX_EMBEDDING_BATCH_SIZE`.

## Critérios de saúde

A etapa está operacional quando:

- fila em estado `ready`;
- zero jobs `failed` e zero documentos `failed`;
- documentos elegíveis cobertos por `indexed`/`skipped`;
- quantidade de chunks igual à de embeddings;
- pesquisa semântica retorna citação do documento esperado;
- revisões do Livro de Fatos são maiores ou iguais ao total de fatos atuais.
