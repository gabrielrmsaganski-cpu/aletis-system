# ALIX — Notebook vivo e aprendizado contínuo

## Parte 5: Notebook vivo

O Notebook ALIX reúne, sob seleção explícita, cinco famílias de fontes:

- CRM, dossiê, financeiro e propriedades;
- documentos indexados;
- propostas;
- negociações do Deal Room;
- pesquisa web pública.

Antes da geração, `GET /api/alix/notebooks/:id/source-map` apresenta as fontes selecionadas, a completude estrutural do caso e lacunas de identificação, dívida, garantias, patrimônio, produção, capacidade financeira e estratégia. O escopo é alterado por `PATCH /source-scope` e fica persistido no notebook.

Cada documento possui `lineageId` e versões imutáveis. Ao usar “Atualizar documento”, a ALIX:

1. recupera novamente o corpus autorizado;
2. compara o hash de cada fonte com o retrato da versão-base;
3. identifica fontes adicionadas, alteradas e removidas;
4. reúne comentários editoriais ainda abertos;
5. preserva seções não afetadas e revisa somente as seções impactadas;
6. registra seções alteradas/preservadas, fontes e comentários aplicados.

Comentários do consultor são instruções editoriais. Eles nunca são promovidos automaticamente a fatos ou citações. Respostas e documentos podem ser convertidos em tarefa, nota, proposta ou checklist. As entregas podem ser abertas em HTML ou baixadas em PDF e DOCX no padrão visual ALETIS.

Principais rotas:

- `GET /api/alix/notebooks/:id/source-map`
- `PATCH /api/alix/notebooks/:id/source-scope`
- `POST /api/alix/notebooks/:id/comments`
- `POST /api/alix/notebooks/:id/artifacts/:artifactId/update`
- `GET /api/alix/notebooks/:id/artifacts/:artifactId/versions`
- `GET /api/alix/notebooks/:id/artifacts/compare?from=...&to=...`
- `POST /api/alix/notebooks/:id/artifacts/:artifactId/convert`
- `GET /api/alix/notebooks/:id/artifacts/:artifactId/export/pdf`
- `GET /api/alix/notebooks/:id/artifacts/:artifactId/export/docx`

## Parte 6: aprendizado contínuo

Toda resposta relevante da ALIX expõe quatro avaliações:

- útil;
- incompleta;
- incorreta;
- tom inadequado.

Para uma resposta incorreta, o motivo é obrigatório: fonte errada, dado ausente, cálculo, interpretação, escrita ou ação indevida. O registro pode conter observação e correção esperada, além de cliente, missão, notebook, artefato, agente e ferramentas envolvidas.

Feedback negativo cria um caso na fila `alix_quality_case`. A severidade é determinística:

- crítica: cálculo ou ação indevida;
- alta: fonte errada, dado ausente, interpretação ou resposta incorreta;
- média: incompleta, escrita ou tom inadequado.

Rotina semanal recomendada:

1. consultar `GET /api/alix/feedback/weekly`;
2. abrir `GET /api/alix/feedback/quality-queue?status=open`;
3. agrupar recorrências pelo `fingerprint`;
4. classificar a causa como prompt, ferramenta, extração ou base;
5. corrigir e executar `pnpm eval:alix`;
6. registrar resolução e marcar o caso como `fixed`.

Não há fine-tuning nesta fase. Primeiro são acumulados exemplos reais, revisão humana e métricas confiáveis.

## Conjunto dourado e CI

O arquivo `apps/api/evals/alix/golden/alix-golden-100.jsonl` contém 100 casos reais da esteira documental, sem IDs, nomes, valores, trechos ou evidências brutas. Cada fonte recebe HMAC-SHA-256 e apenas estrutura, chaves de campos, decisão esperada e referências anônimas são preservadas.

Estado inicial do conjunto:

- `baseline`: casos prontos para registro, mas ainda não confirmados por humano;
- `candidate`: casos que exigem revisão;
- `approved`: somente após confirmação humana explícita.

Comandos:

```bash
pnpm --filter @aletis/api build:alix:golden
pnpm --filter @aletis/api build:alix:golden:persist
pnpm --filter @aletis/api eval:alix:golden
pnpm eval:alix
```

O CI executa 103 verificações determinísticas: três guardrails existentes e os 100 casos reais anonimizados. Uma regressão interrompe o build.

