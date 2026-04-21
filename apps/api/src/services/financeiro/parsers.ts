/**
 * Parsers de documentos fiscais/bancários.
 *
 * NFS-e: padrão ABRASF (maior parte dos municípios), Ginfes (MG, interior SP),
 * Paulistana (São Paulo). Usa regex tolerante que extrai campos sem depender
 * de parser DOM completo — NFS-e tem namespace variável por município, então
 * regex flexível funciona melhor do que strict XML parse.
 *
 * OFX: formato texto key-value do Money/Quicken, universal entre bancos
 * brasileiros. Seguimos OFX 2.x (SGML).
 */

export interface NfseParsed {
  numero: string
  serie?: string
  codigoVerificacao?: string
  dataEmissao?: string // ISO
  valorServicos: number
  valorIss?: number
  valorIr?: number
  valorInss?: number
  valorCsll?: number
  valorPis?: number
  valorCofins?: number
  valorLiquido: number
  prestador?: {
    cnpj?: string
    razaoSocial?: string
    inscricaoMunicipal?: string
  }
  tomador?: {
    cpfCnpj?: string
    razaoSocial?: string
    endereco?: string
  }
  discriminacao?: string
  codigoMunicipio?: string
  aliquotaIss?: number
}

const pick = (re: RegExp, text: string): string | undefined => {
  const m = text.match(re)
  return m?.[1]?.trim()
}

const pickNum = (re: RegExp, text: string): number | undefined => {
  const s = pick(re, text)
  if (!s) return undefined
  const v = parseFloat(s.replace(',', '.'))
  return isNaN(v) ? undefined : v
}

