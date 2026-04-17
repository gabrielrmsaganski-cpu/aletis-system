/**
 * Ingest SICAR public shapefile attributes → sicar-imoveis.json
 *
 * O portal público do SICAR (car.gov.br/publico/municipios/downloads) distribui
 * shapefiles (.shp/.dbf/.shx/.prj) por município. Só o .dbf nos interessa —
 * é onde estão os atributos (COD_IMOVEL, NUM_AREA, NOM_MUNICI, NOM_PESSOA,
 * CPF/CNPJ quando disponível, IND_STATUS etc).
 *
 * Uso:
 *   1. Baixar shapefiles do(s) UF(s) desejado(s) em /tmp/sicar/{UF}/
 *      (ex.: para MT, GO, MS, BA, PR — 80% do agro com dívida)
 *   2. Descompactar — o script varre recursivamente procurando *.dbf
 *   3. pnpm --filter @aletis/api run ingest:sicar -- --input /tmp/sicar
 *
 * Saída: apps/api/storage/prospeccao/sicar-imoveis.json com:
 *   - manifest (stats, UFs, byUF count)
 *   - byCpfCnpj: { "12345678000190": [imovel1, imovel2] }
 *   - byNameKey: { "fazenda_saoroque_ltda": [imovel1] } (fallback por nome)
 *
 * Observação: em muitos dumps públicos o CPF/CNPJ vem mascarado ou ausente.
 * Nesses casos o match por `byNameKey` vira o caminho principal — usamos
 * normalização agressiva (uppercase, sem acento, sem pontuação) para maximizar
 * hit rate contra a razão social que veio do PGFN.
 */
import { readdirSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { join } from 'path'
import { iterateDbf } from './lib/dbf.js'

// Campos que podem aparecer em diferentes versões de dumps SICAR.
// Ordenados por prioridade — o primeiro preenchido vence.
const FIELD_ALIASES = {
  codImovel: ['COD_IMOVEL', 'COD_CAR', 'CAR', 'COD_IMOV'],
  area: ['NUM_AREA', 'AREA_HA', 'AREAHA', 'NUMAREA', 'NUM_AREA_'],
  municipio: ['NOM_MUNICI', 'MUNICIPIO', 'MUN_NOME', 'NM_MUNICIP', 'NM_MUN'],
  uf: ['COD_ESTADO', 'UF', 'SIGLA_UF', 'SG_UF', 'CD_UF'],
  nome: ['NOM_PESSOA', 'NOM_PROPR', 'NOMEPROP', 'NOME', 'NM_PROPRIE', 'NOM_RAZAO'],
  cpfCnpj: ['NUM_DOCUM', 'CPFCNPJ', 'CPF_CNPJ', 'DOCUMENTO', 'CPF', 'CNPJ', 'NR_DOC'],
  condicao: ['DES_CONDIC', 'CONDICAO', 'STATUS', 'SITUACAO', 'IND_STATUS'],
  statusAnalise: ['IND_STATUS', 'STATUS_ANA', 'ANALISE'],
  tipo: ['IND_TIPO', 'TIPO', 'TIPO_IMOV'],
  modulosFiscais: ['NUM_MODFIS', 'MOD_FISCAL', 'MODFIS'],
  areaReservaLegal: ['AREA_RL', 'NUM_AREARL', 'AREARL'],
  areaPreservacaoPermanente: ['AREA_APP', 'NUM_AREAAP', 'AREAAPP'],
  areaVegetacao: ['AREA_VN', 'AREA_VEG', 'AREAVN'],
  areaAntropizada: ['AREA_ANTR', 'AREA_USO', 'AREACONS'],
}

interface ImovelRecord {
  codImovel: string
  areaImovel: number
  municipio: string
  uf: string
  nome: string | null
  cpfCnpj: string | null
  condicao: string | null
  statusAnalise: string | null
  tipo: string | null
  modulosFiscais: number | null
  areaReservaLegal: number | null
  areaPreservacaoPermanente: number | null
  areaVegetacao: number | null
  areaAntropizada: number | null
}

function pick<T = string>(rec: Record<string, any>, names: string[]): T | null {
  for (const n of names) {
    if (rec[n] != null && rec[n] !== '') return rec[n] as T
  }
  return null
}

function toNumber(v: any): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return isFinite(n) ? n : null
}

function normalizeCpfCnpj(v: string | null): string | null {
  if (!v) return null
  const digits = String(v).replace(/\D/g, '')
  // dumps com CPF mascarado (***.123.456-**) não trazem dígitos suficientes
  if (digits.length !== 11 && digits.length !== 14) return null
  return digits
}

/** Remove acentos, pontuação e normaliza espaços para um slug estável. */
export function nameKey(nome: string): string {
  return (nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(LTDA|SA|EIRELI|EPP|ME)\s*$/i, '')
    .replace(/\s+/g, '_')
}

