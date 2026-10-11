import { randomUUID } from 'node:crypto'
import { getPool, isPgEnabled } from '../../db/client.js'
import { upsertCliente, upsertClienteStrict } from '../../db/ClienteRepository.js'
import { withCrmWriteLock } from '../../lib/crm-write-lock.js'
import { clientes } from '../../routes/clientes.js'

export interface WhatsAppLead {
  clienteId: string
  created: boolean
  nome: string
  telefone: string
}

function cleanPhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function findLocalByPhone(phone: string): any | null {
  const clean = cleanPhone(phone)
  for (const c of clientes.values() as Iterable<any>) {
    if (cleanPhone(c.telefone) === clean || cleanPhone(c.whatsapp) === clean) return c
  }
  return null
}

function buildLead(input: {
  telefone: string
  nomeContato?: string | null
  instanceName: string
  waJid?: string | null
}): any {
  const clean = cleanPhone(input.telefone)
  const now = today()
  const id = `cli-wa-${clean || randomUUID().slice(0, 8)}`
  const nome = input.nomeContato?.trim() || `Lead WhatsApp ${clean.slice(-4) || id.slice(-4)}`
  return {
    id,
    nome,
    cpfCnpj: `WA-${clean || id}`,
    tipo: 'pessoa_fisica',
    cidade: 'A definir',
    uf: 'BR',
    telefone: clean,
    whatsapp: clean,
    email: '',
    atividade: '',
    areaTotalHa: 0,
    culturas: [],
    estagio: 'prospeccao',
    consultor: process.env.GOOGLE_CALENDAR_CONSULTOR_NAME || 'Christian',
    escritorio: 'ALETIS',
    credor: 'A definir',
    valorTotalDivida: 0,
    valorTotalPago: 0,
    dividas: [],
    pagamentos: [],
    timeline: [
      {
        data: now,
        tipo: 'contato',
        descricao: 'Lead criado automaticamente via WhatsApp IA',
        detalhes: `Origem: Evolution API (${input.instanceName})`,
      },
    ],
    dataCadastro: now,
    ultimaAtualizacao: now,
    observacoes: `Lead criado pelo WhatsApp IA. JID: ${input.waJid || 'nao informado'}.`,
    tags: ['whatsapp', 'evolution-api', 'lead-automatico'],
    leadOrigem: {
      origem: 'whatsapp',
      canal: 'evolution-api',
      instanceName: input.instanceName,
      waJid: input.waJid,
      criadoEm: new Date().toISOString(),
    },
  }
}

export class CrmLeadService {
  async findByPhone(phone: string): Promise<any | null> {
    const local = findLocalByPhone(phone)
    if (local) return local

    if (!isPgEnabled()) return null
    const clean = cleanPhone(phone)
    try {
      const res = await getPool().query(
        `SELECT payload
           FROM cliente
          WHERE regexp_replace(COALESCE(telefone, ''), '\\D', '', 'g') = $1
             OR regexp_replace(COALESCE(payload->>'whatsapp', ''), '\\D', '', 'g') = $1
          LIMIT 1`,
        [clean],
      )
      return res.rows[0]?.payload ?? null
    } catch (err) {
      console.warn('[CrmLeadService] findByPhone falhou:', (err as Error).message)
      return null
    }
  }

  async ensureLead(input: {
    telefone: string
    nomeContato?: string | null
    instanceName: string
    waJid?: string | null
  }): Promise<WhatsAppLead> {
    const existing = await this.findByPhone(input.telefone)
    if (existing?.id) {
      return {
        clienteId: String(existing.id),
        created: false,
        nome: String(existing.nome || input.nomeContato || 'Cliente WhatsApp'),
        telefone: cleanPhone(existing.telefone || existing.whatsapp || input.telefone),
      }
    }

    const lead = buildLead(input)
    clientes.set(lead.id, lead)
    await upsertCliente(lead)
    return {
      clienteId: lead.id,
      created: true,
      nome: lead.nome,
      telefone: lead.telefone,
    }
  }

  async updateLeadStatus(clienteId: string | null | undefined, status: string, note?: string): Promise<void> {
    if (!clienteId) return
    return withCrmWriteLock(`cliente:${clienteId}`, async () => {
      const local = clientes.get(clienteId) as any
      if (!local) return
      const now = today()
      const proposedStage = status === 'Reunião agendada' || status === 'Elegível' ? 'analise'
        : status === 'Cliente ativo' ? 'acordo'
          : status === 'Atendimento humano' ? 'negociacao' : undefined
      const stages = ['lead', 'prospeccao', 'qualificacao', 'analise', 'proposta', 'negociacao', 'acordo', 'acompanhamento', 'concluido', 'encerrado']
      // Estado da conversa não reabre nem regride a jornada comercial existente.
      const estagio = proposedStage && stages.indexOf(local.estagio) >= 0 && stages.indexOf(proposedStage) > stages.indexOf(local.estagio)
        ? proposedStage : local.estagio
      const updated = {
        ...local,
        estagio,
        ultimaAtualizacao: now,
        tags: Array.from(new Set([...(local.tags || []), 'whatsapp'])),
        timeline: [
          ...(local.timeline || []),
          { data: now, tipo: estagio === local.estagio ? 'contato' : 'estagio', descricao: `WhatsApp IA: ${status}`, detalhes: note },
        ],
      }
      await upsertClienteStrict(updated)
      clientes.set(clienteId, updated)
    })
  }
}

let cached: CrmLeadService | null = null
export function getCrmLeadService(): CrmLeadService {
  if (!cached) cached = new CrmLeadService()
  return cached
}
