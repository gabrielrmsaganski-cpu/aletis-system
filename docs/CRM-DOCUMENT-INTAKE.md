# Esteira documental do CRM

## Objetivo

O upload de documentos não aguarda parser, OCR ou OpenAI. A requisição termina
depois que o arquivo original e o registro do documento foram persistidos. O
processamento pesado continua em segundo plano e a interface acompanha seu
estado por polling.

## Fluxo

1. O backend valida tipo e tamanho do arquivo.
2. O arquivo original é persistido e recebe um `alixDocumentId` estável.
3. O documento entra em `queued` e a resposta HTTP é devolvida.
4. A fila local, limitada por concorrência, executa parser, OCR, classificação,
   extração de entidades e extração especializada.
5. O resultado é persistido no mesmo documento e passa para `completed` ou
   `completed_basic`.
6. Cadastro de cliente, cofre documental e propostas consultam o mesmo estado e
   incorporam os campos extraídos sem exigir novo upload.

Estados persistidos: `queued`, `processing`, `extracting`, `completed`,
`completed_basic` e `failed`.

Documentos que estavam em `queued`, `processing` ou `failed` antes de uma
reinicialização são retomados quando a sessão/dossiê volta a ser consultado. O
limite atual é de três tentativas por documento.

## Concorrência e limites

- `ALIX_INTAKE_CONCURRENCY`: quantidade de documentos processados ao mesmo
  tempo; padrão `2`, mínimo `1`, máximo `6`.
- Arquivo individual: até 20 MB.
- Cadastro de novo cliente: a interface divide o conjunto em lotes menores.
- Cofre/entrada inteligente: até três uploads são enviados em paralelo.

O aumento de concorrência deve considerar CPU e memória consumidas por OCR e
também os limites da API OpenAI.

## OpenAI

O cliente existente usa Responses API e Structured Outputs com JSON Schema. O
arquivo pode ser enviado como entrada nativa quando o tipo é compatível; texto,
entidades e evidências locais permanecem como fallback. Falha ou demora da
OpenAI não apaga o arquivo e não impede uma extração determinística útil.

Análises profundas interativas respeitam
`ALIX_DEEP_ANALYSIS_TIMEOUT_MS` (padrão 45 segundos, faixa de 15 a 75 segundos).
Ao atingir esse limite, a resposta usa os fatos determinísticos já persistidos.

## Propostas originadas de arquivo

A proposta é criada imediatamente com status operacional `em_analise`. O worker
aguarda a conclusão do documento e enriquece credor, valores, condições, itens e
resumo. O frontend reconsulta propostas pendentes sem sobrescrever uma edição
manual em andamento.

## Diagnóstico

Ao investigar um documento, verificar nesta ordem:

1. `metadata.processingState` e `metadata.processingError` em `alix_document`;
2. existência de `metadata.rawFile` e do arquivo original no storage;
3. `metadata.processingAttempts`;
4. saúde/configuração da OpenAI;
5. disponibilidade de OCR/Docling;
6. logs do pipeline documental e `ai_workflow_run`, quando PostgreSQL estiver
   habilitado.

Nunca é necessário reenviar um documento apenas porque a IA está lenta. A ação
de reanálise deve ser usada somente depois de um estado `failed` ou quando o
consultor quiser uma nova interpretação.
