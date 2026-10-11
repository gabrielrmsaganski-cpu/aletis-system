import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'
import type { GeneratorInput } from './BankTemplateGenerator.js'
import type { ArquivoBancarioGerado } from './types.js'

const BTG_CHECKLIST_FILE = 'CHECK LIST DOCUMENTOS BTG.docx'
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function safeName(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || 'cliente'
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function xml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function paragraph(value: string, options: { bold?: boolean; size?: number; color?: string; center?: boolean } = {}): string {
  const properties = options.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''
  const runProperties = [
    options.bold ? '<w:b/>' : '',
    options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
  ].join('')
  return `<w:p>${properties}<w:r><w:rPr>${runProperties}</w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>`
}

function documentXml(body: string, sectionProperties: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<w:body>${body}${sectionProperties}</w:body></w:document>`
}

function generatedDocx(template: Buffer, body: string): Buffer {
  const zip = new PizZip(template)
  const original = zip.file('word/document.xml')?.asText() || ''
  const sectionProperties = original.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0]
    || '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
  zip.file('word/document.xml', documentXml(body, sectionProperties))
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined
}

function checklistRows(input: GeneratorInput): Array<{ item: string; ready: boolean; note: string }> {
  const properties = input.dados.propriedades ?? []
  return [
    {
      item: 'Identificação PF/PJ e documento',
      ready: hasText(input.cliente.nome) && hasText(input.cliente.cpfCnpj),
      note: 'Nome/razão social e CPF/CNPJ.',
    },
    {
      item: 'Contato e comprovante de endereço',
      ready: hasText(input.cliente.endereco) && (hasText(input.cliente.telefone) || hasText(input.cliente.email)),
      note: 'Confirmar comprovante documental válido.',
    },
    {
      item: 'Grupo econômico e administradores',
      ready: Boolean(input.dados.grupoEconomico?.length || input.dados.empresas?.length),
      note: 'Validar organograma, composição e beneficiários finais.',
    },
    {
      item: 'Áreas próprias e arrendadas',
      ready: Boolean(properties.length || input.dados.arrendamentos?.length),
      note: 'Anexar matrículas, contratos e anuências.',
    },
    {
      item: 'CAR, CCIR e ITR',
      ready: properties.some((property) => hasText(property.car)),
      note: 'Conferir documentos vigentes de todas as áreas.',
    },
    {
      item: 'Quadro de produção e safras',
      ready: Boolean(input.dados.producoes?.length || input.dados.pecuaria?.length),
      note: 'Revisar áreas, produtividade, preços e custos.',
    },
    {
      item: 'Endividamento bancário',
      ready: Boolean(input.dados.dividas?.length),
      note: 'Conciliar com SCR/BACEN e contratos.',
    },
    {
      item: 'Fornecedores, barter e dívidas de terras',
      ready: Boolean(input.dados.fornecedores?.length || input.dados.dividasTerras?.length),
      note: 'Confirmar posição na data-base.',
    },
    {
      item: 'Demonstrações financeiras e faturamento',
      ready: Boolean(input.dados.empresas?.some((company) => company.faturamentoAnual !== undefined)),
      note: 'Anexar três exercícios, balancete e SPED quando aplicável.',
    },
    {
      item: 'Autorização SCR/SISBACEN assinada',
      ready: false,
      note: 'Gerada no pacote; depende de conferência e assinatura.',
    },
  ]
}

function generateBtgChecklist(input: GeneratorInput, template: Buffer): ArquivoBancarioGerado {
  const rows = checklistRows(input)
  const ready = rows.filter((row) => row.ready).length
  const body = [
    paragraph('ALETIS · CHECKLIST DOCUMENTAL BTG PACTUAL', { bold: true, size: 32, color: '173F35', center: true }),
    paragraph(`Cliente: ${input.cliente.nome || 'Não informado'}`, { bold: true, size: 24 }),
    paragraph(`CPF/CNPJ: ${input.cliente.cpfCnpj || 'Não informado'}  |  Data-base: ${input.dados.dataBase || new Date().toISOString().slice(0, 10)}`),
    paragraph(`Prontidão automática: ${ready}/${rows.length} itens.`, { bold: true, color: ready === rows.length ? '1B7F5B' : '9A6A10' }),
    paragraph(''),
    ...rows.flatMap((row, index) => [
      paragraph(`${row.ready ? '☒' : '☐'} ${index + 1}. ${row.item}`, { bold: true }),
      paragraph(`   ${row.note}`),
    ]),
    paragraph(''),
    paragraph('Observação: o status indica presença de dados no ALETIS; não substitui a conferência dos anexos nem a validação do banco.', { size: 18, color: '666666' }),
  ].join('')
  return {
    modeloId: 'btg-checklist-documentos',
    filename: `Checklist_Documentos_BTG_${safeName(input.cliente.nome || 'cliente')}_${stamp()}.docx`,
    buffer: generatedDocx(template, body),
    contentType: DOCX_TYPE,
    celulasGravadas: rows.length,
    celulasHigienizadas: 0,
    formulasAjustadas: 0,
    observacoes: [
      'Checklist BTG personalizado a partir dos requisitos do modelo oficial.',
      `${ready} de ${rows.length} itens possuem dados no sistema; anexos continuam sujeitos à conferência.`,
    ],
  }
}

function generateBtgAuthorization(input: GeneratorInput, template: Buffer): ArquivoBancarioGerado {
  const date = new Date().toLocaleDateString('pt-BR')
  const body = [
    paragraph('AUTORIZAÇÃO PARA CONSULTA AO SCR / SISBACEN', { bold: true, size: 30, color: '173F35', center: true }),
    paragraph('Ao Banco BTG Pactual S.A.', { bold: true }),
    paragraph(''),
    paragraph(
      `Eu/Nós, ${input.cliente.nome || '________________________________'}, inscrito(a) no CPF/CNPJ sob nº `
      + `${input.cliente.cpfCnpj || '____________________________'}, autorizo(amos) o Banco BTG Pactual S.A. a consultar `
      + 'informações em meu/nosso nome no Sistema de Informações de Crédito do Banco Central do Brasil (SCR), '
      + 'exclusivamente para análise, concessão, acompanhamento e gestão de operações de crédito.',
    ),
    paragraph(
      'Declaro(amos) ciência de que o SCR registra informações sobre operações de crédito e de que eventuais pedidos '
      + 'de correção devem ser encaminhados à instituição responsável pela informação, observada a regulamentação aplicável.',
    ),
    paragraph(
      'Esta autorização permanece válida durante a análise e o relacionamento de crédito, podendo ser revogada por escrito, '
      + 'sem prejuízo das consultas necessárias ao cumprimento de obrigações legais e regulatórias.',
    ),
    paragraph(''),
    paragraph(`Local e data: ${[input.cliente.cidade, input.cliente.uf].filter(Boolean).join('/') || '________________'} , ${date}.`),
    paragraph(''),
    paragraph('Assinatura: __________________________________________________________'),
    paragraph(`Nome: ${input.cliente.nome || '________________________________'}`),
    paragraph(`CPF/CNPJ: ${input.cliente.cpfCnpj || '____________________________'}`),
    paragraph(''),
    paragraph('Documento editável gerado pelo ALETIS. Submeter à conferência jurídica e assinatura antes do envio.', { size: 18, color: '666666' }),
  ].join('')
  return {
    modeloId: 'btg-sisbacen-pj-pf',
    filename: `Autorizacao_SCR_SISBACEN_BTG_${safeName(input.cliente.nome || 'cliente')}_${stamp()}.docx`,
    buffer: generatedDocx(template, body),
    contentType: DOCX_TYPE,
    celulasGravadas: 5,
    celulasHigienizadas: 0,
    formulasAjustadas: 0,
    observacoes: [
      'Versão DOCX editável gerada para substituir o arquivo legado .doc.',
      'Identificação, documento, local e data foram preenchidos automaticamente.',
      'Exige conferência jurídica e assinatura antes do envio.',
    ],
  }
}

export function generateSupportingDocuments(input: GeneratorInput): ArquivoBancarioGerado[] {
  if (input.banco !== 'btg') return []
  const path = join(input.sourceDir, BTG_CHECKLIST_FILE)
  if (!existsSync(path)) return []
  const template = readFileSync(path)
  return [
    generateBtgChecklist(input, template),
    generateBtgAuthorization(input, template),
  ]
}
