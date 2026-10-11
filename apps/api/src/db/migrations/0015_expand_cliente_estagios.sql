-- CRM: alinhar constraint do Postgres ao vocabulário canônico usado pelo app.
ALTER TABLE "cliente" DROP CONSTRAINT IF EXISTS cliente_estagio_check;

ALTER TABLE "cliente" ADD CONSTRAINT cliente_estagio_check
  CHECK (estagio IN (
    'lead',
    'prospeccao',
    'qualificacao',
    'analise',
    'proposta',
    'negociacao',
    'acordo',
    'acompanhamento',
    'concluido',
    'encerrado'
  ));
