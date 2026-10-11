import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { randomUUID } from 'crypto'
import { generatePropostaPdf } from '../services/PdfGenerator.js'
import {
  gerarPropostaInteligente,
  type DadosClienteProposta,
  type ContextoCredito,
  type EventoAdverso,
  type ParametrosNegociacao,
  type PropostaInteligente,
} from '../services/PropostaGeneratorInteligente.js'
import {
  upsertProposta as pgUpsertProposta,
  upsertPropostaStrict as pgUpsertPropostaStrict,
  listPropostas as pgListPropostas,
  getProposta as pgGetProposta,
  deleteProposta as pgDeleteProposta,
} from '../db/PropostaRepository.js'
import { isPgEnabled } from '../db/client.js'
import { auditAsync } from '../db/AuditLog.js'
import { isMimeAllowed } from '../lib/upload-validation.js'
import { getDocumentIntakeService } from '../services/alix/intake/DocumentIntakeService.js'
import { attachAlixDocumentToCliente } from '../services/alix/intake/DocumentVaultBridgeService.js'
import { generateStructured } from '../services/llm/OpenAIClient.js'
import { MODEL_REGISTRY, getModelForRole } from '../services/llm/LLMConfig.js'
import { rememberPropostaCliente } from '../services/alix/memory/AlixMemoryEvents.js'
import { getClienteDemandaService } from '../services/cliente/ClienteDemandaService.js'
import { getDealRoomService } from '../services/dealRoom/DealRoomService.js'
import { getClientCoreService } from '../services/core/ClientCoreService.js'
import { propostaPatchSchema } from '../lib/crm-write-validation.js'
import { withCrmWriteLock } from '../lib/crm-write-lock.js'
import { resolveInternalSession } from '../lib/internal-auth.js'
import { deleteProposalWorkflow, prepareProposalPatch, updateProposalWorkflow, type WorkflowProposal } from '../services/propostas/ProposalWorkflowService.js'

/* ========================================================================
 *  Tipos
 * ======================================================================== */

interface ItemProposta {
  descricao: string
  valor: number
  tipo: 'pagamento' | 'dacao' | 'compensacao' | 'desconto' | 'parcela'
  data?: string
}

export interface Proposta {
  id: string
  revision?: number
  clienteId: string
  demandaId?: string
  demandaTitulo?: string
  versaoDemanda?: number
  assunto?: string
  clienteNome: string
  credor: string
  titulo: string
  tipo: 'liquidacao' | 'renegociacao' | 'memoria_calculo' | 'parcelamento' | 'acordo_judicial'
  status: 'rascunho' | 'em_analise' | 'enviada' | 'aceita' | 'rejeitada' | 'expirada'
  valorDivida: number
  valorProposta: number
  descontoPercentual: number
  itens: ItemProposta[]
  condicoes: string[]
  fundamentacao: string
  dataCriacao: string
  dataValidade: string
  ultimaAtualizacao: string
  pdfUrl: string | null
  observacoes: string
  arquivoOrigem?: {
    alixDocumentId?: string
    alixSessionId?: string
    filename?: string
    mimetype?: string
    sizeBytes?: number
    cofreUploadId?: string
    cofreDownloadUrl?: string
  }
  extracaoIa?: {
    origem: 'openai' | 'fallback' | 'manual'
    estado?: 'queued' | 'processing' | 'completed' | 'completed_basic' | 'failed'
    modelo?: string
    resumo?: string
    confianca?: number
    camposAusentes?: string[]
    textoExtraidoChars?: number
    erro?: string
    atualizadoEm?: string
  }
}

/* ========================================================================
 *  Dados em memória
 * ======================================================================== */

export const propostas: Map<string, Proposta> = new Map()
export const propostasInteligentes: Map<string, PropostaInteligente> = new Map()

/** Publica a criação somente depois de o banco confirmar a gravação. */
async function persistProposta(p: Proposta, ator = 'system'): Promise<void> {
  await pgUpsertPropostaStrict(p as unknown as Parameters<typeof pgUpsertPropostaStrict>[0])
  publishProposta(p, ator)
}

/** Entrada compartilhada entre CRM, ALIX e enriquecimento de documentos. */
export async function updatePropostaCommand(
  id: string,
  input: unknown,
  actor: { id?: string; nome?: string } = { nome: 'sistema' },
) {
  const parsed = propostaPatchSchema.safeParse(input)
  if (!parsed.success) {
    throw Object.assign(new Error('Atualização da proposta inválida'), {
      statusCode: 400, code: 'invalid_proposal_patch', detalhes: parsed.error.flatten(),
    })
  }
  const { expectedRevision, ...patch } = parsed.data
  return withCrmWriteLock(`proposta:${id}`, async () => {
    if (isPgEnabled()) {
      const result = await updateProposalWorkflow({ id, patch, expectedRevision, actor })
      const proposta = result.proposta as unknown as Proposta
      // O serviço já confirmou proposta, vínculos e auditoria na mesma transação.
      propostas.set(id, proposta)
      if (result.changed) {
        try { rememberPropostaCliente(proposta, 'Proposta atualizada no CRM') } catch { /* memória auxiliar não invalida commit */ }
      }
      return { success: true, data: proposta, meta: { negociacaoId: result.negociacaoId, contratoId: result.contratoId } }
    }

    // Modo local de desenvolvimento. Produção nunca usa Map após falha do PG.
    const previous = propostas.get(id)
    if (!previous) throw Object.assign(new Error('Proposta não encontrada'), { statusCode: 404, code: 'proposal_not_found' })
    const prepared = prepareProposalPatch(previous as unknown as WorkflowProposal, patch, expectedRevision)
    const proposta = prepared.proposta as unknown as Proposta
    let negociacaoId: string | undefined
    let contratoId: string | undefined
    try {
      const demanda = await getClienteDemandaService().ensureForProposal(proposta)
      if (['enviada', 'aceita'].includes(proposta.status)) {
        const vinculo = await getDealRoomService().ensureForProposal(proposta, actor)
        negociacaoId = vinculo.negociacao.id
        if (proposta.status === 'aceita') {
          const draft = await getClientCoreService().ensureContractDraftForAcceptedProposal({
            clienteId: proposta.clienteId, propostaId: proposta.id, negociacaoId,
            demandaId: demanda.demanda.id, titulo: proposta.titulo, credor: proposta.credor,
            tipo: tipoContratoParaProposta(proposta.tipo), valorDivida: String(proposta.valorDivida), valorProposta: String(proposta.valorProposta),
          }, actor.id || actor.nome || 'sistema')
          contratoId = draft.contract.id
        }
        if (previous.status !== proposta.status) await getClienteDemandaService().update(proposta.clienteId, demanda.demanda.id, {
          status: proposta.status === 'aceita' ? 'aprovada' : 'negociacao', autor: actor.nome || actor.id || 'sistema',
        })
      }
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error('Não foi possível vincular a proposta.'), { statusCode: 422 })
    }
    if (prepared.changed) {
      proposta.revision = (previous.revision || 0) + 1
      proposta.ultimaAtualizacao = todayIso()
      await pgUpsertPropostaStrict(proposta as unknown as Parameters<typeof pgUpsertPropostaStrict>[0])
      publishProposta(proposta, actor.id || actor.nome || 'sistema', previous)
    }
    return { success: true, data: proposta, meta: { negociacaoId, contratoId } }
  })
}