export function parseNfseXml(xml: string): NfseParsed {
  // Normaliza: remove namespaces (ns:, tc:, etc) pra regex ficar mais simples
  const clean = xml.replace(/<\/?([a-zA-Z0-9]+:)/g, (m) => m.replace(/[a-zA-Z0-9]+:/g, ''))

  const numero = pick(/<Numero>([^<]+)<\/Numero>/i, clean) ?? pick(/<nNFS?>([^<]+)<\/nNFS?>/i, clean) ?? 'SEM-NUMERO'
  const serie = pick(/<Serie>([^<]+)<\/Serie>/i, clean)
  const codigoVerificacao = pick(/<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/i, clean)
  const dataEmissaoRaw = pick(/<DataEmissao>([^<]+)<\/DataEmissao>/i, clean) ?? pick(/<dtEmissao>([^<]+)<\/dtEmissao>/i, clean)
  const dataEmissao = dataEmissaoRaw ? dataEmissaoRaw.slice(0, 10) : undefined

  const valorServicos = pickNum(/<ValorServicos>([0-9.,]+)<\/ValorServicos>/i, clean)
    ?? pickNum(/<vServicos?>([0-9.,]+)<\/vServicos?>/i, clean)
    ?? 0
  const valorIss = pickNum(/<ValorIss>([0-9.,]+)<\/ValorIss>/i, clean) ?? pickNum(/<vISS>([0-9.,]+)<\/vISS>/i, clean)
  const valorIr = pickNum(/<ValorIr>([0-9.,]+)<\/ValorIr>/i, clean) ?? pickNum(/<vIRRF>([0-9.,]+)<\/vIRRF>/i, clean)
  const valorInss = pickNum(/<ValorInss>([0-9.,]+)<\/ValorInss>/i, clean) ?? pickNum(/<vINSS>([0-9.,]+)<\/vINSS>/i, clean)
  const valorCsll = pickNum(/<ValorCsll>([0-9.,]+)<\/ValorCsll>/i, clean)
  const valorPis = pickNum(/<ValorPis>([0-9.,]+)<\/ValorPis>/i, clean)
  const valorCofins = pickNum(/<ValorCofins>([0-9.,]+)<\/ValorCofins>/i, clean)
  const valorLiquido = pickNum(/<ValorLiquidoNfse>([0-9.,]+)<\/ValorLiquidoNfse>/i, clean)
    ?? pickNum(/<vLiquido>([0-9.,]+)<\/vLiquido>/i, clean)
    ?? (valorServicos - (valorIss ?? 0) - (valorIr ?? 0) - (valorInss ?? 0))

  const aliquotaIss = pickNum(/<Aliquota>([0-9.,]+)<\/Aliquota>/i, clean)

  // Prestador
  const prestadorBloco = clean.match(/<PrestadorServico>[\s\S]*?<\/PrestadorServico>/i)?.[0]
    ?? clean.match(/<Prestador>[\s\S]*?<\/Prestador>/i)?.[0]
    ?? ''
  const prestador = prestadorBloco ? {
    cnpj: pick(/<Cnpj>([^<]+)<\/Cnpj>/i, prestadorBloco) ?? pick(/<CNPJ>([^<]+)<\/CNPJ>/i, prestadorBloco),
    razaoSocial: pick(/<RazaoSocial>([^<]+)<\/RazaoSocial>/i, prestadorBloco),
    inscricaoMunicipal: pick(/<InscricaoMunicipal>([^<]+)<\/InscricaoMunicipal>/i, prestadorBloco),
  } : undefined

  // Tomador
  const tomadorBloco = clean.match(/<TomadorServico>[\s\S]*?<\/TomadorServico>/i)?.[0]
    ?? clean.match(/<Tomador>[\s\S]*?<\/Tomador>/i)?.[0]
    ?? ''
  const tomador = tomadorBloco ? {
    cpfCnpj: pick(/<Cnpj>([^<]+)<\/Cnpj>/i, tomadorBloco)
      ?? pick(/<CNPJ>([^<]+)<\/CNPJ>/i, tomadorBloco)
      ?? pick(/<Cpf>([^<]+)<\/Cpf>/i, tomadorBloco)
      ?? pick(/<CPF>([^<]+)<\/CPF>/i, tomadorBloco),
    razaoSocial: pick(/<RazaoSocial>([^<]+)<\/RazaoSocial>/i, tomadorBloco),
    endereco: pick(/<Endereco>([\s\S]*?)<\/Endereco>/i, tomadorBloco)?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  } : undefined

  const discriminacao = pick(/<Discriminacao>([^<]+)<\/Discriminacao>/i, clean)
  const codigoMunicipio = pick(/<CodigoMunicipio>([^<]+)<\/CodigoMunicipio>/i, clean)

  return {
    numero,
    serie,
    codigoVerificacao,
    dataEmissao,
    valorServicos: Number(valorServicos.toFixed(2)),
    valorIss: valorIss != null ? Number(valorIss.toFixed(2)) : undefined,
    valorIr: valorIr != null ? Number(valorIr.toFixed(2)) : undefined,
    valorInss: valorInss != null ? Number(valorInss.toFixed(2)) : undefined,
    valorCsll: valorCsll != null ? Number(valorCsll.toFixed(2)) : undefined,
    valorPis: valorPis != null ? Number(valorPis.toFixed(2)) : undefined,
    valorCofins: valorCofins != null ? Number(valorCofins.toFixed(2)) : undefined,
    valorLiquido: Number(valorLiquido.toFixed(2)),
    prestador,
    tomador,
    discriminacao,
    codigoMunicipio,
    aliquotaIss,
  }
}

/* ──────────────────────────────────────────────────────────── */
/* OFX                                                          */
/* ──────────────────────────────────────────────────────────── */

export interface OfxTransaction {
  fitid: string
  data: string // ISO
  valor: number // positivo crédito, negativo débito
  tipo: 'credito' | 'debito'
  descricao: string
  checkNum?: string
}

export interface OfxAccount {
  bankId?: string
  accountId?: string
  accountType?: string
  balanceAmt?: number
  balanceDate?: string
  transactions: OfxTransaction[]
  periodStart?: string
  periodEnd?: string
}

