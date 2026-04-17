/**
 * Ingest PGFN Dívida Ativa dumps — extracts agro/rural leads and produces a
 * normalized index under apps/api/storage/prospeccao/.
 *
 * Input: extracted CSVs from https://dadosabertos.pgfn.gov.br/ (quarterly dumps)
 * Output: leads-agro.json (one record per CPF/CNPJ with aggregated debts)
 *
 * Run: pnpm --filter @aletis/api run ingest:pgfn -- --input /tmp/pgfn/extracted
 */
import { createReadStream, writeFileSync, readdirSync, mkdirSync } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'

// Agro signal patterns in NOME_DEVEDOR — very conservative, prioritizes precision
const AGRO_PATTERNS = [
  /\bFAZENDA\b/i,
  /\bAGROPECUARIA\b/i,
  /\bAGROPECU[AÁ]RIA\b/i,
  /\bAGRO\s?NEG[OÓ]CIOS?\b/i,
  /\bAGRONEG[OÓ]CIOS?\b/i,
  /\bAGR[IÍ]COLA\b/i,
  /\bAGROINDUSTRI[AL]+\b/i,
  /\bRURAL\b/i,
  /\bS[IÍ]TIO\b/i,
  /\bCHACARA\b/i,
  /\bCH[ÁA]CARA\b/i,
  /\bGR[AÃ]OS\b/i,
  /\bPLANTA[CÇ][AÃ]O\b/i,
  /\bPRODUTOR\s+RURAL\b/i,
  /\bPECU[AÁ]RIA\b/i,
  /\bSEMENTES\b/i,
  /\bCEREALISTA\b/i,
  /\bGADO\b/i,
  /\bSOJA\b/i,
  /\bCAFE\b/i,
  /\bMILHO\b/i,
  /\bALGOD[AÃ]O\b/i,
  /\bAGROEXP/i,
]

// Suppress signals that match agro word but are clearly non-agro businesses
const NEGATIVE_PATTERNS = [
  /\bIGREJA\b/i,
  /\bASSOCIA[CÇ][AÃ]O\b.*\b(MORADOR|BAIRRO)/i,
  /\bCLUBE\b.*\bCAMPO\b/i,
]

interface DebtRecord {
  fonte: 'PREV' | 'FGTS' | 'NAOPREV'
  inscricao: string
  tipoSituacao: string
  situacao: string
  tipoCredito: string
  dataInscricao: string
  ajuizado: boolean
  valor: number
}

interface LeadAggregate {
  cpfCnpj: string
  cpfCnpjClean: string
  tipoPessoa: 'PF' | 'PJ'
  nome: string
  uf: string
  agroSignals: string[]
  debts: DebtRecord[]
  totalDivida: number
  qtdInscricoes: number
  primeiraInscricao: string
  ultimaInscricao: string
  temAjuizada: boolean
}

function parseBrazilianNumber(s: string): number {
  if (!s) return 0
  const cleaned = s.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isFinite(n) ? n : 0
}

function normalizeCpfCnpj(s: string): string {
  return (s || '').replace(/[^\d]/g, '')
}

