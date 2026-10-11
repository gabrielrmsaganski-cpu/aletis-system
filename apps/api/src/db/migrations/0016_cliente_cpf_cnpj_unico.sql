-- CRM: unicidade real por CPF/CNPJ normalizado.
-- Mantém cadastros legados mascarados fora da constraint; somente CPF/CNPJ
-- completo, com 11 ou 14 dígitos, entra na unicidade.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT regexp_replace(cpf_cnpj, '\D', '', 'g') AS cpf_cnpj_norm
      FROM cliente
      WHERE length(regexp_replace(cpf_cnpj, '\D', '', 'g')) IN (11, 14)
      GROUP BY 1
      HAVING count(*) > 1
    ) dup
  ) THEN
    RAISE EXCEPTION 'Existem clientes duplicados por CPF/CNPJ normalizado; saneie antes de aplicar cliente_cpf_cnpj_norm_uidx.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cliente_cpf_cnpj_norm_uidx
  ON cliente ((regexp_replace(cpf_cnpj, '\D', '', 'g')))
  WHERE length(regexp_replace(cpf_cnpj, '\D', '', 'g')) IN (11, 14);

CREATE TABLE IF NOT EXISTS alix_document_onboarding_review (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  document_id text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alix_doc_onboarding_review_session
  ON alix_document_onboarding_review (session_id);

CREATE INDEX IF NOT EXISTS idx_alix_doc_onboarding_review_status
  ON alix_document_onboarding_review (status);

CREATE INDEX IF NOT EXISTS idx_alix_doc_onboarding_review_document
  ON alix_document_onboarding_review (document_id);