function toRecord(rec: Record<string, any>): ImovelRecord | null {
  const codImovel = pick<string>(rec, FIELD_ALIASES.codImovel)
  const area = toNumber(pick(rec, FIELD_ALIASES.area))
  if (!codImovel || !area) return null

  return {
    codImovel: String(codImovel).trim(),
    areaImovel: area,
    municipio: (pick<string>(rec, FIELD_ALIASES.municipio) || '').toString().trim(),
    uf: (pick<string>(rec, FIELD_ALIASES.uf) || codImovel.slice(0, 2)).toString().toUpperCase().trim(),
    nome: pick<string>(rec, FIELD_ALIASES.nome)?.toString().trim() || null,
    cpfCnpj: normalizeCpfCnpj(pick<string>(rec, FIELD_ALIASES.cpfCnpj)),
    condicao: pick<string>(rec, FIELD_ALIASES.condicao)?.toString().trim() || null,
    statusAnalise: pick<string>(rec, FIELD_ALIASES.statusAnalise)?.toString().trim() || null,
    tipo: pick<string>(rec, FIELD_ALIASES.tipo)?.toString().trim() || null,
    modulosFiscais: toNumber(pick(rec, FIELD_ALIASES.modulosFiscais)),
    areaReservaLegal: toNumber(pick(rec, FIELD_ALIASES.areaReservaLegal)),
    areaPreservacaoPermanente: toNumber(pick(rec, FIELD_ALIASES.areaPreservacaoPermanente)),
    areaVegetacao: toNumber(pick(rec, FIELD_ALIASES.areaVegetacao)),
    areaAntropizada: toNumber(pick(rec, FIELD_ALIASES.areaAntropizada)),
  }
}

function walkDbf(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walkDbf(full, out)
    else if (entry.toLowerCase().endsWith('.dbf')) out.push(full)
  }
  return out
}

interface IngestStats {
  filesProcessed: number
  recordsRead: number
  recordsIndexed: number
  skippedNoCode: number
  withCpfCnpj: number
  withName: number
  byUf: Record<string, number>
}

async function main() {
  const args = process.argv.slice(2)
  const inputs: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input') inputs.push(args[++i])
  }
  if (inputs.length === 0) inputs.push('/tmp/sicar')
  const outputIdx = args.indexOf('--output')
  const outputDir =
    outputIdx >= 0
      ? args[outputIdx + 1]
      : join(process.cwd(), 'apps/api/storage/prospeccao')

  mkdirSync(outputDir, { recursive: true })

  const byCpfCnpj = new Map<string, ImovelRecord[]>()
  const byNameKey = new Map<string, ImovelRecord[]>()
  const stats: IngestStats = {
    filesProcessed: 0,
    recordsRead: 0,
    recordsIndexed: 0,
    skippedNoCode: 0,
    withCpfCnpj: 0,
    withName: 0,
    byUf: {},
  }

  for (const dir of inputs) {
    let files: string[]
    try {
      files = walkDbf(dir)
    } catch (err: any) {
      console.error(`[sicar] não consegui varrer ${dir}: ${err.message}`)
      continue
    }
    console.log(`[sicar] ${files.length} arquivos .dbf em ${dir}`)

    for (const file of files) {
      try {
        for (const raw of iterateDbf(file)) {
          stats.recordsRead++
          const rec = toRecord(raw as Record<string, any>)
          if (!rec) {
            stats.skippedNoCode++
            continue
          }
          stats.recordsIndexed++
          stats.byUf[rec.uf] = (stats.byUf[rec.uf] || 0) + 1

          if (rec.cpfCnpj) {
            stats.withCpfCnpj++
            const arr = byCpfCnpj.get(rec.cpfCnpj) || []
            arr.push(rec)
            byCpfCnpj.set(rec.cpfCnpj, arr)
          }
          if (rec.nome) {
            stats.withName++
            const key = nameKey(rec.nome)
            if (key.length >= 4) {
              const arr = byNameKey.get(key) || []
              arr.push(rec)
              byNameKey.set(key, arr)
            }
          }
        }
        stats.filesProcessed++
        if (stats.filesProcessed % 50 === 0) {
          console.log(
            `  [${stats.filesProcessed}/${files.length}] ${stats.recordsIndexed.toLocaleString()} imóveis`
          )
        }
      } catch (err: any) {
        console.warn(`[sicar] falha em ${file}: ${err.message}`)
      }
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'SICAR — consultapublica.car.gov.br (shapefile público por município)',
    stats,
  }

  // Compact dump: { manifest, byCpfCnpj: {k: Imovel[]}, byNameKey: {k: Imovel[]} }
  const out = {
    manifest,
    byCpfCnpj: Object.fromEntries(byCpfCnpj.entries()),
    byNameKey: Object.fromEntries(byNameKey.entries()),
  }
  const outFile = join(outputDir, 'sicar-imoveis.json')
  writeFileSync(outFile, JSON.stringify(out, null, 0))

  console.log(
    `\n[sicar] ${stats.recordsIndexed.toLocaleString()} imóveis indexados → ${outFile}`
  )
  console.log(`  • com CPF/CNPJ: ${stats.withCpfCnpj.toLocaleString()}`)
  console.log(`  • com nome:     ${stats.withName.toLocaleString()}`)
  console.log(`  • UFs: ${Object.entries(stats.byUf).map(([k, v]) => `${k}:${v.toLocaleString()}`).join(', ')}`)
  if (stats.recordsIndexed === 0) {
    console.warn(
      `\n[sicar] ⚠️  Nenhum imóvel indexado. Baixe shapefiles em https://consultapublica.car.gov.br/publico/municipios/downloads e coloque em /tmp/sicar/<UF>/`
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
