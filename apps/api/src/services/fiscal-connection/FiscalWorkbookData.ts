import { load, type CheerioAPI } from 'cheerio'
import Decimal from 'decimal.js'
import type { FiscalDocumentDTO } from '@aletis/shared-types'

export interface FiscalWorkbookRecord {
  document: FiscalDocumentDTO
  xml: string
  sha256: string
  schema: string
  queryId: string
}
export interface FiscalWorkbookInput {
  cliente: { id: string; nome: string }
  generatedAt: string
  filters: Record<string, string | number | undefined>
  records: FiscalWorkbookRecord[]
}
export const WORKBOOK_LIMITS = { records: 5000, xmlBytes: 25 * 1024 * 1024, fields: 150000, items: 25000, cells: 1400000 } as const
export class FiscalWorkbookLimitError extends Error {}
export type Scalar = string | number | Date | null
export type DataRow = Scalar[]
export interface WorkbookNote {
  record: FiscalWorkbookRecord
  key: string
  direction: string
  situation: string
  content: string
  amount: Decimal
  eligible: Decimal
  month: string
  searches: string[]
  items: DataRow[]
  taxes: DataRow[]
  installments: DataRow[]
  payments: DataRow[]
  transport: DataRow[]
  totals: Record<string, string>
}
export const directionLabels: Record<string, string> = { emitida: 'Emitida', recebida: 'Recebida', interesse: 'Outro vínculo', indefinida: 'Não informado' }
export const situationLabels: Record<string, string> = { autorizada: 'Autorizada', cancelada: 'Cancelada', denegada: 'Denegada', nao_informada: 'Não informada' }
export const processingLabels: Record<string, string> = { encaminhado: 'Encaminhado', pendente: 'Pendente', erro: 'Precisa de atenção' }
export const decimal = (v: string | undefined) => new Decimal(v && /^\d+(?:\.\d+)?$/.test(v) ? v : '0')

