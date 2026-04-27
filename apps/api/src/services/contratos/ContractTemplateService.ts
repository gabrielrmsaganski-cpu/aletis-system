// ============================================================
// ContractTemplateService — render dos 10 templates ALETIS
// preservando 100% da formatação, fontes, logos e estrutura.
// ============================================================
//
// Como funciona:
//  1. Carrega o template .docx tagueado de templates/{slug}.docx
//  2. Resolve cada placeholder a partir de:
//     - cliente do CRM (via ClienteRepository / AlixService.getClientes)
//     - derived (computado: data hoje, endereço composto, etc.)
//     - input (valores fornecidos pelo chamador)
//  3. Aplica docxtemplater (preserva runs, estilos, headers/footers)
//  4. Devolve Buffer + nome sugerido para download
//
// O original em /documentos/ NÃO é tocado.
// ============================================================
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  CONTRACT_TEMPLATES,
  getTemplateBySlug,
  type ContractTemplate,
  type PlaceholderSpec,
} from './manifest.js'

// __dirname compat ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface OutorganteEntry {
  nome: string
  qualificacao?: string  // 'agricultor', 'agricultora', 'empresário', etc.
  endereco?: string      // endereço completo
  cep?: string
  rg?: string
  orgaoRg?: string
  cpf: string
  /** Pronome para "portador do RG" / "portadora do RG" / "inscrito no CPF" / "inscrita no CPF" */
  genero?: 'M' | 'F'
}

export interface RenderClienteData {
  id: string
  nome: string
  cpf?: string | null
  cnpj?: string | null
  rg?: string | null
  orgaoRg?: string | null
  qualificacao?: string | null
  endereco?: string | null
  numero?: string | null
  bairro?: string | null
  municipio?: string | null
  uf?: string | null
  cep?: string | null
  email?: string | null
  telefone?: string | null
  /** Pronome (M=portador/inscrito, F=portadora/inscrita) — default M */
  genero?: 'M' | 'F'
}

export interface RenderInput {
  templateSlug: string
  cliente: RenderClienteData
  /** Valores manuais para placeholders kind=input ou overrides. */
  inputs?: Record<string, string>
  /** Para NDA / Procuração — array de outorgantes. */
  outorgantes?: OutorganteEntry[]
}

export interface RenderResult {
  buffer: Buffer
  filename: string
  template: ContractTemplate
  resolvedData: Record<string, unknown>
}

// ── Diretório de templates ───────────────────────────────────
const TEMPLATES_DIR = join(__dirname, 'templates')

// ── Helpers de transformação ─────────────────────────────────
function toUpper(s: string): string {
  return (s || '').toUpperCase()
}

