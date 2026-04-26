CREATE TABLE "alix_insight" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dia" varchar(10) NOT NULL,
	"cliente_id" text,
	"tipo" text NOT NULL,
	"severidade" text,
	"titulo" text NOT NULL,
	"detalhe" text,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alix_memory" (
	"cliente_id" text PRIMARY KEY NOT NULL,
	"cliente_nome" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alix_insight_dia_idx" ON "alix_insight" USING btree ("dia");--> statement-breakpoint
CREATE INDEX "alix_insight_cliente_idx" ON "alix_insight" USING btree ("cliente_id","dia");--> statement-breakpoint
CREATE INDEX "alix_insight_tipo_idx" ON "alix_insight" USING btree ("tipo");