/** Publicação após persistência para os comandos de edição. */
function publishProposta(p: Proposta, ator = 'system', anterior = propostas.get(p.id)): void {
  propostas.set(p.id, p)
  if (p.clienteId) {
    rememberPropostaCliente(p, anterior ? 'Proposta atualizada no CRM' : 'Proposta criada no CRM')
  }
  auditAsync({
    ator,
    acao: anterior ? 'update' : 'create',
    recurso: `proposta:${p.id}`,
    dadosAntes: anterior ? { status: anterior.status, valorProposta: anterior.valorProposta } : null,
    dadosDepois: { status: p.status, valorProposta: p.valorProposta, clienteId: p.clienteId },
  })
}

/** Mesmo padrão para PropostaInteligente (15 seções). */
function persistPropostaInteligente(p: PropostaInteligente, ator = 'system'): void {
  const anterior = propostasInteligentes.get(p.id)
  propostasInteligentes.set(p.id, p)
  void pgUpsertProposta(p as unknown as Parameters<typeof pgUpsertProposta>[0])
  const cliente = (p as unknown as { cliente?: { id?: string; nome?: string } }).cliente
  if (cliente?.id) {
    rememberPropostaCliente({
      id: p.id,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      credor: (p as any).credor,
      titulo: (p as any).secoes?.capa?.titulo || 'Proposta inteligente',
      valorDivida: (p as any).metricasChave?.valorDividaAtualizado,
      valorProposta: (p as any).metricasChave?.valorPropostaEstruturada,
      descontoPercentual: (p as any).metricasChave?.descontoEstimado,
      status: 'gerada',
      dataValidade: (p as any).dataValidade,
    }, anterior ? 'Proposta inteligente atualizada' : 'Proposta inteligente gerada')
  }
  auditAsync({
    ator,
    acao: anterior ? 'update' : 'create',
    recurso: `proposta_inteligente:${p.id}`,
    dadosAntes: null,
    dadosDepois: { clienteId: (p as unknown as { cliente?: { id?: string } }).cliente?.id },
  })
}

/** Variante seed: só Map (deixa o boot orchestrator decidir PG vs Map). */
function setPropostaLocal(p: Proposta): void {
  propostas.set(p.id, p)
}

/**
 * Boot orchestrator (server.ts chama após app.listen):
 *   - PG tem propostas → sobrescreve Maps
 *   - PG vazio → semeia PG com Maps atuais (one-shot)
 */
export async function hydrateOrSeedPropostasPg(): Promise<{ hydrated: number; seeded: number }> {
  if (!isPgEnabled()) return { hydrated: 0, seeded: 0 }
  const fromPg = await pgListPropostas()
  if (fromPg.length > 0) {
    propostas.clear()
    propostasInteligentes.clear()
    for (const p of fromPg) {
      // Distinguir: PropostaInteligente tem `secoes`; Proposta legacy tem `itens`.
      if (Array.isArray((p as { secoes?: unknown[] }).secoes)) {
        propostasInteligentes.set(p.id as string, p as unknown as PropostaInteligente)
      } else {
        const legacy = p as unknown as Proposta
        legacy.status = normalizarStatus(legacy.status)
        propostas.set(p.id as string, legacy)
      }
    }
    return { hydrated: fromPg.length, seeded: 0 }
  }
  let seeded = 0
  for (const p of propostas.values()) {
    await pgUpsertProposta(p as unknown as Parameters<typeof pgUpsertProposta>[0])
    seeded++
  }
  for (const p of propostasInteligentes.values()) {
    await pgUpsertProposta(p as unknown as Parameters<typeof pgUpsertProposta>[0])
    seeded++
  }
  return { hydrated: 0, seeded }
}

export async function reconcilePropostasComNegociacoes(): Promise<{
  criadas: number
  existentes: number
  ignoradas: number
  contratosCriados: number
  contratosExistentes: number
}> {
  let criadas = 0
  let existentes = 0
  let ignoradas = 0
  let contratosCriados = 0
  let contratosExistentes = 0
  const service = getDealRoomService()
  for (const proposta of propostas.values()) {
    if (!['enviada', 'aceita'].includes(proposta.status)) continue
    try {
      if (isPgEnabled()) {
        const result = await updateProposalWorkflow({ id: proposta.id, patch: {}, actor: { nome: 'reconciliacao' } })
        propostas.set(proposta.id, result.proposta as unknown as Proposta)
        if (result.createdNegociacao) criadas += 1
        else existentes += 1
        if (result.contratoId) {
          if (result.createdContrato) contratosCriados += 1
          else contratosExistentes += 1
        }
        continue
      }
      const demanda = await getClienteDemandaService().ensureForProposal(proposta)
      const vinculo = await service.ensureForProposal(proposta, { nome: 'sistema' })
      if (vinculo.criada) criadas += 1
      else existentes += 1
      if (proposta.status === 'aceita') {
        const draft = await getClientCoreService().ensureContractDraftForAcceptedProposal({
          clienteId: proposta.clienteId,
          propostaId: proposta.id,
          negociacaoId: vinculo.negociacao.id,
          demandaId: demanda.demanda.id,
          titulo: proposta.titulo,
          credor: proposta.credor,
          tipo: tipoContratoParaProposta(proposta.tipo),
          valorDivida: String(proposta.valorDivida),
          valorProposta: String(proposta.valorProposta),
        })
        if (draft.created) contratosCriados += 1
        else contratosExistentes += 1
      }
    } catch {
      ignoradas += 1
    }
  }
  return { criadas, existentes, ignoradas, contratosCriados, contratosExistentes }
}

