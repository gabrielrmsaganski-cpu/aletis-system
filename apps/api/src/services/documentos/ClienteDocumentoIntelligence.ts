import type { PortalUploadRow } from '../../db/schema.js'

type Metadata = Record<string, unknown>

export interface DocumentoClassificacao {
  categoriaInteligente:
    | 'identidade'
    | 'endereco'
    | 'patrimonio_imovel'
    | 'ambiental_car'
    | 'fiscal_rural'
    | 'contrato_arrendamento'
    | 'contrato_bancario'
    | 'renegociacao'
    | 'processo_judicial'
    | 'maquinario'
    | 'divida_confissao'
    | 'proposta'
    | 'revisao_ocr'
    | 'outros'
  grupoDocumento: 'cadastro' | 'patrimonio' | 'financeiro' | 'juridico' | 'operacional' | 'revisao'
  prioridade: 'alta' | 'media' | 'baixa'
  precisaRevisao: boolean
  sinais: string[]
}

export interface DocumentoDossie {
  total: number
  grupos: Array<{
    grupo: DocumentoClassificacao['grupoDocumento']
    total: number
    categorias: Record<string, number>
    documentos: Array<{ id: string; nome: string; categoriaInteligente: string; prioridade: string; precisaRevisao: boolean }>
  }>
  documentosRevisao: Array<{ id: string; nome: string; motivo: string }>
  sinaisPrincipais: string[]
  pessoasRelacionadas: string[]
}

