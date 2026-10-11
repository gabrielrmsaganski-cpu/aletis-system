-- Busca por chave e vinculação de notas, resumos e eventos do mesmo cliente.
CREATE INDEX IF NOT EXISTS fiscal_document_client_key_idx ON fiscal_document(cliente_id,(payload->>'key'));
CREATE INDEX IF NOT EXISTS fiscal_document_client_emission_idx ON fiscal_document(cliente_id,(payload->>'issuedAt'),id);
-- Consulta por chave pode retornar XML sem NSU (NT 2014.002 v1.40).
ALTER TABLE fiscal_document ALTER COLUMN nsu DROP NOT NULL;
CREATE INDEX IF NOT EXISTS fiscal_document_hash_idx ON fiscal_document(documento,sha256);
ALTER TABLE fiscal_nfe_cursor ADD COLUMN IF NOT EXISTS target_next_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE fiscal_nfe_cursor ADD COLUMN IF NOT EXISTS sync_requested boolean NOT NULL DEFAULT false;
ALTER TABLE fiscal_query ADD COLUMN IF NOT EXISTS modalidade text NOT NULL DEFAULT 'distribuicao' CHECK(modalidade IN ('distribuicao','chave','nsu'));
ALTER TABLE fiscal_query ADD COLUMN IF NOT EXISTS alvo text;
-- Um bloqueio anterior à expansão também impede as consultas pontuais.
UPDATE fiscal_nfe_cursor s SET target_next_at=greatest(target_next_at,next_allowed_at)
WHERE EXISTS(SELECT 1 FROM fiscal_query q JOIN fiscal_credential c ON c.id=q.credential_id
 WHERE c.documento=s.documento AND q.code='656' AND q.completed_at>now()-interval '1 hour');
