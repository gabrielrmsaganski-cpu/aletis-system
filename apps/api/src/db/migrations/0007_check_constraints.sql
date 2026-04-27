-- Onda P1.6 — CHECK constraints para enums em string livre.
-- Sem isso, qualquer typo no app insere lixo no banco.
-- Idempotente: cada bloco encapsulado em DO $$ ... $$ que ignora
-- duplicate_object para permitir re-run.

-- cliente.estagio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'cliente_estagio_check'
  ) THEN
    ALTER TABLE "cliente" ADD CONSTRAINT cliente_estagio_check
      CHECK (estagio IN ('prospeccao','analise','negociacao','acordo','encerrado'));
  END IF;
END$$;

-- alix_message.role (system/user/assistant/tool são os papéis do Claude)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'alix_message_role_check'
  ) THEN
    ALTER TABLE "alix_message" ADD CONSTRAINT alix_message_role_check
      CHECK (role IN ('system','user','assistant','tool'));
  END IF;
END$$;

-- alix_feedback.rating (1..5)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'alix_feedback_rating_check'
  ) THEN
    ALTER TABLE "alix_feedback" ADD CONSTRAINT alix_feedback_rating_check
      CHECK (rating BETWEEN 1 AND 5);
  END IF;
END$$;

-- plano_custeio.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'plano_custeio_status_check'
  ) THEN
    ALTER TABLE "plano_custeio" ADD CONSTRAINT plano_custeio_status_check
      CHECK (status IS NULL OR status IN ('rascunho','submetido','aprovado','reprovado','arquivado'));
  END IF;
END$$;

-- portal_token.tipo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'portal_token_tipo_check'
  ) THEN
    ALTER TABLE "portal_token" ADD CONSTRAINT portal_token_tipo_check
      CHECK (tipo IN ('magic','reset','refresh'));
  END IF;
END$$;

-- portal_token.canal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'portal_token_canal_check'
  ) THEN
    ALTER TABLE "portal_token" ADD CONSTRAINT portal_token_canal_check
      CHECK (canal IS NULL OR canal IN ('email','whatsapp','sms'));
  END IF;
END$$;

-- portal_mensagem.de
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'portal_mensagem_de_check'
  ) THEN
    ALTER TABLE "portal_mensagem" ADD CONSTRAINT portal_mensagem_de_check
      CHECK (de IN ('cliente','consultor','sistema','alix'));
  END IF;
END$$;

-- portal_documento_pendente.status + categoria
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'portal_doc_pend_status_check'
  ) THEN
    ALTER TABLE "portal_documento_pendente" ADD CONSTRAINT portal_doc_pend_status_check
      CHECK (status IN ('pendente','enviado','aprovado','rejeitado'));
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'portal_doc_pend_categoria_check'
  ) THEN
    ALTER TABLE "portal_documento_pendente" ADD CONSTRAINT portal_doc_pend_categoria_check
      CHECK (categoria IS NULL OR categoria IN ('fiscal','contrato','identidade','patrimonio','agro','outros'));
  END IF;
END$$;

-- portal_upload.enviado_por
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'portal_upload_enviado_por_check'
  ) THEN
    ALTER TABLE "portal_upload" ADD CONSTRAINT portal_upload_enviado_por_check
      CHECK (enviado_por IN ('cliente','consultor'));
  END IF;
END$$;

-- portal_evento.canal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'portal_evento_canal_check'
  ) THEN
    ALTER TABLE "portal_evento" ADD CONSTRAINT portal_evento_canal_check
      CHECK (canal IS NULL OR canal IN ('web','mobile','magic','consultor'));
  END IF;
END$$;
