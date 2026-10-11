// ============================================================
// crm-read — tools read-only do CRM ALETIS
// ============================================================
// Expõe a store de clientes/propostas como ferramentas do LLM. Uso típico:
//   - DealAnalyzer checa propostas existentes antes de recomendar nova
//   - CRMWriter verifica duplicidade (mesmo CNPJ) antes de criar cliente
//   - Orchestrator responde direto "quais clientes tenho em MT?"
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { alixGetClientes, alixGetPropostas, alixGetPropostasInteligentes } from '../../AlixService.js'
import { getClienteDemandaService, type DemandProposalLike } from '../../cliente/ClienteDemandaService.js'
import { preparationCrmClients, scopePreparationCrmRegistry } from './crm-preparation-scope.js'

function normalize(s: string): string {
  return (s || '').toString().replace(/\D/g, '')
}

function digitsOnly(s: string): string {
  return (s || '').replace(/\D/g, '')
}

function valorDivida(c: Record<string, unknown>): number {
  return Number(c.valorTotalDivida ?? c.valorDivida ?? c.dividaTotal ?? 0)
}

export function buildCrmReadTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'buscar_cliente',
    description:
      'Busca cliente no CRM ALETIS por CPF/CNPJ, nome ou ID. Use ANTES de criar cliente (para evitar duplicata) ou ANTES de analisar um lead que já pode ser cliente.',
    input_schema: {
      type: 'object',
      properties: {
        cpfCnpj: { type: 'string' },
        nome: { type: 'string', description: 'parte do nome, case-insensitive' },
        id: { type: 'string' },
      },
    },
  })
  registry['buscar_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const clientes = preparationCrmClients(alixGetClientes())
      const cpfQ = i.cpfCnpj ? digitsOnly(String(i.cpfCnpj)) : null
      const nomeQ = i.nome ? String(i.nome).toUpperCase() : null
      const idQ = i.id ? String(i.id) : null
      const match = clientes.filter((c) => {
        if (idQ && c.id === idQ) return true
        if (cpfQ && (digitsOnly(c.cpfCnpj || c.cpfcnpj || '') === cpfQ)) return true
        if (nomeQ && (c.nome || '').toString().toUpperCase().includes(nomeQ)) return true
        return false
      })
      return {
        count: match.length,
        clientes: match.slice(0, 20).map((c) => ({
          id: c.id,
          nome: c.nome,
          cpfCnpj: c.cpfCnpj || c.cpfcnpj,
          uf: c.uf,
          cidade: c.cidade,
          estagio: c.estagio,
          valorDivida: valorDivida(c),
          consultor: c.consultor,
          grupoFamiliarCount: Array.isArray(c.grupoFamiliar) ? c.grupoFamiliar.length : 0,
        })),
      }
    },
  }

  tools.push({
    name: 'listar_clientes',
    description:
      'Lista clientes do CRM com filtros opcionais (UF, estágio, consultor) e ordenação. Use para mapear portfólio.',
    input_schema: {
      type: 'object',
      properties: {
        uf: { type: 'string' },
        estagio: { type: 'string', description: 'prospeccao, negociacao, acordado, etc' },
        consultor: { type: 'string' },
        limite: { type: 'number', description: 'default 20' },
      },
    },
  })
  registry['listar_clientes'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const clientes = preparationCrmClients(alixGetClientes())
      const uf = i.uf ? String(i.uf).toUpperCase() : null
      const estagio = i.estagio ? String(i.estagio) : null
      const consultor = i.consultor ? String(i.consultor).toUpperCase() : null
      const limite = Number(i.limite) || 20
      let filtered = clientes
      if (uf) filtered = filtered.filter((c) => (c.uf || '').toString().toUpperCase() === uf)
      if (estagio) filtered = filtered.filter((c) => (c.estagio || '').toString() === estagio)
      if (consultor) filtered = filtered.filter((c) => (c.consultor || '').toString().toUpperCase().includes(consultor))
      return {
        totalFiltrado: filtered.length,
        clientes: filtered.slice(0, limite).map((c) => ({
          id: c.id,
          nome: c.nome,
          cpfCnpj: c.cpfCnpj || c.cpfcnpj,
          uf: c.uf,
          cidade: c.cidade,
          estagio: c.estagio,
          valorDivida: valorDivida(c),
          credor: c.credor,
          consultor: c.consultor,
          grupoFamiliarCount: Array.isArray(c.grupoFamiliar) ? c.grupoFamiliar.length : 0,
        })),
      }
    },
  }

  tools.push({
    name: 'listar_propostas_cliente',
    description:
      'Lista propostas (padrão + inteligentes) associadas a um cliente. Use antes de criar nova proposta para não duplicar esforço.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
      },
      required: ['clienteId'],
    },
  })
  registry['listar_propostas_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const clienteId = String(i.clienteId)
      const normais = alixGetPropostas().filter((p) => p.clienteId === clienteId)
      const inteligentes = alixGetPropostasInteligentes().filter((p) => p.clienteId === clienteId)
      return {
        padrao: normais.slice(0, 20).map((p) => ({
          id: p.id,
          titulo: p.titulo,
          demandaId: p.demandaId,
          demandaTitulo: p.demandaTitulo,
          versaoDemanda: p.versaoDemanda,
          credor: p.credor,
          status: p.status,
          valor: p.valorProposta ?? p.valor,
          data: p.ultimaAtualizacao || p.dataCriacao || p.data || p.dataElaboracao,
          resumo: p.extracaoIa?.resumo || p.resumo,
        })),
        inteligentes: inteligentes.slice(0, 20).map((p) => ({
          id: p.id,
          status: p.status,
          valorPrincipal: p.valorPrincipal,
          cenarioEscolhido: p.cenarioEscolhido,
          criadoEm: p.criadoEm,
        })),
        total: normais.length + inteligentes.length,
      }
    },
  }

  tools.push({
    name: 'listar_demandas_cliente',
    description:
      'Lista as frentes de trabalho de um cliente no CRM com assunto, responsável, prioridade, prazo e versões de propostas vinculadas. Use quando o cliente tiver múltiplos assuntos ou várias propostas.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'ID exato do cliente no CRM' },
      },
      required: ['clienteId'],
    },
  })
  registry['listar_demandas_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (i) => {
      const clienteId = String(i.clienteId || '').trim()
      const cliente = alixGetClientes().find((item) => item.id === clienteId)
      if (!cliente) return { ok: false, error: 'Cliente não encontrado no CRM.' }
      const propostasCliente = alixGetPropostas().filter((proposal) => proposal.clienteId === clienteId) as DemandProposalLike[]
      const demandas = await getClienteDemandaService().list(clienteId)
      const hoje = new Date().toISOString().slice(0, 10)
      const demandasAtivas = demandas.filter((demand) => !['concluida', 'cancelada'].includes(demand.status))
      return {
        ok: true,
        cliente: { id: cliente.id, nome: cliente.nome },
        resumo: {
          totalDemandas: demandas.length,
          demandasAtivas: demandasAtivas.length,
          demandasAtrasadas: demandasAtivas.filter((demand) =>
            Boolean((demand.prazoAlvo && demand.prazoAlvo < hoje) || (demand.proximaAcaoEm && demand.proximaAcaoEm < hoje)),
          ).length,
          proximasAcoesHoje: demandasAtivas.filter((demand) => demand.proximaAcaoEm === hoje).length,
          semResponsavel: demandasAtivas.filter((demand) => !demand.responsavel).length,
          checklistPendente: demandas.reduce((total, demand) => total + demand.checklist.filter((item) => !item.concluido).length, 0),
          totalPropostas: propostasCliente.length,
        },
        demandas: demandas.slice(0, 40).map((demand) => ({
          id: demand.id,
          numero: demand.numero,
          codigo: `DEM-${String(demand.numero).padStart(3, '0')}`,
          titulo: demand.titulo,
          assunto: demand.assunto,
          descricao: demand.descricao,
          categoria: demand.categoria,
          status: demand.status,
          prioridade: demand.prioridade,
          responsavel: demand.responsavel,
          credor: demand.credor,
          valorPretendido: demand.valorPretendido,
          prazoAlvo: demand.prazoAlvo,
          proximaAcao: demand.proximaAcao,
          proximaAcaoEm: demand.proximaAcaoEm,
          probabilidade: demand.probabilidade,
          resultadoEsperado: demand.resultadoEsperado,
          propostaPrincipalId: demand.propostaPrincipalId,
          atrasada: Boolean(
            !['concluida', 'cancelada'].includes(demand.status)
            && ((demand.prazoAlvo && demand.prazoAlvo < hoje) || (demand.proximaAcaoEm && demand.proximaAcaoEm < hoje)),
          ),
          checklist: demand.checklist,
          atividadesRecentes: [...demand.eventos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 15),
          propostas: demand.propostaIds.map((id, index) => {
            const proposal = propostasCliente.find((item) => item.id === id)
            return proposal ? {
              id: proposal.id,
              versao: index + 1,
              principal: proposal.id === demand.propostaPrincipalId,
              titulo: proposal.titulo,
              status: proposal.status,
              credor: proposal.credor,
              valorProposta: proposal.valorProposta,
            } : { id, versao: index + 1 }
          }),
        })),
      }
    },
  }

  tools.push({
    name: 'resumo_portfolio_crm',
    description:
      'Resumo agregado do CRM: total de clientes, total de dívida sob gestão, clientes por estágio, top 5 por dívida. Use para visão panorâmica rápida.',
    input_schema: { type: 'object', properties: {} },
  })
  registry['resumo_portfolio_crm'] = {
    spec: tools[tools.length - 1],
    handler: async () => {
      const clientes = preparationCrmClients(alixGetClientes())
      const porEstagio: Record<string, number> = {}
      let totalDivida = 0
      for (const c of clientes) {
        const e = c.estagio || 'outro'
        porEstagio[e] = (porEstagio[e] || 0) + 1
        totalDivida += valorDivida(c)
      }
      const top5 = [...clientes]
        .sort((a, b) => valorDivida(b) - valorDivida(a))
        .slice(0, 5)
        .map((c) => ({ id: c.id, nome: c.nome, uf: c.uf, valorDivida: valorDivida(c), estagio: c.estagio }))
      return {
        totalClientes: clientes.length,
        totalDividaSobGestao: totalDivida,
        porEstagio,
        topPorDivida: top5,
      }
    },
  }

  return { tools, registry: scopePreparationCrmRegistry(registry, alixGetClientes) }
}
