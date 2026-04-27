-- Wave Onda B — relaxar CHECK do rating em alix_feedback.
-- A 0007 colocou apenas {util, irrelevante, incorreto, off-tom} (canônicos
-- do FeedbackService), mas o repositório aceita variantes legadas
-- ('positive', 'negative', 'neutral', 'thumbs-up', 'thumbs-down') que
-- continuam batendo no agregador (POSITIVE_RATINGS / NEGATIVE_RATINGS).
-- Mantemos CHECK para impedir lixo, mas com universo maior.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alix_feedback_rating_check'
  ) THEN
    ALTER TABLE "alix_feedback" DROP CONSTRAINT alix_feedback_rating_check;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alix_feedback_rating_check'
  ) THEN
    ALTER TABLE "alix_feedback" ADD CONSTRAINT alix_feedback_rating_check
      CHECK (rating IS NULL OR rating IN (
        -- canônicos do FeedbackService
        'util','irrelevante','incorreto','off-tom',
        -- variantes legadas/portal
        'positive','positivo','negative','negativo','neutral','neutro',
        'útil','thumbs-up','thumbs-down'
      ));
  END IF;
END$$;
