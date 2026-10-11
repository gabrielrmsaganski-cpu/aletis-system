CREATE UNIQUE INDEX IF NOT EXISTS negociacao_credor_proposta_active_uidx
  ON negociacao_credor (proposta_id)
  WHERE proposta_id IS NOT NULL AND status <> 'encerrado';
