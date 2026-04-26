CREATE TABLE "financeiro_despesa" (
	"id" text PRIMARY KEY NOT NULL,
	"competencia" varchar(7) NOT NULL,
	"descricao" text,
	"fornecedor_nome" text,
	"fornecedor_cpf_cnpj" text,
	"cliente_vinculo_cpf_cnpj" text,
	"categoria" text NOT NULL,
	"valor" numeric(18, 2),
	"status" text NOT NULL,
	"data_vencimento" timestamp with time zone,
	"data_pagamento" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financeiro_imposto" (
	"id" text PRIMARY KEY NOT NULL,
	"competencia" varchar(7) NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text,
	"valor" numeric(18, 2),
	"status" text NOT NULL,
	"data_vencimento" timestamp with time zone,
	"data_pagamento" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financeiro_lancamento" (
	"id" text PRIMARY KEY NOT NULL,
	"competencia" varchar(7) NOT NULL,
	"conta_bancaria" text,
	"data" timestamp with time zone,
	"descricao" text,
	"valor" numeric(18, 2),
	"tipo" text,
	"vinculado_tipo" text,
	"vinculado_id" text,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financeiro_receita" (
	"id" text PRIMARY KEY NOT NULL,
	"competencia" varchar(7) NOT NULL,
	"descricao" text,
	"cliente_nome" text,
	"cliente_cpf_cnpj" text,
	"valor_bruto" numeric(18, 2),
	"valor_liquido" numeric(18, 2),
	"status" text NOT NULL,
	"data_emissao" timestamp with time zone,
	"data_recebimento" timestamp with time zone,
	"proposta_id" text,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fin_despesa_competencia_idx" ON "financeiro_despesa" USING btree ("competencia");--> statement-breakpoint
CREATE INDEX "fin_despesa_status_idx" ON "financeiro_despesa" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fin_despesa_categoria_idx" ON "financeiro_despesa" USING btree ("categoria");--> statement-breakpoint
CREATE INDEX "fin_despesa_cliente_idx" ON "financeiro_despesa" USING btree ("cliente_vinculo_cpf_cnpj");--> statement-breakpoint
CREATE INDEX "fin_imposto_competencia_idx" ON "financeiro_imposto" USING btree ("competencia");--> statement-breakpoint
CREATE INDEX "fin_imposto_tipo_idx" ON "financeiro_imposto" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "fin_imposto_status_idx" ON "financeiro_imposto" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fin_lanc_competencia_idx" ON "financeiro_lancamento" USING btree ("competencia");--> statement-breakpoint
CREATE INDEX "fin_lanc_data_idx" ON "financeiro_lancamento" USING btree ("data");--> statement-breakpoint
CREATE INDEX "fin_lanc_vinculado_idx" ON "financeiro_lancamento" USING btree ("vinculado_tipo","vinculado_id");--> statement-breakpoint
CREATE INDEX "fin_receita_competencia_idx" ON "financeiro_receita" USING btree ("competencia");--> statement-breakpoint
CREATE INDEX "fin_receita_status_idx" ON "financeiro_receita" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fin_receita_proposta_idx" ON "financeiro_receita" USING btree ("proposta_id");