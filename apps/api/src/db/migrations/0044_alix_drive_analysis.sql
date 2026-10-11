CREATE TABLE "alix_drive_analysis" (
 "id" text PRIMARY KEY, "tenant_id" text NOT NULL, "file_id" text NOT NULL,
 "cliente_id" text NOT NULL REFERENCES "cliente"("id") ON DELETE CASCADE,
 "revision_key" text NOT NULL, "content_hash" text NOT NULL, "analyzer_version" text NOT NULL,
 "status" text NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued','scheduled','processing','review_ready','waiting_budget','paused','failed','superseded')),
 "next_ordinal" integer NOT NULL DEFAULT 0, "processed_chunks" integer NOT NULL DEFAULT 0,
 "total_chunks" integer NOT NULL, "attempts" integer NOT NULL DEFAULT 0,
 "available_at" timestamptz NOT NULL DEFAULT now(), "dispatched_at" timestamptz,
 "priority" integer NOT NULL DEFAULT 0, "payload" jsonb NOT NULL DEFAULT '{"candidates":[]}'::jsonb,
 "error_code" text, "job_id" text,
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "alix_drive_analysis_file_fk" FOREIGN KEY ("tenant_id","file_id") REFERENCES "alix_drive_corpus"("tenant_id","file_id") ON DELETE CASCADE,
 CONSTRAINT "alix_drive_analysis_revision_unique" UNIQUE ("tenant_id","file_id","cliente_id","revision_key","content_hash","analyzer_version"),
 CHECK ("next_ordinal" >= 0 AND "processed_chunks" >= 0 AND "total_chunks" > 0)
);
--> statement-breakpoint
CREATE INDEX "alix_drive_analysis_dispatch_idx" ON "alix_drive_analysis" ("status","available_at","priority","created_at");
--> statement-breakpoint
CREATE INDEX "alix_drive_analysis_client_idx" ON "alix_drive_analysis" ("tenant_id","cliente_id","updated_at");
--> statement-breakpoint
CREATE TABLE "alix_drive_analysis_budget" (
 "tenant_id" text NOT NULL, "day" date NOT NULL, "calls" integer NOT NULL DEFAULT 0 CHECK ("calls" >= 0),
 PRIMARY KEY ("tenant_id","day")
);
