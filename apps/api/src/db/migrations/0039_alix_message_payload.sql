-- Extras da mensagem: modelo efetivo, fontes, ferramentas e auditoria sobrevivem ao reload.
-- Migração aditiva e repetível; mensagens antigas permanecem com payload NULL.
ALTER TABLE alix_message ADD COLUMN IF NOT EXISTS payload jsonb;