function maskCpf(s: string): string {
  const digits = (s || '').replace(/\D/g, '')
  if (digits.length !== 11) return s
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function maskCnpj(s: string): string {
  const digits = (s || '').replace(/\D/g, '')
  if (digits.length !== 14) return s
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

function dateBR(d: Date | string = new Date()): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Tira espaços extras, normaliza separadores em endereço composto. */
function joinNonEmpty(parts: Array<string | null | undefined>, sep: string): string {
  return parts.filter((p) => p && String(p).trim().length > 0).join(sep)
}

/** Constrói endereço composto no formato dos contratos.
 *  Padrão: "Rua X, 123, Bairro Y, Cidade/UF, CEP 12345-000"
 *  withCep=false produz: "Rua X, 123, Bairro Y, Cidade/UF" — usado em
 *  templates onde o CEP aparece em campo separado ({cliente_cep}).
 */
function buildEnderecoCompleto(c: RenderClienteData, withCep = true): string {
  if (!c.endereco && !c.municipio) return ''
  const ruaNum = joinNonEmpty([c.endereco, c.numero], ', ')
  const cidadeUf = joinNonEmpty([c.municipio, c.uf], '/')
  const parts = [ruaNum, c.bairro, cidadeUf]
  if (withCep && c.cep) parts.push(`CEP ${c.cep}`)
  return joinNonEmpty(parts, ', ')
}

/** Sugere qualificação baseada no perfil do cliente. */
function buildQualificacao(c: RenderClienteData): string {
  if (c.qualificacao) return c.qualificacao
  // default agro
  return c.genero === 'F' ? 'agricultora' : 'agricultor'
}

/** Constrói o bloco textual de outorgantes (NDA + Procuração). */
function buildOutorgantesBloco(outorgantes: OutorganteEntry[]): string {
  if (!outorgantes || outorgantes.length === 0) return ''
  const partes: string[] = []
  for (let i = 0; i < outorgantes.length; i++) {
    const o = outorgantes[i]
    const isLast = i === outorgantes.length - 1
    const isMid = i > 0 && i < outorgantes.length - 1
    const masc = (o.genero ?? 'M') === 'M'
    const portador = masc ? 'portador' : 'portadora'
    const inscrito = masc ? 'inscrito' : 'inscrita'
    const rgLabel = o.rg ? `${portador} do RG nº ${o.rg}${o.orgaoRg ? ` ${o.orgaoRg}` : ''}` : ''
    const cpfLabel = `${inscrito} no CPF sob nº ${maskCpf(o.cpf)}`
    const enderecoLabel = o.endereco
      ? `residente na ${o.endereco}${o.cep ? ` - CEP ${o.cep}` : ''}`
      : ''
    const qual = o.qualificacao ?? (masc ? 'agricultor' : 'agricultora')
    const linha = [o.nome, qual, enderecoLabel, rgLabel, cpfLabel]
      .filter((p) => p && p.trim().length > 0)
      .join(', ')
    // separador: ";" entre todos exceto antes do último, que usa "; e "
    let sep = ''
    if (i < outorgantes.length - 1) {
      sep = isMid && i === outorgantes.length - 2 ? '; e ' : '; '
      // simpler: se for o penúltimo → "; e ", senão "; "
      if (i === outorgantes.length - 2) sep = '; e '
      else sep = '; '
    }
    partes.push(linha + sep)
  }
  return partes.join('')
}

// ── Resolução de placeholders ────────────────────────────────
function resolvePlaceholder(spec: PlaceholderSpec, ctx: RenderInput): string {
  const cliente = ctx.cliente
  const inputs = ctx.inputs ?? {}
  // override manual sempre vence (permite editar campo no UI)
  if (Object.prototype.hasOwnProperty.call(inputs, spec.name)) {
    return String(inputs[spec.name] ?? '')
  }
  const src = spec.source
  switch (src.kind) {
    case 'cliente': {
      const path = src.path.split('.')
      let v: any = cliente
      for (const p of path) {
        if (v == null) break
        v = v[p]
      }
      let str = v == null ? '' : String(v)
      if (src.transform === 'upper') str = toUpper(str)
      else if (src.transform === 'cpf-mask') str = maskCpf(str)
      else if (src.transform === 'date-br') str = dateBR(str)
      return str
    }
    case 'derived': {
      switch (src.key) {
        case 'contrato_data_hoje':
          return dateBR()
        case 'contrato_ano':
          return String(new Date().getFullYear())
        case 'cidade_assinatura':
          return cliente.municipio && cliente.uf ? `${cliente.municipio}/${cliente.uf}` : 'Curitiba/PR'
        case 'endereco_completo_from_cliente': {
          // Se o template TAMBÉM tem placeholder cliente_cep separado,
          // omitimos CEP do endereço para evitar duplicação.
          const tplHasCepSeparate = ctx as any
            ? false // resolved per-call below in resolveAllPlaceholders
            : false
          // Note: a flag real fica no contexto agregado; aqui retornamos COM CEP.
          // resolveAllPlaceholders sobrescreve quando detecta cliente_cep.
          return buildEnderecoCompleto(cliente, true)
        }
        case 'qualificacao_from_cliente':
          return buildQualificacao(cliente)
      }
      return ''
    }
    case 'input':
      return src.default ?? ''
    case 'outorgantes_bloco': {
      // Se outorgantes foi passado, usa. Se não, monta um único a partir do cliente.
      const list: OutorganteEntry[] = ctx.outorgantes && ctx.outorgantes.length > 0
        ? ctx.outorgantes
        : [{
            nome: cliente.nome,
            qualificacao: buildQualificacao(cliente),
            endereco: buildEnderecoCompleto(cliente),
            cep: cliente.cep ?? undefined,
            rg: cliente.rg ?? undefined,
            orgaoRg: cliente.orgaoRg ?? undefined,
            cpf: cliente.cpf ?? '',
            genero: cliente.genero ?? 'M',
          }]
      return buildOutorgantesBloco(list)
    }
  }
}

// ── Resolução agregada (todos os placeholders do template) ───
export function resolveAllPlaceholders(
  tpl: ContractTemplate,
  ctx: RenderInput,
): { data: Record<string, string>; missing: string[] } {
  const data: Record<string, string> = {}
  const missing: string[] = []
  // Se o template tem cliente_cep separado, o endereço não deve incluir CEP
  // (evita "...Toledo/PR, CEP 85900-000, CEP 85900-000").
  const tplHasSeparateCep = tpl.placeholders.some((p) => p.name === 'cliente_cep')
  for (const spec of tpl.placeholders) {
    let val = resolvePlaceholder(spec, ctx)
    if (
      spec.name === 'cliente_endereco_completo' &&
      tplHasSeparateCep &&
      !Object.prototype.hasOwnProperty.call(ctx.inputs ?? {}, 'cliente_endereco_completo')
    ) {
      val = buildEnderecoCompleto(ctx.cliente, false)
    }
    data[spec.name] = val
    if (spec.required && (!val || val.trim().length === 0)) {
      missing.push(spec.name)
    }
  }
  return { data, missing }
}

// ── Renderização ─────────────────────────────────────────────
export class ContractTemplateService {
  listTemplates(): ContractTemplate[] {
    return CONTRACT_TEMPLATES.slice()
  }

  getTemplate(slug: string): ContractTemplate | null {
    return getTemplateBySlug(slug)
  }

  /**
   * Renderiza o template com os dados do cliente.
   * Lança Error se template inexistente ou se faltam campos obrigatórios.
   */
  render(input: RenderInput): RenderResult {
    const tpl = this.getTemplate(input.templateSlug)
    if (!tpl) throw new Error(`Template "${input.templateSlug}" não existe`)
    const filePath = join(TEMPLATES_DIR, tpl.templateFile)
    if (!existsSync(filePath)) {
      throw new Error(
        `Arquivo de template não encontrado: ${filePath}. ` +
          `Rode: pnpm --filter @aletis/api exec tsx scripts/build-contract-templates.ts`,
      )
    }

    const { data, missing } = resolveAllPlaceholders(tpl, input)
    if (missing.length > 0) {
      throw new Error(
        `Campos obrigatórios faltando: ${missing.join(', ')}. ` +
          `Forneça via inputs ou complete o cadastro do cliente.`,
      )
    }

    const buf = readFileSync(filePath)
    const zip = new PizZip(buf)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // delimitadores default são { } — match com nossas tags
      delimiters: { start: '{', end: '}' },
      // Não lança erro se algum placeholder no docx não foi fornecido —
      // mantém literal. Mas como já validamos missing, não chega aqui.
      nullGetter: () => '',
    })
    doc.render(data)
    const outBuf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })

    // nome do arquivo: <slug>__<cliente_id>__<YYYYMMDD>.docx
    const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const cliSafe = (input.cliente.id || 'sem-id').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
    const filename = `${tpl.slug}__${cliSafe}__${dia}.docx`

    return { buffer: outBuf, filename, template: tpl, resolvedData: data }
  }

  /**
   * Pré-visualização: retorna os valores resolvidos sem renderizar o docx.
   * Útil para o frontend mostrar "vai ficar assim" antes de baixar.
   */
  preview(input: RenderInput): {
    template: ContractTemplate
    resolved: Record<string, string>
    missing: string[]
  } {
    const tpl = this.getTemplate(input.templateSlug)
    if (!tpl) throw new Error(`Template "${input.templateSlug}" não existe`)
    const { data, missing } = resolveAllPlaceholders(tpl, input)
    return { template: tpl, resolved: data, missing }
  }
}

let _instance: ContractTemplateService | null = null
export function getContractTemplateService(): ContractTemplateService {
  if (!_instance) _instance = new ContractTemplateService()
  return _instance
}
