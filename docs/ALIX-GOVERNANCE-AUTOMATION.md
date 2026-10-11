# ALIX — Governança e automação supervisionada

Este documento descreve a operação das etapas 7 e 8 da evolução da ALIX: promoção de versões baseada em avaliações, medição humana da extração, sugestões proativas, atualização interna de dossiês e confirmação reforçada para ações de alto impacto.

## Princípios operacionais

1. Uma alteração de prompt, modelo, política ou workflow nasce como `draft`.
2. A versão candidata só pode avançar depois de uma avaliação persistida.
3. O gate padrão exige pelo menos 100 casos, 95% de aprovação, 98% de respostas com evidência e zero falhas críticas.
4. Mesmo passando no gate, a promoção requer revisão humana de um perfil de governança.
5. Sugestões proativas nunca executam escritas externas automaticamente.
6. Ações de escrita passam pelo contrato de confirmação; ferramentas de alto impacto exigem duas confirmações explícitas e um desafio de uso único.
7. Cada aprovação, rejeição, execução ou falha gera um recibo permanente no PostgreSQL.
8. Atualizações automáticas de dossiê são internas, versionadas e usam apenas fontes do notebook e fatos do Livro de Fatos. Fatos contestados ou pendentes não são promovidos a fatos confirmados.

## Fluxo de promoção

```text
draft -> evaluated -> approved -> active
            |             |
            +-> rejected  +-> revisão humana obrigatória

Uma nova versão active move a versão active anterior para rolled_back.
```

O gate compara as métricas registradas com os thresholds da release. A API bloqueia aprovação quando a avaliação não passou e bloqueia ativação quando não há aprovação humana.

### Endpoints

- `GET /api/alix/governance/dashboard`: métricas e salvaguardas.
- `GET|POST /api/alix/governance/releases`: consulta ou cria releases candidatas.
- `POST /api/alix/governance/releases/:id/evaluations`: registra avaliação, evidências, latência p95 e custo decimal em USD.
- `POST /api/alix/governance/releases/:id/review`: aprova ou rejeita a candidata.
- `POST /api/alix/governance/releases/:id/activate`: ativa somente uma release aprovada.

Com `ALIX_AUTH_STRICT=true`, aprovação e ativação exigem um perfil `admin`, `diretor`, `governance` ou `governanca`.

## Avaliações

Comandos principais:

```bash
pnpm --filter @aletis/api eval:alix:governance
pnpm eval:alix
```

`eval:alix:governance` valida 100 casos determinísticos, presença de evidência e classificação de risco. `pnpm eval:alix` também executa confiabilidade, conjunto dourado e Promptfoo.

As métricas persistidas por release são:

- quantidade total, aprovada e reprovada;
- taxa de aprovação e de evidência;
- falhas críticas;
- precisão de extração, quando disponível;
- latência p95;
- custo em USD armazenado como decimal textual, sem ponto flutuante de domínio.

## Precisão da extração documental

No painel da esteira documental, cada campo mostra valor, confiança, evidência literal e localização. O revisor marca o campo como `confirmed`, `contested` ou `rejected`.

Endpoint: `PATCH /api/alix/document-pipeline/fields/:id`.

A precisão exibida na governança é:

```text
confirmed / (confirmed + contested + rejected)
```

Cada revisão preserva ator, instante e observação nos metadados do campo e no `audit_log`. A confirmação de um campo também resolve o achado de baixa confiança correspondente; divergências e rejeições continuam visíveis para tratamento.

## Sugestões proativas

A varredura combina:

- campos obrigatórios ausentes;
- documentos duplicados;
- divergências entre documentos;
- documentos e campos vencidos ou vencendo em até 30 dias;
- fatos contestados no Livro de Fatos;
- insights já produzidos pelo serviço proativo.

As sugestões são deduplicadas por fingerprint e permanecem na fila de governança. Uma sugestão apenas informativa pode ser reconhecida sem mutação. Quando existe uma ação proposta, `prepare` cria uma confirmação e não executa a ferramenta.

Endpoints:

- `GET /api/alix/governance/suggestions`;
- `POST /api/alix/governance/suggestions/scan`;
- `POST /api/alix/governance/suggestions/:id/prepare`;
- `POST /api/alix/governance/suggestions/:id/dismiss`.

## Confirmação dupla

Ferramentas de alto impacto incluem criação/promoção de cliente, onboarding, atualização integral do cliente ou dossiê, envio de mensagens, e-mail ou WhatsApp, agendamento e geração de proposta de renegociação. Exclusões e operações financeiras são classificadas como críticas.

Primeira aprovação:

1. registra o primeiro recibo;
2. retorna HTTP `202` com `status=awaiting_second_approval`;
3. cria um `challenge` criptograficamente aleatório e temporário.

Segunda aprovação:

1. envia o `challenge` recebido;
2. consome a confirmação para impedir replay;
3. executa a ferramenta;
4. registra aprovação final e resultado permanente.

Confirmações textuais no chat não executam ações de alto impacto; o usuário precisa usar o painel explícito de confirmações. Lotes contendo ao menos uma ação de alto impacto também exigem confirmação dupla.

## Atualização automática de dossiês

Fatos novos ou novas versões confirmadas enfileiram `alix-dossier-refresh-v1`. A fila usa singleton de cinco minutos por cliente e, por padrão, concorrência 1 (`ALIX_DOSSIER_REFRESH_CONCURRENCY=1`).

O worker:

1. localiza notebooks do cliente;
2. escolhe a versão mais recente de cada linhagem de dossiê;
3. atualiza apenas quando as fontes/fatos mudaram;
4. cria uma nova versão do artefato, preservando as anteriores;
5. registra sucesso ou falha na governança e retorna separadamente a quantidade de dossiês sem mudança.

O Livro de Fatos faz parte das fontes internas do notebook com status, confiança, versão e evidências. Pesquisa web é desabilitada nesse fluxo automático.

## Persistência

A migração `0032_alix_governance_automation.sql` cria:

- `alix_governance_release`;
- `alix_governance_eval_run`;
- `alix_automation_suggestion`;
- `alix_confirmation_approval`.

A migração `0033_alix_governance_baseline_eval.sql` registra a avaliação que originou a baseline ativa no histórico consultado pelo painel.

Para aplicar:

```bash
pnpm --filter @aletis/api db:migrate
```

## Operação no produto

Na página da ALIX, abra **Governança** para consultar gates, golden set, precisão, recibos e sugestões. Use **Varrer** para atualizar os achados determinísticos. Ações preparadas aparecem na área de confirmações da ALIX. Na esteira documental, expanda uma execução para revisar os campos e suas evidências.

Antes de promover uma versão, confirme que:

- o conjunto de avaliação é representativo e está versionado;
- o gate passou sem falha crítica;
- latência e custo estão dentro do orçamento operacional;
- campos extraídos possuem amostra humana revisada;
- o responsável leu as evidências e aprovou a release;
- existe uma versão ativa anterior para rollback, quando aplicável.
