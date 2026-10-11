export type ClientOnboardingDocumentType =
  | 'proposta'
  | 'contrato'
  | 'identidade'
  | 'fiscal'
  | 'patrimonio'
  | 'agro'
  | 'documento'

export function detectClientOnboardingDocumentType(params: {
  filename: string
  mimetype: string
  texto: string
  metadata?: Record<string, unknown>
}): ClientOnboardingDocumentType {
  const base = `${params.filename}\n${params.mimetype}\n${params.texto.slice(0, 8000)}\n${JSON.stringify(params.metadata ?? {}).slice(0, 4000)}`.toLowerCase()
  if (/(proposta|renegocia[cç][aã]o|liquida[cç][aã]o|parcelamento|desconto|valor\s+propost|condi[cç][oõ]es\s+(?:da|de)\s+(?:proposta|pagamento)|entrada\s+(?:de|no\s+valor)|car[eê]ncia|plano\s+de\s+pagamento)/i.test(base)) {
    return 'proposta'
  }
  if (/(contrato|c[eé]dula|cpr\b|confiss[aã]o|instrumento|aditivo|garantia|aval|hipoteca|alien[aã]o|assinatura|cl[aá]usula)/i.test(base)) {
    return 'contrato'
  }
  if (/(receita\s+federal|certid[aã]o\s+(?:negativa|fiscal)|darf|tribut|imposto|declara[cç][aã]o\s+de\s+imposto|pgfn|d[ií]vida\s+ativa|execu[cç][aã]o\s+fiscal)/i.test(base)) {
    return 'fiscal'
  }
  if (/(matr[ií]cula\s+(?:do\s+)?im[oó]vel|registro\s+de\s+im[oó]veis|patrim[oô]nio|rela[cç][aã]o\s+de\s+bens|ve[ií]culo|renavam|escritura|certid[aã]o\s+de\s+inteiro\s+teor)/i.test(base)) {
    return 'patrimonio'
  }
  if (/(cadastro\s+ambiental\s+rural|\bcar\b|\bccir\b|im[oó]vel\s+rural|produtor\s+rural|fazenda|hectare|safra|cultura|soja|milho|pecu[aá]ria|incra)/i.test(base)) {
    return 'agro'
  }
  if (/(carteira\s+(?:nacional\s+de\s+habilita[cç][aã]o|de\s+identidade)|documento\s+de\s+identifica[cç][aã]o|registro\s+geral|(?:^|[\s_.-])rg(?:[\s_.-]|$)|(?:^|[\s_.-])cpf(?:[\s_.-]|$)|(?:^|[\s_.-])cnh(?:[\s_.-]|$)|certid[aã]o\s+(?:de\s+)?(?:nascimento|casamento)|passaporte)/i.test(base)) {
    return 'identidade'
  }
  return 'documento'
}