const parseOfxDate = (raw: string): string => {
  // OFX: YYYYMMDDHHMMSS[...] ou YYYYMMDD
  const d = raw.trim().slice(0, 8)
  if (d.length !== 8) return raw
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

export function parseOfx(ofx: string): OfxAccount {
  // OFX headers terminam em linha em branco; corpo é SGML-like.
  const bodyStart = ofx.indexOf('<OFX>')
  const body = bodyStart >= 0 ? ofx.slice(bodyStart) : ofx

  const bankId = pick(/<BANKID>([^<\n\r]+)/i, body)?.trim()
  const accountId = pick(/<ACCTID>([^<\n\r]+)/i, body)?.trim()
  const accountType = pick(/<ACCTTYPE>([^<\n\r]+)/i, body)?.trim()

  const balanceAmt = pickNum(/<BALAMT>([^<\n\r]+)/i, body)
  const balanceDateRaw = pick(/<DTASOF>([^<\n\r]+)/i, body)
  const balanceDate = balanceDateRaw ? parseOfxDate(balanceDateRaw) : undefined

  const periodStartRaw = pick(/<DTSTART>([^<\n\r]+)/i, body)
  const periodEndRaw = pick(/<DTEND>([^<\n\r]+)/i, body)

  const transactions: OfxTransaction[] = []
  const stmtMatches = body.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)
  for (const m of stmtMatches) {
    const block = m[1]
    const fitid = pick(/<FITID>([^<\n\r]+)/i, block)?.trim() ?? `${Date.now()}-${Math.random()}`
    const dt = pick(/<DTPOSTED>([^<\n\r]+)/i, block)
    const amt = pickNum(/<TRNAMT>([^<\n\r]+)/i, block)
    const memo = pick(/<MEMO>([^<\n\r]+)/i, block)?.trim()
    const name = pick(/<NAME>([^<\n\r]+)/i, block)?.trim()
    const checkNum = pick(/<CHECKNUM>([^<\n\r]+)/i, block)?.trim()
    const valor = amt ?? 0
    transactions.push({
      fitid,
      data: dt ? parseOfxDate(dt) : '',
      valor,
      tipo: valor >= 0 ? 'credito' : 'debito',
      descricao: memo ?? name ?? 'Sem descrição',
      checkNum,
    })
  }

  return {
    bankId,
    accountId,
    accountType,
    balanceAmt,
    balanceDate,
    periodStart: periodStartRaw ? parseOfxDate(periodStartRaw) : undefined,
    periodEnd: periodEndRaw ? parseOfxDate(periodEndRaw) : undefined,
    transactions,
  }
}

/**
 * Sugere categoria automaticamente a partir da descrição do lançamento bancário.
 * Heurística baseada em palavras-chave típicas de descritores bancários BR.
 */
export function sugerirCategoriaLancamento(descricao: string): string {
  const d = descricao.toLowerCase()
  if (/pix\s*recebid|ted\s*recebid|cred\s*origem|transf\s*receb|nfs-e|nota fiscal/.test(d)) return 'receita'
  if (/aluguel|loca[cç][aã]o\s*im[oó]vel/.test(d)) return 'aluguel'
  if (/contabil|cont[aá]bil|contador/.test(d)) return 'contabilidade'
  if (/vivo|claro|oi\b|tim|internet|net\s|fibra|telefon/.test(d)) return 'internet_telefone'
  if (/energia|el[eé]trica|enel|cpfl|copel|light|celesc/.test(d)) return 'energia_agua'
  if (/[aá]gua|sanepar|sabesp|casan/.test(d)) return 'energia_agua'
  if (/uber|99\s|cabify|taxi|gasol|posto|combust/.test(d)) return 'combustivel'
  if (/hotel|pousada|airbnb|latam|gol\b|azul\s|passage/.test(d)) return 'viagens_deslocamento'
  if (/ifood|rappi|restaurante|padaria|mercado|lanche/.test(d)) return 'alimentacao'
  if (/google ads|facebook|meta ads|instagram|market|publicid/.test(d)) return 'marketing'
  if (/papelaria|cartorio|xerox|impressao|material/.test(d)) return 'material_escritorio'
  if (/saas|subscription|assinat|netflix|spotify|microsoft|adobe|notion|figma|chatgpt|openai|anthropic|claude/.test(d)) return 'software_saas'
  if (/das\s|simples nacional|inss|receita federal|iss/.test(d)) return 'impostos_taxas'
  if (/pro-?labore|pr[oó]\s*labore|retirada/.test(d)) return 'pro_labore'
  if (/tarifa|taxa|manutenc|iof|anuidade cart/.test(d)) return 'bancarias'
  if (/advoc|juridic|cart[oó]rio/.test(d)) return 'juridico'
  return 'nao_classificado'
}