function textOf(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function metadataOf(row: Pick<PortalUploadRow, 'metadata'>): Metadata {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Metadata
    : {}
}

function contains(text: string, ...patterns: RegExp[]): boolean {
  return patterns.some((rx) => rx.test(text))
}

function baseText(row: Pick<PortalUploadRow, 'nomeOriginal' | 'categoria' | 'mime' | 'metadata'>): string {
  const metadata = metadataOf(row)
  return [
    row.nomeOriginal,
    row.categoria,
    row.mime,
    metadata.resumoIa,
    metadata.entitySummary,
    metadata.observacaoConsultor,
    metadata.analiseErro,
  ].map(textOf).join(' ').toLowerCase()
}

export function classificarDocumentoCliente(row: Pick<PortalUploadRow, 'nomeOriginal' | 'categoria' | 'mime' | 'metadata' | 'tamanho'>): DocumentoClassificacao {
  const text = baseText(row)
  const nome = textOf(row.nomeOriginal).toLowerCase()
  const sinais: string[] = []
  const hasErro = contains(text, /erro|falha|too large|excede|sem texto|ocr|validation[-\s]?history|validacao|valida[cç][aã]o/)
  if (hasErro) sinais.push('revisar leitura/OCR')

  let categoria: DocumentoClassificacao['categoriaInteligente'] = 'outros'
  let grupo: DocumentoClassificacao['grupoDocumento'] = 'operacional'
  let prioridade: DocumentoClassificacao['prioridade'] = 'baixa'

  if (contains(nome, /agravo|ac[oó]rd[aã]o|processo|execu[cç][aã]o|leil[aã]o|santander|judicial/) || contains(text, /agravo|ac[oó]rd[aã]o|processo|execu[cç][aã]o|leil[aã]o|tribunal|judicial/)) {
    categoria = 'processo_judicial'; grupo = 'juridico'; prioridade = 'alta'; sinais.push('processo judicial')
  } else if (contains(nome, /confiss[aã]o de d[ií]vida/) || contains(text, /confiss[aã]o de d[ií]vida/)) {
    categoria = 'divida_confissao'; grupo = 'financeiro'; prioridade = 'alta'; sinais.push('renegociação/confissão')
  } else if (contains(nome, /renegocia|termo extrajudicial|aditamento/) || contains(text, /renegocia|termo extrajudicial|aditamento/)) {
    categoria = 'renegociacao'; grupo = 'financeiro'; prioridade = 'alta'; sinais.push('renegociação/confissão')
  } else if (contains(nome, /arrendamento|arrendador|arrendat[aá]rio|pocilga|aditivo/) || contains(text, /arrendamento|arrendador|arrendat[aá]rio|pocilga|aditivo/)) {
    categoria = 'contrato_arrendamento'; grupo = 'financeiro'; prioridade = 'alta'; sinais.push('arrendamento rural')
  } else if (contains(nome, /john\s*deere|jhon\s*deere|banco|ccb\b|finame|c[eé]dula|contrato.*cr[eé]dito/) || contains(text, /john\s*deere|jhon\s*deere|banco|ccb\b|finame|c[eé]dula|contrato.*cr[eé]dito|saldo devedor|atraso/)) {
    categoria = 'contrato_bancario'; grupo = 'financeiro'; prioridade = 'alta'; sinais.push('contrato bancário')
  } else if (contains(nome, /\bcar\b|cadastro ambiental rural|recibo de inscri[cç][aã]o|sicar/) || contains(text, /\bcar\b|cadastro ambiental rural|recibo de inscri[cç][aã]o|sicar/)) {
    categoria = 'ambiental_car'; grupo = 'patrimonio'; prioridade = 'alta'; sinais.push('CAR/SICAR')
  } else if (contains(nome, /\bccir\b|\bitr\b|cafir|cib\b|incra|certificado de cadastro/) || contains(text, /\bccir\b|\bitr\b|cafir|cib\b|incra|certificado de cadastro/)) {
    categoria = 'fiscal_rural'; grupo = 'patrimonio'; prioridade = 'alta'; sinais.push('CCIR/ITR/CAFIR')
  } else if (contains(nome, /matr[ií]cula|\bmat\.?\b|\bmat\b|registro de im[oó]veis|area arrendada/) || contains(text, /matr[ií]cula|registro de im[oó]veis|im[oó]vel rural|gleba/)) {
    categoria = 'patrimonio_imovel'; grupo = 'patrimonio'; prioridade = 'alta'; sinais.push('matrícula/imóvel')
  } else if (contains(nome, /pulverizador|trator|colheitadeira|implemento|stara|maquin[aá]rio/) || contains(text, /pulverizador|trator|colheitadeira|implemento|stara|maquin[aá]rio/)) {
    categoria = 'maquinario'; grupo = 'patrimonio'; prioridade = 'media'; sinais.push('máquina/implemento')
  } else if (contains(nome, /proposta|proposal|term sheet/) || contains(text, /proposta|proposal|term sheet|condi[cç][oõ]es comerciais/)) {
    categoria = 'proposta'; grupo = 'financeiro'; prioridade = 'alta'; sinais.push('proposta')
  } else if (contains(nome, /\bcnh\b|identidade|\brg\b|documento pessoal/) || contains(text, /\bcnh\b|documento pessoal/)) {
    categoria = 'identidade'; grupo = 'cadastro'; prioridade = 'media'; sinais.push('documento pessoal')
  } else if (contains(nome, /endere[cç]o|resid[eê]ncia|comprovante de resid/) || contains(text, /comprovante de resid/)) {
    categoria = 'endereco'; grupo = 'cadastro'; prioridade = 'media'; sinais.push('comprovante de endereço')
  }

  if (hasErro && categoria === 'outros') {
    categoria = 'revisao_ocr'
    grupo = 'revisao'
    prioridade = 'media'
  }

  const tamanho = Number(row.tamanho ?? 0)
  const precisaRevisao = hasErro || (tamanho > 20 * 1024 * 1024) || categoria === 'revisao_ocr'
  return {
    categoriaInteligente: categoria,
    grupoDocumento: grupo,
    prioridade,
    precisaRevisao,
    sinais: Array.from(new Set(sinais)).slice(0, 6),
  }
}

export function buildClienteDocumentoDossie(rows: PortalUploadRow[]): DocumentoDossie {
  const byGroup = new Map<DocumentoClassificacao['grupoDocumento'], {
    grupo: DocumentoClassificacao['grupoDocumento']
    total: number
    categorias: Record<string, number>
    documentos: Array<{ id: string; nome: string; categoriaInteligente: string; prioridade: string; precisaRevisao: boolean }>
  }>()
  const documentosRevisao: DocumentoDossie['documentosRevisao'] = []
  const sinais = new Set<string>()
  const pessoas = new Set<string>()

  for (const row of rows) {
    const cls = classificarDocumentoCliente(row)
    const group = byGroup.get(cls.grupoDocumento) ?? { grupo: cls.grupoDocumento, total: 0, categorias: {}, documentos: [] }
    group.total += 1
    group.categorias[cls.categoriaInteligente] = (group.categorias[cls.categoriaInteligente] ?? 0) + 1
    group.documentos.push({
      id: row.id,
      nome: row.nomeOriginal,
      categoriaInteligente: cls.categoriaInteligente,
      prioridade: cls.prioridade,
      precisaRevisao: cls.precisaRevisao,
    })
    byGroup.set(cls.grupoDocumento, group)
    cls.sinais.forEach((s) => sinais.add(s))
    if (cls.precisaRevisao) {
      documentosRevisao.push({ id: row.id, nome: row.nomeOriginal, motivo: cls.sinais[0] ?? 'revisar classificação/leitura' })
    }

    const metadata = metadataOf(row)
    const text = [
      row.nomeOriginal,
      metadata.resumoIa,
      metadata.entitySummary,
      metadata.observacaoConsultor,
    ].map(textOf).join(' ')
    const matches = text.match(/\b[A-ZÁÀÂÃÉÈÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÈÊÍÓÔÕÚÇ' -]{4,80}\b/g) ?? []
    for (const raw of matches.slice(0, 20)) {
      const cleaned = raw.replace(/\s+/g, ' ').trim()
      if (cleaned.length >= 8 && !/DOCUMENTO|FAZENDA|BANCO|CONTRATO|MATR[IÍ]CULA|CADASTRO/i.test(cleaned)) {
        pessoas.add(cleaned)
      }
    }
  }

  return {
    total: rows.length,
    grupos: Array.from(byGroup.values()).sort((a, b) => b.total - a.total),
    documentosRevisao: documentosRevisao.slice(0, 30),
    sinaisPrincipais: Array.from(sinais).slice(0, 20),
    pessoasRelacionadas: Array.from(pessoas).slice(0, 20),
  }
}
