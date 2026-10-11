-- CPF/CNPJ passa a ser dado informativo no CRM, não chave impeditiva de cadastro.
-- Mantemos índice para busca rápida, mas removemos a unicidade para permitir:
--   - cliente sem documento ainda validado;
--   - cadastros provisórios criados por IA/documentos;
--   - grupo familiar ou pessoas relacionadas com o mesmo documento em revisão.

DROP INDEX IF EXISTS cliente_cpf_cnpj_norm_uidx;

CREATE INDEX IF NOT EXISTS cliente_cpf_cnpj_norm_idx
  ON cliente ((regexp_replace(cpf_cnpj, '\D', '', 'g')))
  WHERE length(regexp_replace(cpf_cnpj, '\D', '', 'g')) in (11, 14);
