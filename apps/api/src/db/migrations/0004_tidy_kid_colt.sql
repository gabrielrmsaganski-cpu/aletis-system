CREATE TABLE "alix_confirmation" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"tipo" text NOT NULL,
	"status" text NOT NULL,
	"expira_em" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alix_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" text,
	"message_id" text,
	"rating" text,
	"motivo" text,
	"comentario" text,
	"payload" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alix_confirmation_status_idx" ON "alix_confirmation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alix_confirmation_session_idx" ON "alix_confirmation" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "alix_confirmation_expira_idx" ON "alix_confirmation" USING btree ("expira_em");--> statement-breakpoint
CREATE INDEX "alix_feedback_session_idx" ON "alix_feedback" USING btree ("session_id","criado_em");--> statement-breakpoint
CREATE INDEX "alix_feedback_rating_idx" ON "alix_feedback" USING btree ("rating");