# Recálculo de proposta de acordo

O módulo usa a engine `@aletis/financial-calc` como fonte única de cálculo. A regra `compatibilidade_planilha_v1` inicia a correção no mês subsequente ao vencimento, compõe fatores mensais e aplica mora simples pró-rata (taxa mensal / 30).

## Índices

O registry fica em `packages/financial-calc/src/recalculo-acordo.ts`. INPC e IPCA usam a API estruturada SIDRA/IBGE; SELIC, TR e CDI usam SGS/BCB com janela máxima de dez anos; IGP-M permanece explicitamente indisponível até existir endpoint estruturado público da FGV. O serviço nunca preenche períodos ausentes com zero ou com o mês anterior.

## Sincronização e snapshots

`IndexSyncService` atualiza o cache local e é executado diariamente pelo servidor. O cálculo salvo guarda série, fonte, timestamp e metodologia no campo `snapshot`; alterações posteriores na fonte não modificam documentos já salvos. Em produção, a tabela `monetary_index_value` mantém revisão e checksum para evolução futura do histórico.

## API e PDF

As rotas `/api/recalculos-acordo` calculam, salvam, listam, duplicam e arquivam cálculos. O PDF é renderizado no backend a partir do resultado salvo, sem recalcular no template.