function seed() {
  const data: Proposta[] = [
    /* ---- REAL: Ailton Caeiro x Sicoob ---- */
    {
      id: 'prop-001',
      clienteId: 'cli-001',
      clienteNome: 'Ailton Caeiro da Silva',
      credor: 'Sicoob',
      titulo: 'Proposta de Liquidação - Ailton Caeiro x Sicoob',
      tipo: 'liquidacao',
      status: 'aceita',
      valorDivida: 2148495.32,
      valorProposta: 2215482.03,
      descontoPercentual: 0,
      itens: [
        { descricao: 'Pagamento parcial acordo - mar/2024', valor: 500000.00, tipo: 'pagamento', data: '2024-03-15' },
        { descricao: 'Pagamento pós-safra - jun/2024', valor: 450000.00, tipo: 'pagamento', data: '2024-06-20' },
        { descricao: 'Pagamento parcial - set/2024', valor: 380000.00, tipo: 'pagamento', data: '2024-09-10' },
        { descricao: 'Dação em pagamento - imóvel matrícula 45434', valor: 521285.02, tipo: 'dacao', data: '2025-01-15' },
        { descricao: 'Pagamento safra 24/25', valor: 300000.00, tipo: 'pagamento', data: '2025-03-20' },
        { descricao: 'Quitação via capital social Sicoob', valor: 64197.01, tipo: 'compensacao', data: '2025-04-10' },
      ],
      condicoes: [
        'Consolidação dos contratos 23110-0, 24821-2, 25381-4, 25882-7, 27981-3 em contrato único 30262-4',
        'Dação em pagamento do imóvel rural matrícula 45434 avaliado em R$521.285,02',
        'Utilização do capital social Sicoob (R$64.197,01) para quitação do saldo residual',
        'Quitação plena e irrevogável após último pagamento',
        'Baixa de restritivos em até 30 dias da quitação',
      ],
      fundamentacao: 'Proposta baseada na capacidade de pagamento do produtor alinhada ao fluxo da safra de soja/milho. A dação do imóvel mat. 45434 complementa os pagamentos em espécie, e o capital social acumulado na cooperativa viabiliza a quitação do saldo residual.',
      dataCriacao: '2024-02-05',
      dataValidade: '2024-12-31',
      ultimaAtualizacao: '2025-04-10',
      pdfUrl: '/api/propostas/prop-001/pdf',
      observacoes: 'Acordo concluído com sucesso. Total pago: R$2.215.482,03.',
    },

    /* ---- REAL: Paulo Luciano x Fertiflora ---- */
    {
      id: 'prop-002',
      clienteId: 'cli-002',
      clienteNome: 'Paulo Luciano de Oliveira',
      credor: 'Fertiflora/Herbioeste',
      titulo: 'Memória de Cálculo - Paulo Luciano x Fertiflora',
      tipo: 'memoria_calculo',
      status: 'enviada',
      valorDivida: 277380.00,
      valorProposta: 282200.00,
      descontoPercentual: 0,
      itens: [
        { descricao: 'Parcela 1 - alinhada safra', valor: 70550.00, tipo: 'parcela', data: '2026-04-30' },
        { descricao: 'Parcela 2 - alinhada safra', valor: 70550.00, tipo: 'parcela', data: '2026-06-30' },
        { descricao: 'Parcela 3 - alinhada safra', valor: 70550.00, tipo: 'parcela', data: '2026-08-31' },
        { descricao: 'Parcela 4 - alinhada safra', valor: 70550.00, tipo: 'parcela', data: '2026-10-31' },
      ],
      condicoes: [
        'Consolidação dos títulos 20189 (R$86.940), 20192 (R$86.940) e 20190 (R$103.500)',
        'Parcelamento em 4x R$70.550,00 alinhadas ao fluxo da safra',
        'Primeiro pagamento após colheita da soja safra 25/26',
        'Garantia via CPR física de soja - 1.180 sacas',
        'Pagamentos já realizados (R$30.000) abatidos do saldo',
      ],
      fundamentacao: 'Memória de cálculo elaborada considerando o fluxo de caixa da safra 25/26. Parcelas de R$70.550 (total R$282.200) alinhadas aos períodos de comercialização pós-colheita, garantindo capacidade de pagamento. Título 20190 (Herbioeste) consolidado com títulos Fertiflora.',
      dataCriacao: '2025-09-05',
      dataValidade: '2026-03-31',
      ultimaAtualizacao: '2026-02-26',
      pdfUrl: '/api/propostas/prop-002/pdf',
      observacoes: 'Pagamentos parciais de R$10K (23/12/25) e R$20K (26/02/26) já realizados. Aguardando aprovação formal do parcelamento.',
    },

    /* ---- REAL: Lucídio Griep Fenner x Sicoob Fronteiras ---- */
    {
      id: 'prop-003',
      clienteId: 'cli-003',
      clienteNome: 'Lucídio Griep Fenner',
      credor: 'Sicoob Fronteiras',
      titulo: 'Proposta de Renegociação - Lucídio Fenner x Sicoob Fronteiras',
      tipo: 'renegociacao',
      status: 'rascunho',
      valorDivida: 3445428.22,
      valorProposta: 3445428.22,
      descontoPercentual: 0,
      itens: [
        { descricao: 'Amortização já realizada (34,49% do capital)', valor: 1256962.68, tipo: 'pagamento', data: '2025-12-22' },
        { descricao: 'Consolidação contratos 554904, 561037 e 413740', valor: 3445428.22, tipo: 'parcela', data: '2026-06-30' },
      ],
      condicoes: [
        'Consolidação da carteira vinculada às operações de crédito rural (custeio e CPRF), contratos nº 554904, 561037 e 413740',
        'Reorganização de prazo e condições ajustada ao fluxo de caixa projetado da safra',
        'Manutenção das condições de juros originalmente pactuadas (MCR 2-6-4 e Súmula 298 STJ)',
        'Alongamento da dívida frente a frustração de safra comprovada por laudos técnicos',
        'CET consolidado aproximado de 19% a.a. sobre a carteira',
      ],
      fundamentacao: 'Proposta de reestruturação integral das dívidas do cooperado junto ao Sicoob Fronteiras, fundamentada no Manual de Crédito Rural (MCR 2-6-4) e Súmula 298 do STJ. O cooperado já amortizou 34,49% do capital original (R$1.256.962,68), mas grande parte do esforço foi consumida em juros. A reorganização visa devolver liquidez ao produtor sem prejuízo ao credor, ajustando prazos ao ciclo econômico da atividade.',
      dataCriacao: '2026-05-07',
      dataValidade: '2026-08-07',
      ultimaAtualizacao: '2026-05-07',
      pdfUrl: '/api/propostas/prop-003/pdf',
      observacoes: 'Saldo atual aproximado de R$ 3.445.428,22 (base de cálculo em 06/05/2026). Pagamentos realizados: R$ 814.232,45 (contrato 413740) + R$ 442.730,23 (contrato 554904) = R$ 1.256.962,68.',
    },
  ]

  for (const p of data) {
    setPropostaLocal(p)
  }
}

seed()

let propostaCounter = propostas.size

const PROPOSTA_UPLOAD_SESSION_PREFIX = 'crm-propostas'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addMonthsIso(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function cleanText(value: unknown, max = 2000): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value).trim()
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/[^\d.-]/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => cleanText(v, 500)).filter(Boolean)
  if (typeof value === 'string') return value.split(/\n|;/).map((v) => cleanText(v, 500)).filter(Boolean)
  return []
}

function normalizarTipo(value: unknown): Proposta['tipo'] {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('liquida') || raw.includes('quita')) return 'liquidacao'
  if (raw.includes('mem')) return 'memoria_calculo'
  if (raw.includes('parcela') || raw.includes('along')) return 'parcelamento'
  if (raw.includes('judicial') || raw.includes('acordo')) return 'acordo_judicial'
  return 'renegociacao'
}

