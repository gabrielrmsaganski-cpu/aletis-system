-- Pedidos e envios do portal: versão concorrente, histórico e processamento recuperável.
CREATE UNIQUE INDEX "portal_acesso_usuario_lower_unique" ON "portal_acesso" (lower("usuario"));
--> statement-breakpoint
ALTER TABLE "portal_documento_pendente"
  ADD COLUMN "prioridade" text NOT NULL DEFAULT 'normal' CHECK ("prioridade" IN ('normal','alta','urgente')),
  ADD COLUMN "prazo" date,
  ADD COLUMN "tipo_documento" text,
  ADD COLUMN "updated_at" timestamptz,
  ADD COLUMN "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
UPDATE "portal_documento_pendente"
SET "updated_at" = date_trunc('milliseconds', GREATEST("solicitado_em", "enviado_em", "revisado_em"));
--> statement-breakpoint
ALTER TABLE "portal_documento_pendente"
  ALTER COLUMN "updated_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" SET NOT NULL,
  DROP CONSTRAINT IF EXISTS "portal_doc_pend_status_check";
--> statement-breakpoint
ALTER TABLE "portal_documento_pendente" ADD CONSTRAINT "portal_doc_pend_status_check"
  CHECK ("status" IN ('pendente','enviado','aprovado','rejeitado','cancelado'));
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_doc_pend_idempotency_idx"
ON "portal_documento_pendente" ("cliente_id", ("metadata"->>'idempotencyKey'))
WHERE "metadata"->>'idempotencyKey' IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "portal_upload" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "portal_upload_idempotency_idx" ON "portal_upload" ("cliente_id", "idempotency_key")
WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "portal_document_processing_job" (
  "id" text PRIMARY KEY,
  "upload_id" text NOT NULL UNIQUE REFERENCES "portal_upload"("id") ON DELETE CASCADE,
  "cliente_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued','processing','retry','completed','failed')),
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "available_at" timestamptz NOT NULL DEFAULT now(),
  "locked_at" timestamptz,
  "lease_token" text,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "portal_doc_processing_claim_idx"
ON "portal_document_processing_job" ("status", "available_at", "created_at");
--> statement-breakpoint
CREATE INDEX "portal_doc_processing_client_idx"
ON "portal_document_processing_job" ("cliente_id", "updated_at");