function detectAgroSignals(nome: string): string[] {
  const upper = (nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (NEGATIVE_PATTERNS.some((p) => p.test(upper))) return []
  const hits: string[] = []
  for (const pat of AGRO_PATTERNS) {
    const m = upper.match(pat)
    if (m) hits.push(m[0].toUpperCase())
  }
  return hits
}

type CsvKind = 'PREV' | 'FGTS' | 'NAOPREV'

function detectKind(fileName: string): CsvKind {
  const u = fileName.toUpperCase()
  if (u.includes('PREV')) return 'PREV'
  if (u.includes('FGTS')) return 'FGTS'
  return 'NAOPREV'
}

/**
 * Parse a single CSV line honoring the simple ';'-separated format used by PGFN.
 * No embedded quotes/escapes in practice, so a split suffices.
 */
function parseLine(line: string): string[] {
  return line.split(';').map((c) => c.trim())
}

interface IngestStats {
  rowsRead: number
  rowsAgro: number
  leads: number
  totalDebt: number
}

async function ingestFile(
  filePath: string,
  accumulator: Map<string, LeadAggregate>,
  stats: IngestStats
): Promise<void> {
  const kind = detectKind(filePath)
  const stream = createReadStream(filePath, { encoding: 'latin1' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  let headerParsed = false
  let col: Record<string, number> = {}

  for await (const rawLine of rl) {
    if (!rawLine || !rawLine.trim()) continue
    if (!headerParsed) {
      const hdr = parseLine(rawLine)
      hdr.forEach((name, i) => (col[name.toUpperCase().trim()] = i))
      headerParsed = true
      continue
    }
    stats.rowsRead++
    const cells = parseLine(rawLine)
    const nome = cells[col['NOME_DEVEDOR']] || ''
    const signals = detectAgroSignals(nome)
    if (signals.length === 0) continue
    stats.rowsAgro++

    const cpfCnpjRaw = cells[col['CPF_CNPJ']] || ''
    const cpfCnpjClean = normalizeCpfCnpj(cpfCnpjRaw)
    if (!cpfCnpjClean) continue

    const valor = parseBrazilianNumber(cells[col['VALOR_CONSOLIDADO']] || '0')
    stats.totalDebt += valor

    const tipoPessoaRaw = (cells[col['TIPO_PESSOA']] || '').toLowerCase()
    const tipoPessoa: 'PF' | 'PJ' = tipoPessoaRaw.includes('jur') ? 'PJ' : 'PF'

    const debt: DebtRecord = {
      fonte: kind,
      inscricao: cells[col['NUMERO_INSCRICAO']] || '',
      tipoSituacao: cells[col['TIPO_SITUACAO_INSCRICAO']] || '',
      situacao: cells[col['SITUACAO_INSCRICAO']] || '',
      tipoCredito: cells[col['TIPO_CREDITO']] || cells[col['RECEITA_PRINCIPAL']] || '',
      dataInscricao: cells[col['DATA_INSCRICAO']] || '',
      ajuizado: (cells[col['INDICADOR_AJUIZADO']] || '').toUpperCase() === 'SIM',
      valor,
    }

    const existing = accumulator.get(cpfCnpjClean)
    if (existing) {
      existing.debts.push(debt)
      existing.totalDivida += valor
      existing.qtdInscricoes++
      existing.temAjuizada ||= debt.ajuizado
      if (!existing.primeiraInscricao || debt.dataInscricao < existing.primeiraInscricao)
        existing.primeiraInscricao = debt.dataInscricao
      if (!existing.ultimaInscricao || debt.dataInscricao > existing.ultimaInscricao)
        existing.ultimaInscricao = debt.dataInscricao
      signals.forEach((s) => {
        if (!existing.agroSignals.includes(s)) existing.agroSignals.push(s)
      })
    } else {
      accumulator.set(cpfCnpjClean, {
        cpfCnpj: cpfCnpjRaw,
        cpfCnpjClean,
        tipoPessoa,
        nome: nome.trim(),
        uf: cells[col['UF_DEVEDOR']] || '',
        agroSignals: Array.from(new Set(signals)),
        debts: [debt],
        totalDivida: valor,
        qtdInscricoes: 1,
        primeiraInscricao: debt.dataInscricao,
        ultimaInscricao: debt.dataInscricao,
        temAjuizada: debt.ajuizado,
      })
      stats.leads++
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const inputs: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input') inputs.push(args[++i])
  }
  if (inputs.length === 0) inputs.push('/tmp/pgfn/extracted')
  const outputIdx = args.indexOf('--output')
  const outputDir =
    outputIdx >= 0
      ? args[outputIdx + 1]
      : join(process.cwd(), 'apps/api/storage/prospeccao')

  mkdirSync(outputDir, { recursive: true })

  const accumulator = new Map<string, LeadAggregate>()
  const stats: IngestStats = { rowsRead: 0, rowsAgro: 0, leads: 0, totalDebt: 0 }

  for (const dir of inputs) {
    const files = readdirSync(dir).filter((f) => f.endsWith('.csv'))
    console.log(`[pgfn] ${files.length} CSV files under ${dir}`)
    for (const f of files) {
      const full = join(dir, f)
      console.log(`[pgfn] Ingesting ${f}...`)
      await ingestFile(full, accumulator, stats)
      console.log(
        `  rows=${stats.rowsRead.toLocaleString()} agro=${stats.rowsAgro.toLocaleString()} leads=${stats.leads.toLocaleString()}`
      )
    }
  }

  const leads = Array.from(accumulator.values()).sort(
    (a, b) => b.totalDivida - a.totalDivida
  )

  const outputFile = join(outputDir, 'leads-agro.json')
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'PGFN Dívida Ativa — dadosabertos.pgfn.gov.br',
    stats: {
      ...stats,
      totalDebtBRL: stats.totalDebt,
    },
    leadsCount: leads.length,
  }
  writeFileSync(outputFile, JSON.stringify({ manifest, leads }, null, 0))

  // Also emit a summary file for UI dashboards
  const byUf: Record<string, { count: number; debt: number }> = {}
  for (const l of leads) {
    const uf = l.uf || 'ND'
    if (!byUf[uf]) byUf[uf] = { count: 0, debt: 0 }
    byUf[uf].count++
    byUf[uf].debt += l.totalDivida
  }
  writeFileSync(
    join(outputDir, 'leads-agro-summary.json'),
    JSON.stringify({ manifest, byUf }, null, 2)
  )

  console.log(
    `\n[pgfn] ${leads.length.toLocaleString()} agro leads written to ${outputFile}`
  )
  console.log(
    `[pgfn] total outstanding debt: R$ ${stats.totalDebt.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
    })}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
