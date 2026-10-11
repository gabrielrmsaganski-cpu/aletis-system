ALTER TABLE "alix_session" ADD COLUMN IF NOT EXISTS "arquivado_em" timestamp with time zone;
ALTER TABLE "alix_session" ADD COLUMN IF NOT EXISTS "fixado_em" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "alix_session_arquivado_idx" ON "alix_session" ("arquivado_em");
CREATE INDEX IF NOT EXISTS "alix_session_fixado_idx" ON "alix_session" ("fixado_em" DESC NULLS LAST, "atualizado_em" DESC);
