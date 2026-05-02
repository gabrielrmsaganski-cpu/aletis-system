// ============================================================
// OfxImporter — parser de extrato bancário OFX (Open Financial
// Exchange) para popular gf_passivo_outro (entradas) ou
// detectar transações.
// ============================================================
// OFX é o padrão usado por todos os bancos brasileiros para
// exportar extratos. Estrutura:
//   <OFX>
//     <BANKMSGSRSV1><STMTRS>
//       <BANKACCTFROM>...</BANKACCTFROM>
//       <BANKTRANLIST>
//         <STMTTRN>
//           <TRNTYPE>DEBIT|CREDIT</TRNTYPE>
//           <DTPOSTED>20250115120000</DTPOSTED>
//           <TRNAMT>-1500.00</TRNAMT>
//           <FITID>...</FITID>
//           <MEMO>descrição</MEMO>
//         </STMTTRN>
//         ...
//       </BANKTRANLIST>
//     </STMTRS></BANKMSGSRSV1>
//   </OFX>
// ============================================================

export interface OfxTransacao {
  tipo: 'CREDIT' | 'DEBIT'
  data: string
  valor: number
  fitid?: string
  memo?: string
  checkNum?: string
}

export interface OfxParseResult {
  banco?: string
  conta?: string
  agencia?: string
  saldoFinal?: number
  saldoData?: string
  totalCreditos: number
  totalDebitos: number
  transacoes: OfxTransacao[]
  warnings: string[]
}

/** Parse permissivo de OFX 1.x (SGML) ou OFX 2.x (XML). */
export function parseOfx(content: string): OfxParseResult {
  const warnings: string[] = []
  const txt = content.replace(/^[\s\S]*?<OFX>/i, '<OFX>') // pula header SGML
    .replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;') // escape de & solto

  const banco = grab(txt, 'BANKID') ?? grab(txt, 'ORG')
  const conta = grab(txt, 'ACCTID')
  const agencia = grab(txt, 'BRANCHID')
  const saldoFinal = parseFloat(grab(txt, 'BALAMT') ?? '')
  const saldoData = parseOfxDate(grab(txt, 'DTASOF'))

  const transacoes: OfxTransacao[] = []
  let totalCred = 0
  let totalDeb = 0

  // captura todos <STMTTRN>...</STMTTRN>
  const trnRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let m: RegExpExecArray | null
  while ((m = trnRe.exec(txt)) !== null) {
    const block = m[1]
    const tipoRaw = grab(block, 'TRNTYPE') ?? ''
    const dt = parseOfxDate(grab(block, 'DTPOSTED'))
    const valor = parseFloat(grab(block, 'TRNAMT') ?? '0')
    const memo = grab(block, 'MEMO') ?? grab(block, 'NAME')
    const fitid = grab(block, 'FITID')
    const checkNum = grab(block, 'CHECKNUM')
    if (!isFinite(valor)) {
      warnings.push(`Transação ${fitid ?? '?'} valor inválido`)
      continue
    }
    const tipo: OfxTransacao['tipo'] = valor >= 0 ? 'CREDIT' : 'DEBIT'
    if (tipo === 'CREDIT') totalCred += valor
    else totalDeb += Math.abs(valor)
    transacoes.push({
      tipo,
      data: dt ?? '',
      valor,
      fitid: fitid ?? undefined,
      memo: memo ?? undefined,
      checkNum: checkNum ?? undefined,
    })
  }

  return {
    banco: banco ?? undefined,
    conta: conta ?? undefined,
    agencia: agencia ?? undefined,
    saldoFinal: isFinite(saldoFinal) ? saldoFinal : undefined,
    saldoData: saldoData ?? undefined,
    totalCreditos: totalCred,
    totalDebitos: totalDeb,
    transacoes,
    warnings,
  }
}

function grab(text: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')
  const m = re.exec(text)
  return m ? m[1].trim() || undefined : undefined
}

function parseOfxDate(s: string | undefined): string | null {
  if (!s) return null
  // OFX usa YYYYMMDDhhmmss[.xxx][[+|-]TZH:TZM]
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** Categoriza heurística de cada transação. */
const KEYWORDS: Array<{ test: RegExp; categoria: string; tipo: string }> = [
  { test: /sal[áa]rio|prolabore|pr[óo].labore/i, categoria: 'Pró-labore', tipo: 'fixo' },
  { test: /aluguel|arrend/i, categoria: 'Arrendamento', tipo: 'arrendamento' },
  { test: /combust[íi]vel|posto|gasolina|diesel/i, categoria: 'Combustível', tipo: 'operacional' },
  { test: /fertilizante|adubo/i, categoria: 'Fertilizantes', tipo: 'insumo' },
  { test: /defensivo|herbicida|fungicida|inseticida/i, categoria: 'Defensivos', tipo: 'insumo' },
  { test: /semente/i, categoria: 'Sementes', tipo: 'insumo' },
  { test: /banco|finan|emprest|amort|jur/i, categoria: 'Financeiro/Bancário', tipo: 'outros' },
  { test: /imposto|tribut|inss|fgts|irpf|irrf/i, categoria: 'Tributos', tipo: 'fixo' },
  { test: /energia|el[ée]tric|cemig|cpfl|enel/i, categoria: 'Energia', tipo: 'fixo' },
  { test: /tel|claro|vivo|tim|oi/i, categoria: 'Telefonia', tipo: 'fixo' },
]

export function categorizarTransacao(trn: OfxTransacao): { categoria: string; tipo: string } {
  const memo = trn.memo ?? ''
  for (const kw of KEYWORDS) {
    if (kw.test.test(memo)) return { categoria: kw.categoria, tipo: kw.tipo }
  }
  return { categoria: 'Não categorizado', tipo: 'outros' }
}

/** Converte transações OFX em sumário por categoria (anual). */
export interface OfxResumoCategoria {
  categoria: string
  tipo: string
  total: number
  count: number
  exemplos: string[]
}

export function resumirOfxPorCategoria(parsed: OfxParseResult): OfxResumoCategoria[] {
  const map = new Map<string, OfxResumoCategoria>()
  for (const t of parsed.transacoes) {
    if (t.tipo !== 'DEBIT') continue
    const cat = categorizarTransacao(t)
    const key = cat.categoria
    const cur = map.get(key) ?? { categoria: cat.categoria, tipo: cat.tipo, total: 0, count: 0, exemplos: [] }
    cur.total += Math.abs(t.valor)
    cur.count += 1
    if (cur.exemplos.length < 3 && t.memo) cur.exemplos.push(t.memo.slice(0, 60))
    map.set(key, cur)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}
