// ============================================================
// ALETIS - visão geral e busca unificada para a ALIX
// ============================================================

import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { alixGetClientes, alixGetPropostas, alixGetPropostasInteligentes } from '../../AlixService.js'
import { getPool, isPgEnabled } from '../../../db/client.js'
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js'
import { getAlixConfirmationStore } from '../AlixConfirmationStore.js'

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

function moneyCents(value: unknown): bigint {
  const raw = String(value ?? '0').trim().replace(/[^\d,.-]/g, '')
  if (!raw) return 0n
  const comma = raw.lastIndexOf(',')
  const dot = raw.lastIndexOf('.')
  const separator = Math.max(comma, dot)
  const decimal = separator >= 0 && raw.length - separator - 1 <= 2
  const integer = (decimal ? raw.slice(0, separator) : raw).replace(/\D/g, '') || '0'
  const fraction = `${decimal ? raw.slice(separator + 1).replace(/\D/g, '') : ''}00`.slice(0, 2)
  return BigInt(integer) * 100n + BigInt(fraction)
}

function centsString(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}

async function documentCounts(): Promise<Record<string, unknown>> {
  if (!isPgEnabled()) return { fonte: 'memoria', cofreCliente: null, intakeAlix: null }
  try {
    const result = await getPool().query(`
      select
        (select count(*)::int from portal_upload) as cofre_cliente,
        (select count(*)::int from alix_document) as intake_alix,
        (select count(distinct cliente_id)::int from portal_upload) as clientes_com_documento
    `)
    const row = result.rows[0] || {}
    return {
      fonte: 'postgres',
      cofreCliente: Number(row.cofre_cliente || 0),
      intakeAlix: Number(row.intake_alix || 0),
      clientesComDocumento: Number(row.clientes_com_documento || 0),
    }
  } catch (error) {
    return { fonte: 'indisponivel', erro: (error as Error).message }
  }
}

function systemOverview() {
  const clientes = alixGetClientes()
  const propostas = alixGetPropostas()
  const propostasInteligentes = alixGetPropostasInteligentes()
  const porEstagio: Record<string, number> = {}
  let dividaCents = 0n
  let clientesSemAcao = 0
  let clientesSemContato = 0
  let clientesSemDivida = 0
  for (const cliente of clientes) {
    const stage = String(cliente.estagio || 'sem_estagio')
    porEstagio[stage] = (porEstagio[stage] || 0) + 1
    const debt = moneyCents(cliente.valorTotalDivida ?? cliente.valorDivida ?? cliente.dividaTotal)
    dividaCents += debt
    if (debt <= 0n) clientesSemDivida += 1
    if (!cliente.proximaAcao) clientesSemAcao += 1
    if (!cliente.telefone && !cliente.whatsapp && !cliente.email) clientesSemContato += 1
  }
  return {
    clientes: {
      total: clientes.length,
      dividaSobGestao: centsString(dividaCents),
      porEstagio,
      qualidadeCadastro: {
        semProximaAcao: clientesSemAcao,
        semContato: clientesSemContato,
        semDividaInformada: clientesSemDivida,
      },
    },
    propostas: {
      total: propostas.length + propostasInteligentes.length,
      padrao: propostas.length,
      inteligentes: propostasInteligentes.length,
    },
  }
}