function tipoContratoParaProposta(tipo: Proposta['tipo']): string {
  if (tipo === 'liquidacao' || tipo === 'acordo_judicial') return 'acordo_extrajudicial'
  if (tipo === 'memoria_calculo') return 'memoria_calculo'
  return 'termo_renegociacao'
}

function normalizarStatus(value: unknown): Proposta['status'] {
  const raw = String(value || '').toLowerCase()
  if (raw === 'revisao' || raw === 'revisão' || raw === 'gerando' || raw === 'gerada') return 'em_analise'
  if (raw === 'visualizada') return 'enviada'
  if (raw === 'rascunho') return 'rascunho'
  if (raw.includes('aceit') || raw.includes('aprov')) return 'aceita'
  if (raw.includes('rejeit') || raw.includes('recus')) return 'rejeitada'
  if (raw.includes('expir')) return 'expirada'
  if (raw.includes('env')) return 'enviada'
  if (raw.includes('analis')) return 'em_analise'
  return 'rascunho'
}

const PROPOSTA_TRANSITIONS: Record<Proposta['status'], Set<Proposta['status']>> = {
  rascunho: new Set(['em_analise']),
  em_analise: new Set(['rascunho', 'enviada']),
  enviada: new Set(['em_analise', 'aceita', 'rejeitada', 'expirada']),
  aceita: new Set([]), rejeitada: new Set([]), expirada: new Set([]),
}

function normalizarItem(raw: any): ItemProposta {
  return {
    descricao: cleanText(raw?.descricao ?? raw?.descrição ?? raw?.titulo ?? 'Item da proposta', 300),
    valor: asNumber(raw?.valor),
    tipo: ['pagamento', 'dacao', 'compensacao', 'desconto', 'parcela'].includes(String(raw?.tipo))
      ? raw.tipo
      : 'parcela',
    data: cleanDate(raw?.data),
  }
}

function cleanDate(value: unknown): string | undefined {
  const raw = cleanText(value, 40)
  if (!raw) return undefined
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return undefined
}

function descontoPct(valorDivida: number, valorProposta: number): number {
  return valorDivida > 0 ? Number((((valorDivida - valorProposta) / valorDivida) * 100).toFixed(2)) : 0
}

function fallbackExtracaoProposta(params: {
  clienteId: string
  clienteNome: string
  filename: string
  texto: string
}): Partial<Proposta> & { confianca: number; camposAusentes: string[]; resumo: string } {
  const texto = params.texto
  const moneyMatches = Array.from(texto.matchAll(/R\$\s?([\d.]+,\d{2})/gi)).map((m) => asNumber(m[1]))
  const valorDivida = moneyMatches[0] || 0
  const valorProposta = moneyMatches[1] || valorDivida
  const credorMatch = texto.match(/(?:credor|banco|institui[cç][aã]o|cooperativa)[:\s-]+([A-Za-zÀ-ÿ0-9 .&/-]{3,80})/i)
  const credor = cleanText(credorMatch?.[1], 80) || 'Credor a confirmar'
  const camposAusentes = [
    !credorMatch ? 'credor' : '',
    !valorDivida ? 'valorDivida' : '',
    !valorProposta ? 'valorProposta' : '',
  ].filter(Boolean)
  return {
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    credor,
    titulo: `Proposta importada - ${credor}`,
    tipo: normalizarTipo(texto),
    status: 'rascunho',
    valorDivida,
    valorProposta,
    descontoPercentual: descontoPct(valorDivida, valorProposta),
    itens: [],
    condicoes: [],
    fundamentacao: cleanText(texto, 1200),
    observacoes: `Importada automaticamente do arquivo ${params.filename}. Revisar campos antes de enviar ao credor.`,
    dataCriacao: todayIso(),
    dataValidade: addMonthsIso(3),
    resumo: cleanText(texto, 900) || 'Arquivo importado; extração textual limitada.',
    confianca: camposAusentes.length ? 0.35 : 0.55,
    camposAusentes,
  }
}

async function extrairPropostaComOpenAI(params: {
  clienteId: string
  clienteNome: string
  filename: string
  mimetype: string
  texto: string
}): Promise<{
  proposta: Partial<Proposta>
  origem: 'openai' | 'fallback'
  modelo: string
  resumo: string
  confianca: number
  camposAusentes: string[]
  erro?: string
}> {
  const fallback = fallbackExtracaoProposta(params)
  const model = getModelForRole('doc_extractor')
  const texto = cleanText(params.texto, 30000)
  if (!texto) {
    return {
      proposta: fallback,
      origem: 'fallback',
      modelo: model,
      resumo: fallback.resumo,
      confianca: fallback.confianca,
      camposAusentes: fallback.camposAusentes,
      erro: 'Arquivo sem texto extraível suficiente.',
    }
  }
  try {
    const result = await generateStructured<Record<string, any>>(
      [{
        role: 'user',
        content: [
          `clienteId: ${params.clienteId}`,
          `clienteNome: ${params.clienteNome}`,
          `arquivo: ${params.filename}`,
          `mime: ${params.mimetype}`,
          '',
          texto,
        ].join('\n'),
      }],
      {
        name: 'proposta_bancaria',
        schema: {
          type: 'object',
          properties: {
            titulo: { type: 'string' }, credor: { type: 'string' },
            tipo: { type: 'string', enum: ['liquidacao', 'renegociacao', 'memoria_calculo', 'parcelamento', 'acordo_judicial'] },
            status: { type: 'string', enum: ['rascunho', 'em_analise', 'enviada', 'aceita', 'rejeitada', 'expirada'] },
            valorDivida: { type: 'number' }, valorProposta: { type: 'number' },
            dataCriacao: { type: 'string' }, dataValidade: { type: 'string' },
            itens: {
              type: 'array',
              items: {
                type: 'object',
                properties: { descricao: { type: 'string' }, valor: { type: 'number' }, tipo: { type: 'string', enum: ['pagamento', 'dacao', 'compensacao', 'desconto', 'parcela'] }, data: { type: 'string' } },
                required: ['descricao', 'valor', 'tipo'],
              },
            },
            condicoes: { type: 'array', items: { type: 'string' } },
            fundamentacao: { type: 'string' }, observacoes: { type: 'string' }, resumo: { type: 'string' },
            confianca: { type: 'number', minimum: 0, maximum: 1 }, camposAusentes: { type: 'array', items: { type: 'string' } },
          },
        },
        model,
        maxTokens: 1800,
        reasoning: { effort: 'low' },
        system: `Você é uma IA extratora de propostas bancárias e de renegociação da ALETIS.
Extraia apenas dados que estejam no documento. Não invente.
Responda SOMENTE com JSON válido:
{
  "titulo": "string",
  "credor": "string",
  "tipo": "liquidacao|renegociacao|memoria_calculo|parcelamento|acordo_judicial",
  "status": "rascunho|em_analise|enviada|aceita|rejeitada|expirada",
  "valorDivida": number,
  "valorProposta": number,
  "dataCriacao": "YYYY-MM-DD",
  "dataValidade": "YYYY-MM-DD",
  "itens": [{"descricao":"string","valor":number,"tipo":"pagamento|dacao|compensacao|desconto|parcela","data":"YYYY-MM-DD"}],
  "condicoes": ["string"],
  "fundamentacao": "string",
  "observacoes": "string",
  "resumo": "string curto para dashboard",
  "confianca": 0.0,
  "camposAusentes": ["string"]
}`,
      },
    )
    const parsed = result.data
    const valorDivida = asNumber(parsed.valorDivida)
    const valorProposta = asNumber(parsed.valorProposta) || valorDivida
    const proposta: Partial<Proposta> = {
      clienteId: params.clienteId,
      clienteNome: params.clienteNome,
      titulo: cleanText(parsed.titulo, 180) || fallback.titulo,
      credor: cleanText(parsed.credor, 120) || fallback.credor,
      tipo: normalizarTipo(parsed.tipo),
      status: normalizarStatus(parsed.status),
      valorDivida,
      valorProposta,
      descontoPercentual: descontoPct(valorDivida, valorProposta),
      itens: Array.isArray(parsed.itens) ? parsed.itens.map(normalizarItem) : [],
      condicoes: asStringArray(parsed.condicoes),
      fundamentacao: cleanText(parsed.fundamentacao, 6000),
      observacoes: cleanText(parsed.observacoes, 3000),
      dataCriacao: cleanDate(parsed.dataCriacao) || todayIso(),
      dataValidade: cleanDate(parsed.dataValidade) || addMonthsIso(3),
    }
    return {
      proposta,
      origem: 'openai',
      modelo: result.model || model,
      resumo: cleanText(parsed.resumo, 1000) || fallback.resumo,
      confianca: Math.max(0, Math.min(1, Number(parsed.confianca ?? 0.75))),
      camposAusentes: asStringArray(parsed.camposAusentes),
    }
  } catch (err) {
    return {
      proposta: fallback,
      origem: 'fallback',
      modelo: model,
      resumo: fallback.resumo,
      confianca: fallback.confianca,
      camposAusentes: fallback.camposAusentes,
      erro: (err as Error).message,
    }
  }
}

