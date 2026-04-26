CREATE TABLE "bsc_snapshot" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cliente_id" text NOT NULL,
	"calculado_em" timestamp with time zone NOT NULL,
	"status_geral" text,
	"nota_global" numeric(5, 2),
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bsc_snapshot_cliente_idx" ON "bsc_snapshot" USING btree ("cliente_id","calculado_em");--> statement-breakpoint
CREATE INDEX "bsc_snapshot_status_idx" ON "bsc_snapshot" USING btree ("status_geral");