async function unifiedSearch(query: string, limit: number) {
  const needle = normalize(query)
  const clientes = alixGetClientes()
    .filter((cliente) => normalize([
      cliente.id, cliente.nome, cliente.cpfCnpj, cliente.cpfcnpj,
      cliente.cidade, cliente.uf, cliente.credor,
    ].join(' ')).includes(needle))
    .slice(0, limit)
    .map((cliente) => ({
      id: cliente.id,
      nome: cliente.nome,
      cpfCnpj: cliente.cpfCnpj || cliente.cpfcnpj,
      cidade: cliente.cidade,
      uf: cliente.uf,
      estagio: cliente.estagio,
      credor: cliente.credor,
      valorTotalDivida: cliente.valorTotalDivida ?? cliente.valorDivida ?? cliente.dividaTotal,
    }))

  const proposals = [...alixGetPropostas(), ...alixGetPropostasInteligentes()]
    .filter((proposal) => normalize(JSON.stringify({
      id: proposal.id,
      numero: proposal.numero,
      clienteId: proposal.clienteId,
      status: proposal.status,
      resumo: proposal.resumo,
    })).includes(needle))
    .slice(0, limit)
    .map((proposal) => ({
      id: proposal.id,
      numero: proposal.numero,
      clienteId: proposal.clienteId,
      status: proposal.status,
      resumo: proposal.resumo,
    }))

  let documentos: unknown[] = []
  if (isPgEnabled()) {
    try {
      const result = await getPool().query(
        `select id, cliente_id, nome_original, categoria, enviado_em, metadata
           from portal_upload
          where nome_original ilike $1 or coalesce(metadata::text, '') ilike $1
          order by enviado_em desc
          limit $2`,
        [`%${query.slice(0, 120)}%`, limit],
      )
      documentos = result.rows.map((row) => ({
        id: row.id,
        clienteId: row.cliente_id,
        nome: row.nome_original,
        categoria: row.categoria,
        enviadoEm: row.enviado_em,
        resumoIa: row.metadata?.resumoIa,
        alixDocumentId: row.metadata?.alixDocumentId,
      }))
    } catch {
      documentos = []
    }
  }

  let leads: unknown[] = []
  try {
    leads = getProspeccaoService().buscar({ termo: query, pageSize: limit } as any).leads.slice(0, limit)
  } catch {
    leads = []
  }
  return { query, clientes, propostas: proposals, documentos, leads }
}

export function buildSystemOverviewTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'visao_geral_sistema',
    description: 'Retorna a visão operacional atual do ALETIS: CRM, dívida, estágios, qualidade cadastral, propostas, documentos, prospecção e confirmações pendentes. Use para perguntas amplas como "como está o sistema", "o que é prioridade" ou "me dê o panorama de hoje".',
    input_schema: { type: 'object', properties: {} },
  })
  registry.visao_geral_sistema = {
    spec: tools[tools.length - 1],
    handler: async () => {
      let prospeccao: unknown
      try { prospeccao = getProspeccaoService().stats() } catch (error) { prospeccao = { erro: (error as Error).message } }
      return {
        geradoEm: new Date().toISOString(),
        ...systemOverview(),
        documentos: await documentCounts(),
        prospeccao,
        confirmacoesPendentes: getAlixConfirmationStore().listActive().length,
        modulosAcessiveis: [
          'CRM e grupos familiares', 'documentos e RAG', 'propostas e contratos',
          'Gestão Financeira', 'FARMS e custeio', 'simulador de operações',
          'Deal Room e credores', 'prospecção', 'mercado e clima',
          'CAR/SICAR/SIGEF/INCRA', 'processos judiciais', 'WhatsApp e agenda',
          'processo de assessoria', 'inventário e garantias',
        ],
      }
    },
  }

  tools.push({
    name: 'pesquisar_sistema',
    description: 'Pesquisa simultaneamente CRM, propostas, documentos e prospecção. Use quando houver nome, CPF/CNPJ, número de contrato/proposta, banco ou termo, especialmente se não souber em qual módulo está.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nome, CPF/CNPJ, contrato, proposta, banco ou termo de busca.' },
        limite: { type: 'number', description: 'Resultados por módulo, entre 1 e 20.' },
      },
      required: ['query'],
    },
  })
  registry.pesquisar_sistema = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const query = String(input.query || '').trim()
      if (query.length < 2) return { ok: false, error: 'Informe ao menos 2 caracteres.' }
      const limit = Math.max(1, Math.min(20, Number(input.limite) || 8))
      return { ok: true, ...(await unifiedSearch(query, limit)) }
    },
  }

  return { tools, registry }
}