const propostaEnrichmentRunning = new Set<string>()

function schedulePropostaEnrichment(params: {
  propostaId: string
  sessionId: string
  documentId: string
  clienteId: string
  clienteNome: string
  filename: string
  mimetype: string
}): void {
  if (propostaEnrichmentRunning.has(params.propostaId)) return
  propostaEnrichmentRunning.add(params.propostaId)
  void (async () => {
    try {
      const intake = getDocumentIntakeService()
      // A extração pode envolver OCR de muitas páginas. A proposta permanece
      // utilizável enquanto este worker aguarda, sem prender a requisição HTTP.
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await intake.resumePending(params.sessionId)
        const doc = await intake.get(params.sessionId, params.documentId)
        if (!doc) throw new Error('Documento de origem não encontrado para enriquecer a proposta.')
        const state = String(doc.metadata?.processingState || '')
        if (state === 'failed') {
          throw new Error(String(doc.metadata?.processingError || 'A leitura do documento falhou.'))
        }
        const legacyReady = !state && Boolean(doc.extractedText?.trim())
        if (state !== 'completed' && state !== 'completed_basic' && !legacyReady) {
          await new Promise((resolve) => setTimeout(resolve, 3_000))
          continue
        }

        const extraction = await extrairPropostaComOpenAI({
          clienteId: params.clienteId,
          clienteNome: params.clienteNome,
          filename: params.filename,
          mimetype: params.mimetype,
          texto: [
            doc.extractedText,
            doc.summary,
            typeof doc.metadata?.entitySummary === 'string' ? doc.metadata.entitySummary : '',
            doc.metadata?.smartExtraction ? JSON.stringify(doc.metadata.smartExtraction).slice(0, 18_000) : '',
          ].filter(Boolean).join('\n\n'),
        })
        const current = propostas.get(params.propostaId)
        if (!current) return
        const base = extraction.proposta
        const valorDivida = asNumber(base.valorDivida)
        const valorProposta = asNumber(base.valorProposta) || valorDivida
        const next: Proposta = {
          ...current,
          credor: current.credor === 'Credor a confirmar'
            ? cleanText(base.credor, 120) || current.credor
            : current.credor,
          titulo: current.titulo.startsWith('Proposta importada -')
            ? cleanText(base.titulo, 180) || current.titulo
            : current.titulo,
          tipo: normalizarTipo(base.tipo || current.tipo),
          // Upload é ação operacional; rascunho exige intenção explícita.
          status: current.status === 'rascunho' ? 'em_analise' : current.status,
          valorDivida: current.valorDivida || valorDivida,
          valorProposta: current.valorProposta || valorProposta,
          itens: current.itens.length ? current.itens : (Array.isArray(base.itens) ? base.itens.map(normalizarItem) : []),
          condicoes: current.condicoes.length ? current.condicoes : asStringArray(base.condicoes),
          fundamentacao: current.fundamentacao || cleanText(base.fundamentacao, 6000),
          dataCriacao: current.dataCriacao || cleanDate(base.dataCriacao) || todayIso(),
          dataValidade: current.dataValidade || cleanDate(base.dataValidade) || addMonthsIso(3),
          ultimaAtualizacao: todayIso(),
          observacoes: current.observacoes || cleanText(base.observacoes, 3000),
          extracaoIa: {
            origem: extraction.origem,
            estado: extraction.origem === 'openai' ? 'completed' : 'completed_basic',
            modelo: extraction.modelo,
            resumo: extraction.resumo,
            confianca: extraction.confianca,
            camposAusentes: extraction.camposAusentes,
            textoExtraidoChars: doc.extractedText?.length ?? 0,
            erro: extraction.erro,
            atualizadoEm: new Date().toISOString(),
          },
        }
        next.descontoPercentual = descontoPct(next.valorDivida, next.valorProposta)
        // A extração não pode substituir termos já aceitos nem uma revisão mais nova.
        const patch: Record<string, unknown> = { expectedRevision: current.revision || 0 }
        for (const key of ['credor', 'titulo', 'tipo', 'status', 'valorDivida', 'valorProposta', 'itens', 'condicoes', 'fundamentacao', 'dataCriacao', 'dataValidade', 'observacoes', 'extracaoIa'] as const) {
          if (JSON.stringify(next[key]) !== JSON.stringify(current[key])) patch[key] = next[key]
        }
        if (Object.keys(patch).length > 1) await updatePropostaCommand(params.propostaId, patch, { nome: 'proposta-upload-ia-background' })
        return
      }
      throw new Error('A leitura permanece na fila. Ela será retomada automaticamente ao consultar a proposta.')
    } catch (error) {
      const current = propostas.get(params.propostaId)
      if (current && current.status !== 'aceita' && (error as { statusCode?: number }).statusCode !== 409) {
        await updatePropostaCommand(params.propostaId, {
          expectedRevision: current.revision || 0,
          extracaoIa: {
            ...(current.extracaoIa || { origem: 'fallback' as const }),
            estado: 'failed',
            erro: cleanText((error as Error).message, 600),
            atualizadoEm: new Date().toISOString(),
          },
        }, { nome: 'proposta-upload-ia-background' }).catch(() => { /* nova leitura pode repetir a extração, sem sobrescrever edição */ })
      }
    } finally {
      propostaEnrichmentRunning.delete(params.propostaId)
    }
  })()
}

