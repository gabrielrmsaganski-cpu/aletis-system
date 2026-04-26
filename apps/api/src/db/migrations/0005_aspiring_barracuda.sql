CREATE TABLE "inventario_cliente" (
	"cliente_id" text PRIMARY KEY NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"total_ativos" integer DEFAULT 0,
	"valor_total" numeric(18, 2),
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plano_custeio" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text,
	"safra" varchar(7),
	"status" text,
	"valor_total" numeric(18, 2),
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "plano_custeio_cliente_idx" ON "plano_custeio" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "plano_custeio_safra_idx" ON "plano_custeio" USING btree ("safra");--> statement-breakpoint
CREATE INDEX "plano_custeio_status_idx" ON "plano_custeio" USING btree ("status");