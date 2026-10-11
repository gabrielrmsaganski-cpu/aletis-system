UPDATE cliente_demanda
SET categoria = CASE
  WHEN origem = 'gestao_financeira' THEN 'credito'
  WHEN lower(assunto || ' ' || titulo) ~ 'renegoci|liquida|acordo|alongamento|reestrutura' THEN 'renegociacao'
  WHEN lower(assunto || ' ' || titulo) ~ 'jurid|judicial|processo|execu' THEN 'juridico'
  WHEN lower(assunto || ' ' || titulo) ~ 'tribut|fiscal|pgfn|imposto' THEN 'tributario'
  WHEN lower(assunto || ' ' || titulo) ~ 'invest|maquin|armazen|expans' THEN 'investimento'
  WHEN lower(assunto || ' ' || titulo) ~ 'credito|crédito|custeio|capital de giro|financ' THEN 'credito'
  ELSE categoria
END
WHERE categoria = 'outro';

UPDATE cliente_demanda
SET probabilidade = CASE status
  WHEN 'nova' THEN 10
  WHEN 'em_analise' THEN 25
  WHEN 'em_proposta' THEN 50
  WHEN 'negociacao' THEN 75
  WHEN 'aprovada' THEN 90
  WHEN 'concluida' THEN 100
  ELSE 0
END
WHERE probabilidade = 0;

UPDATE cliente_demanda
SET eventos = jsonb_build_array(jsonb_build_object(
  'id', 'evt_migracao_' || id,
  'tipo', 'sistema',
  'titulo', 'Demanda incorporada ao histórico operacional',
  'autor', 'CRM ALETIS',
  'criadoEm', to_char(criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
))
WHERE eventos = '[]'::jsonb;
