// ============================================================
// crm-read — tools read-only do CRM ALETIS
// ============================================================
// Expõe a store de clientes/propostas como ferramentas do LLM. Uso típico:
//   - DealAnalyzer checa propostas existentes antes de recomendar nova
//   - CRMWriter verifica duplicidade (mesmo CNPJ) antes de criar cliente
//   - Orchestrator responde direto "quais clientes tenho em MT?"
// ============================================================
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
import { alixGetClientes, alixGetPropostas, alixGetPropostasInteligentes } from '../../AlixService.js'

function normalize(s: string): string {
  return (s || '').toString().replace(/\D/g, '')
}

function digitsOnly(s: string): string {
  return (s || '').replace(/\D/g, '')
}

export function buildCrmReadTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

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
      const clientes = alixGetClientes()
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
          valorDivida: c.valorDivida,
          consultor: c.consultor,
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
      const clientes = alixGetClientes()
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
          valorDivida: c.valorDivida,
          credor: c.credor,
          consultor: c.consultor,
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
          numero: p.numero,
          status: p.status,
          valor: p.valor,
          data: p.data || p.dataElaboracao,
          resumo: p.resumo,
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
    name: 'resumo_portfolio_crm',
    description:
      'Resumo agregado do CRM: total de clientes, total de dívida sob gestão, clientes por estágio, top 5 por dívida. Use para visão panorâmica rápida.',
    input_schema: { type: 'object', properties: {} },
  })
  registry['resumo_portfolio_crm'] = {
    spec: tools[tools.length - 1],
    handler: async () => {
      const clientes = alixGetClientes()
      const porEstagio: Record<string, number> = {}
      let totalDivida = 0
      for (const c of clientes) {
        const e = c.estagio || 'outro'
        porEstagio[e] = (porEstagio[e] || 0) + 1
        totalDivida += Number(c.valorDivida || 0)
      }
      const top5 = [...clientes]
        .sort((a, b) => (Number(b.valorDivida || 0) - Number(a.valorDivida || 0)))
        .slice(0, 5)
        .map((c) => ({ id: c.id, nome: c.nome, uf: c.uf, valorDivida: Number(c.valorDivida || 0), estagio: c.estagio }))
      return {
        totalClientes: clientes.length,
        totalDividaSobGestao: totalDivida,
        porEstagio,
        topPorDivida: top5,
      }
    },
  }

  return { tools, registry }
}
