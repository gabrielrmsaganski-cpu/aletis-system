CREATE TABLE "alix_drive_corpus" (
 "tenant_id" text NOT NULL, "file_id" text NOT NULL, "revision_key" text NOT NULL,
 "name" text NOT NULL, "mime_type" text NOT NULL, "path" text DEFAULT '' NOT NULL,
 "drive_id" text, "cliente_id" text REFERENCES "cliente"("id") ON DELETE SET NULL,
 "corporate_scope" boolean DEFAULT false NOT NULL, "category" text NOT NULL,
 "read_status" text DEFAULT 'pending' NOT NULL CHECK ("read_status" IN ('pending','complete','partial','failed','unsupported','changed','deferred','folder')),
 "coverage" jsonb NOT NULL, "extracted_text" text DEFAULT '' NOT NULL,
 "extracted_characters" integer GENERATED ALWAYS AS (length("extracted_text")) STORED,
 "source_sha256" text, "content_hash" text, "modified_at" timestamptz, "read_at" timestamptz,
 "scanned_at" timestamptz NOT NULL, "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 PRIMARY KEY ("tenant_id","file_id")
);
--> statement-breakpoint
CREATE INDEX "alix_drive_corpus_cliente_idx" ON "alix_drive_corpus" ("tenant_id","cliente_id");
--> statement-breakpoint
CREATE INDEX "alix_drive_corpus_state_idx" ON "alix_drive_corpus" ("tenant_id","read_status");
--> statement-breakpoint
CREATE INDEX "alix_drive_corpus_category_idx" ON "alix_drive_corpus" ("tenant_id","category");
--> statement-breakpoint
CREATE TABLE "alix_drive_corpus_chunk" (
 "id" text PRIMARY KEY, "tenant_id" text NOT NULL, "file_id" text NOT NULL, "revision_key" text NOT NULL,
 "ordinal" integer NOT NULL, "text" text NOT NULL, "source" text NOT NULL,
 "page" integer, "sheet" text, "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('portuguese',"text")) STORED,
 CONSTRAINT "alix_drive_corpus_chunk_file_fk" FOREIGN KEY ("tenant_id","file_id") REFERENCES "alix_drive_corpus"("tenant_id","file_id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "alix_drive_corpus_chunk_file_idx" ON "alix_drive_corpus_chunk" ("tenant_id","file_id","revision_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "alix_drive_corpus_chunk_ordinal_unique" ON "alix_drive_corpus_chunk" ("tenant_id","file_id","revision_key","ordinal");
--> statement-breakpoint
CREATE INDEX "alix_drive_corpus_chunk_search_idx" ON "alix_drive_corpus_chunk" USING gin ("search_vector");
--> statement-breakpoint
CREATE TABLE "alix_drive_corpus_run" (
 "tenant_id" text PRIMARY KEY, "payload" jsonb NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL
);