function resumePropostaEnrichment(proposta: Proposta): void {
  if (proposta.status === 'aceita') return
  const source = proposta.arquivoOrigem
  if (!source?.alixDocumentId || !source.alixSessionId) return
  if (proposta.extracaoIa?.estado === 'completed' || proposta.extracaoIa?.estado === 'completed_basic') return
  schedulePropostaEnrichment({
    propostaId: proposta.id,
    sessionId: source.alixSessionId,
    documentId: source.alixDocumentId,
    clienteId: proposta.clienteId,
    clienteNome: proposta.clienteNome,
    filename: source.filename || proposta.titulo,
    mimetype: source.mimetype || 'application/octet-stream',
  })
}

/* ========================================================================
 *  Roteador
 * ======================================================================== */

export default async function (fastify: FastifyInstance) {
  fastify.get('/api/propostas/ia/models', async () => {
    const models = Object.values(MODEL_REGISTRY).map((m) => ({
      id: m.id,
      provider: m.provider,
      capabilities: m.capabilities,
      description: m.description,
      contextWindow: m.contextWindow,
      maxOutputTokens: m.maxOutputTokens,
    }))
    return {
      success: true,
      data: {
        selectedExtractor: getModelForRole('doc_extractor'),
        models,
      },
    }
  })

  /* ---- LIST ---- */
  fastify.get('/api/propostas', async (request: FastifyRequest) => {
    const { status, clienteId, full } = request.query as { status?: string; clienteId?: string; full?: string }

    let result = isPgEnabled()
      ? (await pgListPropostas()).filter(p => Array.isArray(p.itens)) as unknown as Proposta[]
      : Array.from(propostas.values())
    result = result.map(proposta => ({ ...proposta, status: normalizarStatus(proposta.status) }))

    if (status) {
      result = result.filter(p => p.status === status)
    }
    if (clienteId) {
      result = result.filter(p => p.clienteId === clienteId)
    }
    result.forEach(resumePropostaEnrichment)

    if (full === '1' || full === 'true') {
      return { success: true, data: result, total: result.length }
    }

    const resumos = result.map(p => ({
      id: p.id,
      revision: p.revision || 0,
      clienteId: p.clienteId,
      clienteNome: p.clienteNome,
      credor: p.credor,
      titulo: p.titulo,
      tipo: p.tipo,
      status: p.status,
      valorDivida: p.valorDivida,
      valorProposta: p.valorProposta,
      descontoPercentual: p.descontoPercentual,
      dataCriacao: p.dataCriacao,
      dataValidade: p.dataValidade,
      ultimaAtualizacao: p.ultimaAtualizacao,
      arquivoOrigem: p.arquivoOrigem,
      extracaoIa: p.extracaoIa,
      demandaId: p.demandaId,
      demandaTitulo: p.demandaTitulo,
      versaoDemanda: p.versaoDemanda,
      assunto: p.assunto,
    }))

    return { success: true, data: resumos, total: resumos.length }
  })

  /* ---- GET BY ID ---- */
  fastify.get('/api/propostas/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const proposta = isPgEnabled() ? await pgGetProposta(id) as unknown as Proposta | null : propostas.get(id)

    if (!proposta) {
      reply.status(404)
      return { success: false, error: 'Proposta não encontrada' }
    }

    resumePropostaEnrichment(proposta)

    return { success: true, data: { ...proposta, status: normalizarStatus(proposta.status) } }
  })

  /* ---- UPLOAD + IA EXTRACT ---- */
  fastify.post('/api/propostas/upload', async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    let file: MultipartFile | undefined
    try {
      file = await request.file({
        limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      })
    } catch (err) {
      request.log.warn({ err }, '[propostas-upload] multipart inválido')
      return reply.status(400).send({ success: false, error: 'Falha ao ler o arquivo enviado.' })
    }
    if (!file) return reply.status(400).send({ success: false, error: 'Nenhum arquivo enviado.' })
    if (!isMimeAllowed(file.mimetype)) {
      return reply.status(415).send({ success: false, error: `Tipo de arquivo não suportado: ${file.mimetype}` })
    }

    let buffer: Buffer
    try {
      buffer = await file.toBuffer()
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({ success: false, error: 'Arquivo excede 25MB.' })
      }
      return reply.status(400).send({ success: false, error: 'Arquivo inválido.' })
    }

    const fields = file.fields as any
    const clienteId = cleanText(fields?.clienteId?.value, 80)
    const clienteNome = cleanText(fields?.clienteNome?.value, 180) || clienteId
    if (!clienteId) return reply.status(400).send({ success: false, error: 'clienteId é obrigatório.' })

    const intakeDocumentId = cleanText(fields?.alixDocumentId?.value, 120)
    const intakeSessionId = cleanText(fields?.alixSessionId?.value, 160)
    const demandaId = cleanText(fields?.demandaId?.value, 120)
    const demandaTitulo = cleanText(fields?.demandaTitulo?.value, 180)
    const assunto = cleanText(fields?.assunto?.value, 180)
    try {
      const intake = getDocumentIntakeService()
      const reusable = /^crm-intake-[A-Za-z0-9_-]{6,120}$/.test(intakeSessionId)
        && /^[A-Za-z0-9_-]{6,120}$/.test(intakeDocumentId)
        ? await intake.linkToCliente(intakeSessionId, intakeDocumentId, clienteId)
        : null
      const sessionId = reusable?.sessionId || `${PROPOSTA_UPLOAD_SESSION_PREFIX}-${clienteId}`
      const doc = reusable || await intake.enqueue({
          buffer,
          filename: file.filename,
          mimetype: file.mimetype,
          sessionId,
          clienteId,
        })

      let cofreUploadId: string | undefined
      let cofreDownloadUrl: string | undefined
      try {
        const attached = await attachAlixDocumentToCliente({
          sessionId,
          documentoId: doc.id,
          clienteId,
          clientName: clienteNome,
          categoria: 'contrato',
          enviadoPor: 'consultor',
        })
        if (attached.ok) {
          cofreUploadId = attached.id
          cofreDownloadUrl = `/api/clientes/${clienteId}/documentos/${attached.id}/download`
        }
      } catch (err) {
        request.log.warn({ err }, '[propostas-upload] falha ao anexar ao cofre do cliente')
      }

      const fallback = fallbackExtracaoProposta({
        clienteId,
        clienteNome,
        filename: file.filename,
        texto: [doc.extractedText, doc.summary].filter(Boolean).join('\n\n'),
      })
      const base = fallback
      const valorDivida = asNumber(base.valorDivida)
      const valorProposta = asNumber(base.valorProposta) || valorDivida
      const id = `prop-up-${randomUUID().slice(0, 8)}`
      const proposta: Proposta = {
        id,
        clienteId,
        demandaId: demandaId || undefined,
        demandaTitulo: demandaTitulo || undefined,
        assunto: assunto || undefined,
        clienteNome,
        credor: cleanText(base.credor, 120) || 'Credor a confirmar',
        titulo: cleanText(base.titulo, 180) || `Proposta importada - ${file.filename}`,
        tipo: normalizarTipo(base.tipo),
        status: 'em_analise',
        valorDivida,
        valorProposta,
        descontoPercentual: descontoPct(valorDivida, valorProposta),
        itens: Array.isArray(base.itens) ? base.itens.map(normalizarItem) : [],
        condicoes: asStringArray(base.condicoes),
        fundamentacao: cleanText(base.fundamentacao, 6000),
        dataCriacao: cleanDate(base.dataCriacao) || todayIso(),
        dataValidade: cleanDate(base.dataValidade) || addMonthsIso(3),
        ultimaAtualizacao: todayIso(),
        pdfUrl: `/api/propostas/${id}/pdf`,
        observacoes: cleanText(base.observacoes, 3000) || `Proposta importada de ${file.filename}. Revisar antes de enviar.`,
        arquivoOrigem: {
          alixDocumentId: doc.id,
          alixSessionId: sessionId,
          filename: file.filename,
          mimetype: file.mimetype,
          sizeBytes: buffer.length,
          cofreUploadId,
          cofreDownloadUrl,
        },
        extracaoIa: {
          origem: 'fallback',
          estado: ['completed', 'completed_basic'].includes(String(doc.metadata?.processingState || '')) ? 'processing' : 'queued',
          modelo: getModelForRole('doc_extractor'),
          resumo: 'Arquivo recebido. OCR e extração estruturada continuam em segundo plano.',
          confianca: fallback.confianca,
          camposAusentes: fallback.camposAusentes,
          textoExtraidoChars: doc.extractedText?.length ?? 0,
          atualizadoEm: new Date().toISOString(),
        },
      }
      await getClienteDemandaService().ensureForProposal(proposta)
      await persistProposta(proposta, 'proposta-upload-ia')
      schedulePropostaEnrichment({
        propostaId: id,
        sessionId,
        documentId: doc.id,
        clienteId,
        clienteNome,
        filename: file.filename,
        mimetype: file.mimetype,
      })

      return reply.status(201).send({
        success: true,
        data: proposta,
        meta: {
          alixDocumentId: doc.id,
          sessionId,
          extractionOrigin: 'background',
          processingState: proposta.extracaoIa?.estado,
          cofreUploadId,
        },
      })
    } catch (err) {
      request.log.error({ err }, '[propostas-upload] falha')
      return reply.status(422).send({ success: false, error: (err as Error).message })
    }
  })

  /* ---- GERAR PROPOSTA ---- */
  fastify.post('/api/propostas/gerar', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>

    const errors: string[] = []
    if (!body.clienteId || typeof body.clienteId !== 'string') errors.push('clienteId é obrigatório')
    if (!body.clienteNome || typeof body.clienteNome !== 'string') errors.push('clienteNome é obrigatório')
    if (!body.credor || typeof body.credor !== 'string') errors.push('credor é obrigatório')
    if (!body.titulo || typeof body.titulo !== 'string') errors.push('titulo é obrigatório')
    if (!body.tipo || typeof body.tipo !== 'string') errors.push('tipo é obrigatório')
    if (body.valorDivida === undefined || typeof body.valorDivida !== 'number') errors.push('valorDivida é obrigatório (number)')
    if (body.valorProposta === undefined || typeof body.valorProposta !== 'number') errors.push('valorProposta é obrigatório (number)')

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    propostaCounter++
    const id = `prop-${randomUUID()}`
    const agora = new Date().toISOString().slice(0, 10)
    const validade = new Date()
    validade.setMonth(validade.getMonth() + 3)

    const valorDivida = body.valorDivida as number
    const valorProposta = body.valorProposta as number
    const desconto = valorDivida > 0 ? Number((((valorDivida - valorProposta) / valorDivida) * 100).toFixed(2)) : 0

    const nova: Proposta = {
      id,
      clienteId: body.clienteId as string,
      demandaId: cleanText(body.demandaId, 120) || undefined,
      demandaTitulo: cleanText(body.demandaTitulo, 180) || undefined,
      assunto: cleanText(body.assunto, 180) || undefined,
      clienteNome: body.clienteNome as string,
      credor: body.credor as string,
      titulo: body.titulo as string,
      tipo: body.tipo as Proposta['tipo'],
      // Criar proposta é uma ação operacional; rascunho exige intenção explícita.
      status: body.salvarComoRascunho === true || body.status === 'rascunho' ? 'rascunho' : 'em_analise',
      valorDivida,
      valorProposta,
      descontoPercentual: desconto,
      itens: (body.itens as ItemProposta[]) || [],
      condicoes: (body.condicoes as string[]) || [],
      fundamentacao: (body.fundamentacao as string) || '',
      dataCriacao: agora,
      dataValidade: validade.toISOString().slice(0, 10),
      ultimaAtualizacao: agora,
      pdfUrl: null,
      observacoes: (body.observacoes as string) || '',
    }

    await getClienteDemandaService().ensureForProposal(nova)
    // Simulate calculation engine trigger
    nova.pdfUrl = `/api/propostas/${id}/pdf`
    await persistProposta(nova)

    reply.status(201)
    return {
      success: true,
      data: nova,
      meta: {
        calculationEngineTriggered: true,
        estimatedPdfGenerationTime: '2-5 seconds',
      },
    }
  })

  /* ---- UPDATE ---- */
  fastify.patch('/api/propostas/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const user = resolveInternalSession(fastify, request)
    try {
      return await updatePropostaCommand(id, request.body, user ? { id: user.id, nome: user.nome } : { nome: 'sistema' })
    } catch (error) {
      const failure = error as Error & { statusCode?: number; code?: string; detalhes?: unknown }
      const status = failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500 ? failure.statusCode : 503
      if (status === 503) request.log.error({ err: error, propostaId: id }, 'falha ao confirmar atualização da proposta')
      const message = status === 503 ? 'Não foi possível salvar a proposta. Tente novamente.' : failure.message
      return reply.status(status).send({ success: false, error: message, message, code: status === 503 ? 'proposal_persistence_unavailable' : failure.code, detalhes: failure.detalhes })
    }
  })

  fastify.delete('/api/propostas/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    if (isPgEnabled()) {
      const user = resolveInternalSession(fastify, request)
      const rawRevision = (request.query as { expectedRevision?: string }).expectedRevision
      if (rawRevision !== undefined && !/^\d{1,10}$/.test(rawRevision)) return reply.status(400).send({ success: false, error: 'Revisão inválida.' })
      try {
        await withCrmWriteLock(`proposta:${id}`, async () => {
          await deleteProposalWorkflow({ id, expectedRevision: rawRevision === undefined ? undefined : Number(rawRevision), actor: user ? { id: user.id, nome: user.nome } : { nome: 'sistema' } })
          propostas.delete(id)
        })
        return { success: true, data: { id, deleted: true } }
      } catch (error) {
        const failure = error as Error & { statusCode?: number; code?: string }
        const status = failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500 ? failure.statusCode : 503
        if (status === 503) request.log.error({ err: error, propostaId: id }, 'falha ao excluir rascunho de proposta')
        return reply.status(status).send({ success: false, code: failure.code, error: status === 503 ? 'Não foi possível excluir a proposta. Tente novamente.' : failure.message })
      }
    }
    const proposta = propostas.get(id)
    if (!proposta) {
      reply.status(404)
      return { success: false, error: 'Proposta não encontrada' }
    }
    if (!['rascunho', 'em_analise'].includes(proposta.status)) return reply.status(409).send({ success: false, error: 'Somente propostas em rascunho ou análise podem ser excluídas.' })
    await getClienteDemandaService().unlinkProposal(proposta.clienteId, proposta.id)
    propostas.delete(id)
    await pgDeleteProposta(id).catch(() => {})
    auditAsync({
      ator: 'system',
      acao: 'delete',
      recurso: `proposta:${id}`,
      dadosAntes: { clienteId: proposta.clienteId, valorProposta: proposta.valorProposta, status: proposta.status },
    })
    return { success: true, data: { id, deleted: true } }
  })

  /* ---- PDF (real Puppeteer generation) ---- */
  fastify.get('/api/propostas/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const proposta = isPgEnabled() ? await pgGetProposta(id) as unknown as Proposta | null : propostas.get(id)

    if (!proposta) {
      reply.status(404)
      return { success: false, error: 'Proposta não encontrada' }
    }

    try {
      const pdfBuffer = await generatePropostaPdf(proposta)

      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="proposta-${id}.pdf"`)
        .header('Content-Length', pdfBuffer.length)
        .send(pdfBuffer)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error(`[PDF] Falha ao gerar PDF para ${id}:`, msg)
      reply.status(500)
      return { success: false, error: `Erro ao gerar PDF: ${msg}` }
    }
  })

  /* ---- GERAR PROPOSTA INTELIGENTE (15 seções, memória de cálculo, fundamentação legal) ---- */
  fastify.post('/api/propostas/gerar-completa', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      cliente?: DadosClienteProposta
      credito?: ContextoCredito
      eventos?: EventoAdverso[]
      negociacao?: ParametrosNegociacao
    }

    const errors: string[] = []
    if (!body?.cliente || typeof body.cliente !== 'object') errors.push('cliente é obrigatório')
    if (!body?.credito || typeof body.credito !== 'object') errors.push('credito é obrigatório')
    if (!body?.negociacao || typeof body.negociacao !== 'object') errors.push('negociacao é obrigatória')

    if (body?.cliente) {
      if (!body.cliente.nome) errors.push('cliente.nome é obrigatório')
      if (!body.cliente.cidade) errors.push('cliente.cidade é obrigatório')
      if (!body.cliente.uf) errors.push('cliente.uf é obrigatório')
    }
    if (body?.credito) {
      if (!body.credito.credor) errors.push('credito.credor é obrigatório')
      if (!body.credito.contratoAtual) errors.push('credito.contratoAtual é obrigatório')
      if (!Array.isArray(body.credito.contratosOriginais)) errors.push('credito.contratosOriginais deve ser array')
    }
    if (body?.negociacao && !body.negociacao.estrategia) {
      errors.push('negociacao.estrategia é obrigatória')
    }

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    try {
      const proposta = await gerarPropostaInteligente(
        body.cliente as DadosClienteProposta,
        body.credito as ContextoCredito,
        (body.eventos ?? []) as EventoAdverso[],
        body.negociacao as ParametrosNegociacao,
      )

      persistPropostaInteligente(proposta)

      // Também registra versão compacta no Map padrão para aparecer na listagem
      propostaCounter++
      const idCompacto = `prop-${randomUUID()}`
      const resumo: Proposta = {
        id: idCompacto,
        clienteId: body.cliente!.id ?? idCompacto,
        clienteNome: proposta.cliente.nome,
        credor: proposta.credor,
        titulo: proposta.secoes.capa.titulo,
        tipo: mapEstrategiaToTipo(proposta.estrategia),
      status: 'em_analise',
        valorDivida: proposta.metricasChave.valorDividaAtualizado,
        valorProposta: proposta.metricasChave.valorPropostaEstruturada,
        descontoPercentual: proposta.metricasChave.descontoEstimado,
        itens: [],
        condicoes: [],
        fundamentacao: proposta.secoes.sumarioExecutivo?.paragrafoUnico ?? '',
        dataCriacao: proposta.dataGeracao,
        dataValidade: proposta.dataValidade,
        ultimaAtualizacao: proposta.dataGeracao,
        pdfUrl: `/api/propostas/inteligente/${proposta.id}/pdf`,
        observacoes: `Proposta inteligente com 15 seções. ID detalhado: ${proposta.id}`,
      }
      if (body.cliente!.id) await getClienteDemandaService().ensureForProposal(resumo)
      await persistProposta(resumo)

      reply.status(201)
      return {
        success: true,
        data: proposta,
        meta: {
          secoes: Object.keys(proposta.secoes).length,
          metricasChave: proposta.metricasChave,
          resumoId: idCompacto,
        },
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error('[PropostaInteligente] Falha na geração:', msg)
      reply.status(500)
      return { success: false, error: `Erro ao gerar proposta inteligente: ${msg}` }
    }
  })

  /* ---- GET PROPOSTA INTELIGENTE ---- */
  fastify.get('/api/propostas/inteligente/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const proposta = propostasInteligentes.get(id)

    if (!proposta) {
      reply.status(404)
      return { success: false, error: 'Proposta inteligente não encontrada' }
    }

    return { success: true, data: proposta }
  })

  /* ---- LIST PROPOSTAS INTELIGENTES ---- */
  fastify.get('/api/propostas/inteligentes/list', async () => {
    const items = Array.from(propostasInteligentes.values()).map(p => ({
      id: p.id,
      clienteNome: p.cliente.nome,
      credor: p.credor,
      estrategia: p.estrategia,
      dataGeracao: p.dataGeracao,
      dataValidade: p.dataValidade,
      metricasChave: p.metricasChave,
    }))
    return { success: true, data: items, total: items.length }
  })
}

function mapEstrategiaToTipo(estrategia: string): Proposta['tipo'] {
  const e = estrategia.toLowerCase()
  if (e.includes('liquida')) return 'liquidacao'
  if (e.includes('alongamento') || e.includes('parcelamento')) return 'parcelamento'
  if (e.includes('dacao')) return 'liquidacao'
  if (e.includes('revisional') || e.includes('judicial')) return 'acordo_judicial'
  if (e.includes('memoria')) return 'memoria_calculo'
  return 'renegociacao'
}