/** Conversão somente na borda XLSX. Valores além dos 15 dígitos do Excel permanecem texto. */
export function excelDecimal(v: string | Decimal | undefined, monetary = false): Scalar {
  if (v === undefined || v === '') return null
  const d = v instanceof Decimal ? v : new Decimal(v)
  if (!d.isFinite()) throw new FiscalWorkbookLimitError('O documento contém um valor numérico inválido.')
  if (d.sd() > 15 || !new Decimal(d.toNumber()).eq(d)) {
    if (monetary) throw new FiscalWorkbookLimitError('Os valores deste recorte excedem a precisão de 15 dígitos do Excel. Restrinja o período ou use CSV e XML para preservar os valores exatos.')
    return d.toFixed()
  }
  return d.toNumber()
}
export function excelDay(v?: string): Date | null {
  const s = v?.slice(0, 10)
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const date = new Date(s + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s ? date : null
}
type Selection = ReturnType<CheerioAPI>
const local = (name: string) => name.split(':').at(-1) ?? name
const children = (node: Selection, tag: string): Selection => node.children().filter((_, e) => local(e.name) === tag)
const path = (node: Selection, value: string): Selection => value.split('/').reduce((n, t) => children(n, t), node).first()
const value = (node: Selection, field: string) => path(node, field).text().trim() || undefined
const num = (node: Selection, field: string) => { const s = value(node, field); return s && /^\d+(?:\.\d+)?$/.test(s) ? excelDecimal(s) : null }
const firstDescendant = (node: Selection, tag: string) => node.find('*').filter((_, e) => local(e.name) === tag).first()
const freight: Record<string, string> = { '0': 'Por conta do emitente', '1': 'Por conta do destinatário', '2': 'Por conta de terceiros', '3': 'Próprio do emitente', '4': 'Próprio do destinatário', '9': 'Sem transporte' }
const payment: Record<string, string> = { '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito', '05': 'Crédito loja', '10': 'Vale alimentação', '11': 'Vale refeição', '12': 'Vale presente', '13': 'Vale combustível', '14': 'Duplicata mercantil', '15': 'Boleto bancário', '16': 'Depósito bancário', '17': 'PIX dinâmico', '18': 'Transferência / carteira digital', '19': 'Fidelidade / cashback', '20': 'PIX estático', '21': 'Crédito em loja por devolução', '22': 'Pagamento eletrônico não informado', '90': 'Sem pagamento', '99': 'Outros' }

function searchParts(values: string[]): string[] {
  const parts: string[] = ['']
  for (const text of values.filter(Boolean)) {
    // Cada campo fica inteiro para a pesquisa não perder palavras na quebra entre células.
    if (text.length > 30000) throw new FiscalWorkbookLimitError('Um campo excede o limite de pesquisa do Excel. Use um recorte menor ou os XML originais.')
    if (parts.at(-1)!.length + text.length + 1 > 30000) parts.push('')
    parts[parts.length - 1] += text + '\n'
  }
  return parts
}

export function prepareFiscalWorkbook(input: FiscalWorkbookInput) {
  if (input.records.length > WORKBOOK_LIMITS.records || input.records.reduce((n, r) => n + Buffer.byteLength(r.xml), 0) > WORKBOOK_LIMITS.xmlBytes) throw new FiscalWorkbookLimitError('O Excel excede 5.000 registros ou 25 MB de XML. Restrinja o período ou os filtros.')
  // A primeira nota integral vence o resumo; a ordenação da consulta é determinística (mais recente primeiro).
  const unique = new Map<string, FiscalWorkbookRecord>()
  for (const record of input.records) {
    const d = record.document
    if (d.tipo === 'evento') continue
    const key = d.chave || d.id, previous = unique.get(key)
    if (!previous || (d.tipo === 'nfe' && previous.document.tipo !== 'nfe')) unique.set(key, record)
  }
  const fields: DataRow[] = [], events: DataRow[] = [], notes: WorkbookNote[] = []
  const seen = new Set<string>(), eventCounts = new Map<string, number>()
  let itemCount = 0
  for (const record of input.records) {
    const d = record.document
    if (d.tipo === 'evento') eventCounts.set(d.chave || d.id, (eventCounts.get(d.chave || d.id) ?? 0) + 1)
  }
  for (const record of input.records) {
    const d = record.document, x = d.detalhes, key = d.chave || d.id
    if (/<!DOCTYPE|<!ENTITY/i.test(record.xml)) throw new FiscalWorkbookLimitError('XML com declaração não permitida no acervo.')
    const $ = load(record.xml, { xmlMode: true }), root = $.root()
    const info = firstDescendant(root, 'infNFe')
    // Inventário dos campos fiscais de TODOS os registros, inclusive extensões IBS/CBS.
    // Assinaturas/certificados não são conteúdo de análise da planilha.
    const walk = (node: Selection, parent: string, item = '') => {
      node.children().each((_, e) => {
        const el = $(e), tag = local(e.name)
        if (['Signature', 'X509Data', 'KeyInfo', 'SignedInfo', 'SignatureValue'].includes(tag)) return
        const siblings = children(node, tag), ordinal = siblings.index(e) + 1
        const full = `${parent}/${tag}${siblings.length > 1 ? '[' + ordinal + ']' : ''}`
        const itemNumber = tag === 'det' ? el.attr('nItem') ?? String(ordinal) : item
        const add = (field: string, text: string) => {
          for (let start = 0; start < text.length; start += 30000) {
            fields.push([key, d.tipo, d.nsu, itemNumber, full, field, text.slice(start, start + 30000), Math.floor(start / 30000) + 1, d.id])
            if (fields.length > WORKBOOK_LIMITS.fields) throw new FiscalWorkbookLimitError('O detalhamento excede 150.000 campos XML. Restrinja o período ou os filtros; nenhum registro foi truncado.')
          }
        }
        for (const [attribute, text] of Object.entries(e.attribs ?? {})) if (!attribute.startsWith('xmlns')) add('@' + attribute, text)
        if (!el.children().length) { const text = el.text().trim(); if (text) add(tag, text) }
        else walk(el, full, itemNumber)
      })
    }
    // O histórico estadual é um resumo estruturado, não um XML original da NF-e.
    // Seus campos já aparecem em Notas e Registros; não os replica no inventário de XML.
    if (record.schema !== 'sefaz-ms-portal-summary-v1') walk(root, '')
    if (d.tipo === 'evento') {
      const event = firstDescendant(root, 'infEvento'), detail = path(event, 'detEvento')
      events.push([key, d.nsu, x?.eventoTipo ?? value(event, 'tpEvento') ?? '', x?.eventoDescricao ?? value(detail, 'descEvento') ?? '', d.emissao ?? '', x?.codigoStatus ?? '', x?.protocolo ?? '', value(event, 'nSeqEvento') ?? '', value(detail, 'xJust') ?? value(detail, 'xCorrecao') ?? '', d.recebidoEm, d.id, record.sha256])
      continue
    }
    if (seen.has(key) || unique.get(key) !== record) continue
    seen.add(key)
    const situation = situationLabels[d.situacao ?? 'nao_informada'], direction = directionLabels[d.direcao ?? 'indefinida']
    const amount = decimal(d.valor), eligible = d.tipo === 'nfe' && d.situacao === 'autorizada' ? amount : new Decimal(0)
    const note: WorkbookNote = { record, key, direction, situation, content: d.tipo === 'nfe' ? 'XML integral' : 'Resumo', amount, eligible, month: d.emissao?.slice(0, 7) ?? 'Sem data', searches: [], items: [], taxes: [], installments: [], payments: [], transport: [], totals: {} }
    const search = [key, d.nsu, d.numero ?? '', d.serie ?? '', d.emitente ?? '', d.emitenteDocumento ?? '', d.destinatario ?? '', d.destinatarioDocumento ?? '', x?.natureza ?? '', x?.informacoes ?? '']
    children(info, 'det').each((_, e) => {
      const det = $(e), prod = path(det, 'prod'), tax = path(det, 'imposto'), item = det.attr('nItem') ?? '', ncm = value(prod, 'NCM'), cfop = value(prod, 'CFOP'), description = value(prod, 'xProd')
      const icms = path(tax, 'ICMS').children().first(), pis = path(tax, 'PIS').children().first(), cofins = path(tax, 'COFINS').children().first(), ipi = path(tax, 'IPI/IPITrib'), reform = path(tax, 'IBSCBS')
      search.push(value(prod, 'cProd') ?? '', description ?? '', ncm ?? '', cfop ?? '', value(prod, 'CEST') ?? '', value(det, 'infAdProd') ?? '')
      note.items.push([key, d.numero ?? '', excelDay(d.emissao), direction, situation, item, value(prod, 'cProd') ?? '', description ?? '', ncm ?? '', cfop ?? '', value(prod, 'CEST') ?? '', value(prod, 'cEAN') ?? '', value(prod, 'uCom') ?? '', num(prod, 'qCom'), num(prod, 'vUnCom'), num(prod, 'vProd'), num(prod, 'vDesc'), num(prod, 'vFrete'), num(prod, 'vSeg'), num(prod, 'vOutro'), value(prod, 'uTrib') ?? '', num(prod, 'qTrib'), num(prod, 'vUnTrib'), value(prod, 'indTot') ?? '', value(prod, 'xPed') ?? '', value(prod, 'nItemPed') ?? '', value(det, 'infAdProd') ?? ''])
      note.taxes.push([key, item, description ?? '', ncm ?? '', cfop ?? '', value(icms, 'orig') ?? '', value(icms, 'CST') ?? value(icms, 'CSOSN') ?? '', num(icms, 'vBC'), num(icms, 'pICMS'), num(icms, 'vICMS'), num(icms, 'vBCST'), num(icms, 'pICMSST'), num(icms, 'vICMSST'), num(icms, 'vICMSDeson'), num(icms, 'vFCP'), num(icms, 'vICMSMonoRet'), value(pis, 'CST') ?? '', num(pis, 'vBC'), num(pis, 'pPIS'), num(pis, 'vPIS'), value(cofins, 'CST') ?? '', num(cofins, 'vBC'), num(cofins, 'pCOFINS'), num(cofins, 'vCOFINS'), value(ipi, 'CST') ?? value(path(tax, 'IPI/IPINT'), 'CST') ?? '', num(ipi, 'vBC'), num(ipi, 'pIPI'), num(ipi, 'vIPI'), num(tax, 'vTotTrib'), value(reform, 'CST') ?? '', value(reform, 'cClassTrib') ?? '', num(reform, 'gIBSCBS/vBC'), num(reform, 'gIBSCBS/gIBSUF/pIBSUF'), num(reform, 'gIBSCBS/gIBSUF/vIBSUF'), num(reform, 'gIBSCBS/gIBSMun/pIBSMun'), num(reform, 'gIBSCBS/gIBSMun/vIBSMun'), num(reform, 'gIBSCBS/vIBS'), num(reform, 'gIBSCBS/gCBS/pCBS'), num(reform, 'gIBSCBS/gCBS/vCBS'), num(reform, 'gIBSCBSMono/vTotIBSMonoItem'), num(reform, 'gIBSCBSMono/vTotCBSMonoItem')])
    })
    // Metadados antigos continuam exportáveis mesmo antes da reindexação do XML.
    if (!note.items.length) for (const item of x?.itens ?? []) {
      note.items.push([key, d.numero ?? '', excelDay(d.emissao), direction, situation, item.numero, item.codigo ?? '', item.descricao ?? '', item.ncm ?? '', item.cfop ?? '', '', '', item.unidade ?? '', excelDecimal(item.quantidade), excelDecimal(item.valorUnitario), excelDecimal(item.total)])
      search.push(item.codigo ?? '', item.descricao ?? '', item.ncm ?? '', item.cfop ?? '')
    }
    itemCount += note.items.length
    if (itemCount > WORKBOOK_LIMITS.items) throw new FiscalWorkbookLimitError('O Excel excede 25.000 itens. Restrinja o período ou os filtros.')
    for (const installment of x?.parcelas ?? []) note.installments.push([key, d.numero ?? '', direction, situation, installment.numero ?? '', excelDay(installment.vencimento), excelDecimal(installment.valor), installment.valor ?? ''])
    children(path(info, 'pag'), 'detPag').each((_, e) => {
      const node = $(e), code = value(node, 'tPag') ?? ''
      note.payments.push([key, d.numero ?? '', direction, situation, value(node, 'indPag') ?? '', code, value(node, 'xPag') ?? payment[code] ?? 'Código ' + code, num(node, 'vPag'), num(path(info, 'pag'), 'vTroco'), value(node, 'card/CNPJ') ?? '', value(node, 'card/tBand') ?? '', value(node, 'card/cAut') ?? '', value(node, 'vPag') ?? ''])
    })
    const transport = path(info, 'transp'), carrier = path(transport, 'transporta'), vehicle = path(transport, 'veicTransp'), volumes = children(transport, 'vol')
    if (transport.length) {
      const volumeRows = volumes.length ? volumes.toArray().map(e => $(e)) : [root.find('__none__')]
      for (const vol of volumeRows) {
        const mod = value(transport, 'modFrete') ?? ''
        note.transport.push([key, d.numero ?? '', mod, freight[mod] ?? 'Não informado', value(carrier, 'xNome') ?? '', value(carrier, 'CNPJ') ?? value(carrier, 'CPF') ?? '', value(carrier, 'IE') ?? '', value(carrier, 'xEnder') ?? '', value(carrier, 'xMun') ?? '', value(carrier, 'UF') ?? '', value(vehicle, 'placa') ?? '', value(vehicle, 'UF') ?? '', value(vehicle, 'RNTC') ?? '', num(vol, 'qVol'), value(vol, 'esp') ?? '', value(vol, 'marca') ?? '', value(vol, 'nVol') ?? '', num(vol, 'pesoB'), num(vol, 'pesoL')])
      }
    }
    const total = path(info, 'total')
    total.find('*').each((_, e) => { if (!$(e).children().length && /^\d+(?:\.\d+)?$/.test($(e).text().trim())) { const parts: string[] = []; let n = e; while (n !== total[0]) { parts.unshift(local(n.name)); if (!n.parent || n.parent.type !== 'tag') break; n = n.parent } note.totals[parts.join('/')] = $(e).text().trim() } })
    note.searches = searchParts(search)
    notes.push(note)
  }
  return { notes, fields, events, eventCounts }
}
