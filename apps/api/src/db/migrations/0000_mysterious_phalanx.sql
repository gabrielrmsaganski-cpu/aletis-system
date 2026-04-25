CREATE TABLE "alix_message" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"modelo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alix_session" (
	"id" text PRIMARY KEY NOT NULL,
	"consultor_id" text,
	"cliente_id" text,
	"titulo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ator" text,
	"acao" text NOT NULL,
	"recurso" text NOT NULL,
	"dados_antes" jsonb,
	"dados_depois" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cpf_cnpj" text NOT NULL,
	"cidade" text,
	"uf" varchar(2),
	"telefone" text,
	"email" text,
	"estagio" text NOT NULL,
	"consultor" text,
	"credor" text,
	"valor_total_divida" numeric(18, 2),
	"valor_total_pago" numeric(18, 2),
	"area_total_ha" numeric(12, 2),
	"culturas" text[],
	"data_cadastro" timestamp with time zone,
	"ultima_atualizacao" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossie" (
	"cliente_id" text NOT NULL,
	"versao" integer NOT NULL,
	"data_base" text NOT NULL,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dossie_cliente_id_versao_pk" PRIMARY KEY("cliente_id","versao")
);
--> statement-breakpoint
CREATE TABLE "fonte_status" (
	"nome" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"ultima_atualizacao" timestamp with time zone,
	"latencia_ms" integer,
	"ultimo_erro" text,
	"erros_24h" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "lead_pgfn" (
	"cnpj_cpf" text PRIMARY KEY NOT NULL,
	"nome" text,
	"uf" varchar(2),
	"area_estimada_ha" numeric(12, 2),
	"total_divida" numeric(18, 2),
	"inscricoes_count" integer,
	"ajuizado" boolean DEFAULT false,
	"passivo_acelerando" boolean DEFAULT false,
	"agro_score" integer,
	"sinais" text[],
	"payload" jsonb,
	"ingerido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposta" (
	"id" text PRIMARY KEY NOT NULL,
	"cliente_id" text,
	"tipo" text,
	"status" text,
	"valor_proposto" numeric(18, 2),
	"titulo" text,
	"payload" jsonb NOT NULL,
	"pdf_path" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alix_message_session_idx" ON "alix_message" USING btree ("session_id","criado_em");--> statement-breakpoint
CREATE INDEX "audit_log_recurso_idx" ON "audit_log" USING btree ("recurso","criado_em");--> statement-breakpoint
CREATE INDEX "cliente_estagio_idx" ON "cliente" USING btree ("estagio");--> statement-breakpoint
CREATE INDEX "cliente_uf_idx" ON "cliente" USING btree ("uf");--> statement-breakpoint
CREATE INDEX "cliente_cpf_cnpj_idx" ON "cliente" USING btree ("cpf_cnpj");--> statement-breakpoint
CREATE INDEX "dossie_cliente_idx" ON "dossie" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "lead_pgfn_uf_idx" ON "lead_pgfn" USING btree ("uf");--> statement-breakpoint
CREATE INDEX "lead_pgfn_score_idx" ON "lead_pgfn" USING btree ("agro_score");--> statement-breakpoint
CREATE INDEX "proposta_cliente_idx" ON "proposta" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "proposta_status_idx" ON "proposta" USING btree ("status");