import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  upsertCliente as pgUpsertCliente,
  listClientes as pgListClientes,
  deleteCliente as pgDeleteCliente,
} from '../db/ClienteRepository.js'
import { isPgEnabled } from '../db/client.js'
import { auditAsync } from '../db/AuditLog.js'
import { getProspeccaoService } from '../services/prospeccao/ProspeccaoService'
import type { CarConsultaResult, ClimaAgro, CnpjEnrichment, GeoEnrichment, LeadFull, ProducaoMunicipal } from '../services/prospeccao/types'
import { calcularSRAI } from '../services/ScoreSRAI.js'
import { verificarABS } from '../services/VerificadorABS.js'
import {
  criarAcessoPortal,
  hashSenha,
  normalizarUsuario,
  type PortalAcesso,
} from '../services/PortalAuthService.js'
import {
  getAutoCalcOrchestrator,
  buildSraiInput,
  buildAbsInput,
  type ClienteParaAnalise,
} from '../services/cliente/AutoCalcOrchestrator.js'
import type { AnaliseCliente } from '../services/cliente/types.js'
import { getAnalisesBus } from '../services/cliente/AnalisesBus.js'
import { getSmartAdvisor } from '../services/cliente/advisor/SmartAdvisor.js'

/* ========================================================================
 *  Portal do Cliente — tipos anexados
 * ======================================================================== */

/** Mensagem trocada entre cliente e consultor via Portal. */
export interface PortalMensagem {
  id: string
  /** Remetente: 'cliente' (via portal) ou 'consultor' (via sistema). */
  de: 'cliente' | 'consultor' | 'sistema'
  /** Nome exibido do autor (ex: "Paulo Luciano" ou "Christian Kohler"). */
  autorNome: string
  texto: string
  criadoEm: string
  /** Foi lida pela contraparte? */
  lidaEm?: string
}

/* ========================================================================
 *  Tipos
 * ======================================================================== */

/**
 * Snapshot CAR anexado ao cliente — subset relevante do `CarConsultaResult`
 * persistido junto do cliente para exibição no CRM sem depender da rota de
 * prospecção. Preenchido automaticamente pelo enriquecimento on-create/patch.
 */
interface ClienteCarInfo {
  codImovel: string
  areaImovel: number
  municipio: string
  uf: string
  condicaoCadastro: string
  statusAnalise?: string
  modulosFiscais?: number
  areaAntropizada?: number
  areaReservaLegal?: number
  areaPreservacaoPermanente?: number
  areaVegetacaoNativa?: number
  tipoImovel?: 'IRU' | 'AST' | 'PCT'
  source: 'offline' | 'live'
  estrategiaMatch?: string
  confidenceMatch?: number
  outrosImoveis?: number
  totalHectares?: number
  enriquecidoEm: string
}

interface ClienteCarStatus {
  status: 'pendente' | 'ok' | 'nao_encontrado' | 'erro'
  mensagem?: string
  errorCode?: string
  tentadoEm?: string
}

/**
 * Endereço canônico do cliente — composto de ViaCEP (Correios) + BrasilAPI (RFB)
 * + fallback manual. Em geral o CEP e o município são autoritativos via RFB
 * para PJ, e via ViaCEP para PF sem CNPJ.
 */
interface ClienteEnderecoEnriquecido {
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  /** Código IBGE do município (7 dígitos). Chave p/ cruzar com CONAB/PAM. */
  codigoMunicipioIbge?: number
  /** Região administrativa (Norte, Nordeste, Sul etc.) */
  regiao?: string
  /** DDD principal do município (dígitos). */
  ddd?: string
  /** Endereço completo formatado — pronto p/ exibir. */
  formatado?: string
  /** Coordenadas (Nominatim OSM). */
  coordenadas?: { lat: number; lng: number; source: 'nominatim' | 'ibge' }
  fonte: 'brasilapi' | 'viacep' | 'manual' | 'composto'
  enriquecidoEm: string
}

/** Informações RFB resumidas + QSA — subset do CnpjEnrichment relevante no CRM. */
interface ClienteCnpjInfo {
  razaoSocial: string
  nomeFantasia?: string
  cnaeFiscal: string
  cnaeFiscalDescricao: string
  cnaesSecundarios: Array<{ codigo: string; descricao: string }>
  situacaoCadastral: string
  motivoSituacaoCadastral?: string
  situacaoEspecial?: string
  dataAbertura?: string
  capitalSocial?: number
  porte?: string
  naturezaJuridica?: string
  optantePeloSimples?: boolean | null
  optantePeloMei?: boolean | null
  socios: Array<{
    nome: string
    qualificacao: string
    dataEntrada?: string
    faixaEtaria?: string
  }>
  enriquecidoEm: string
}

/** Canal de contato descoberto via enriquecimento (pode haver vários). */
interface ContatoDescoberto {
  tipo: 'telefone' | 'email' | 'fax'
  valor: string
  fonte: 'brasilapi' | 'manual' | 'outro'
  label?: string // ex.: 'Principal', 'Secundário', 'Fax RFB'
}

interface ClienteEnrichStatus {
  cnpj?: 'ok' | 'erro' | 'nao_aplicavel' | 'pendente'
  geo?: 'ok' | 'erro' | 'nao_encontrado' | 'pendente'
  clima?: 'ok' | 'erro' | 'nao_disponivel' | 'pendente'
  producao?: 'ok' | 'erro' | 'nao_disponivel' | 'pendente'
  mensagem?: string
  tentadoEm?: string
}

/**
 * Origem do cliente quando importado a partir da aba Prospecção.
 * Preserva o vínculo com o lead PGFN original para auditoria.
 */
interface LeadOrigem {
  cpfCnpjClean: string
  scoreTotal?: number
  classificacao?: 'quente' | 'morno' | 'frio' | 'reativo'
  honorariosEstimados?: number
  temAjuizada?: boolean
  totalDividaPgfn?: number
  importadoEm: string
}

/**
 * Exposição de commodity por cliente — quanto do faturamento depende de cada
 * cultura/proteína. Usado pelo simulador multi-cenário e pelo score SRAI para
 * avaliar sensibilidade a variação de preço/produtividade.
 */
interface ExposicaoCommodity {
  /** soja, milho, algodao, cafe, cana, arroz, trigo, feijao, boi, leite, etc. */
  commodity: string
  /** Área dedicada (ha) — zero para pecuária/leite se indicado por cabeças. */
  areaHa: number
  /** Produtividade esperada em sc/ha, @/ha, kg/ha, L/dia — depende da commodity. */
  produtividade: number
  /** Unidade de produtividade (sc/ha, @/ha, kg/ha, L/dia). */
  unidadeProdutividade: string
  /** Preço de referência no momento do cadastro — R$ por unidade. */
  precoReferencia: number
  /** Unidade de preço (R$/sc, R$/@, R$/kg, R$/L). */
  unidadePreco: string
  /** % do faturamento total estimado (informativo — soma pode não ser 100%). */
  pctReceita?: number
  /** Data da última atualização (ISO date). */
  atualizadoEm: string
  /** Observações livres (fornecedor de sementes, contrato futuro, etc.). */
  observacoes?: string
}

/**
 * Checklist de visita técnica executada por consultor em campo.
 * Padroniza observações e gera evidências para pareceres de crédito.
 */
interface VisitaTecnica {
  id: string
  data: string // ISO date
  consultor: string
  duracaoMinutos?: number
  coordenadas?: { lat: number; lng: number }
  checklist: {
    /** Conferência de limites, cercas, acessos. */
    infraestruturaOk?: boolean
    /** Máquinas e implementos presentes/operacionais. */
    maquinarioOk?: boolean
    /** Lavoura/pastagem em estado compatível com projeção. */
    lavouraOk?: boolean
    /** Armazéns/silos com capacidade adequada. */
    armazenagemOk?: boolean
    /** Regularidade ambiental aparente (APP, reserva legal). */
    ambientalOk?: boolean
    /** Livros contábeis/notas disponíveis. */
    documentacaoOk?: boolean
    /** Produtor presente e cooperativo. */
    receptividadeOk?: boolean
  }
  observacoesGerais?: string
  riscos?: string[]
  oportunidades?: string[]
  fotos?: Array<{ url: string; legenda?: string }>
  criadoEm: string
}

interface Divida {
  contrato: string
  valorOriginal: number
  valorAtualizado: number
  vencimento: string
  status: 'ativa' | 'renegociada' | 'paga' | 'em_acordo'
  credor: string
}

interface Pagamento {
  data: string
  valor: number
  descricao: string
  tipo: 'pagamento' | 'dacao' | 'deposito_judicial'
}

interface TimelineEvent {
  data: string
  tipo: 'contato' | 'proposta' | 'pagamento' | 'reuniao' | 'documento' | 'analise' | 'acordo' | 'vencimento'
  descricao: string
  detalhes?: string
}

interface Cliente {
  id: string
  nome: string
  cpfCnpj: string
  cidade: string
  uf: string
  telefone: string
  email: string
  atividade: string
  areaTotalHa: number
  culturas: string[]
  estagio: 'prospeccao' | 'analise' | 'negociacao' | 'acordo' | 'encerrado'
  consultor: string
  credor: string
  valorTotalDivida: number
  valorTotalPago: number
  dividas: Divida[]
  pagamentos: Pagamento[]
  timeline: TimelineEvent[]
  dataCadastro: string
  ultimaAtualizacao: string
  observacoes: string
  /** Dados do Cadastro Ambiental Rural — enriquecido automaticamente no create/update. */
  car?: ClienteCarInfo
  /** Último resultado do enriquecimento CAR (sucesso, falha, pendente). */
  carStatus?: ClienteCarStatus
  /** Código CAR (principal ou informado manualmente) — usado para re-enriquecer. */
  carCodigoImovel?: string
  /** Endereço completo canônico (Correios + RFB + geo). */
  endereco?: ClienteEnderecoEnriquecido
  /** Dados RFB/CNPJ — só para PJ. */
  cnpjInfo?: ClienteCnpjInfo
  /** Todos os canais de contato descobertos (BrasilAPI + manual). */
  contatos?: ContatoDescoberto[]
  /** CEP (dígitos). Deriva do endereço; mantido flat p/ filtros. */
  cep?: string
  /** Status dos enriquecimentos secundários (CNPJ, Geo). CAR fica em carStatus. */
  enrichStatus?: ClienteEnrichStatus
  /** Clima agroclimático anual do ponto (NASA POWER). */
  clima?: ClimaAgro
  /** Produção agrícola e pecuária do município (IBGE SIDRA). */
  producaoMunicipal?: ProducaoMunicipal
  /** Origem: se foi importado a partir da prospecção PGFN. */
  leadOrigem?: LeadOrigem
  /** Próxima ação agendada (data + descrição curta). Renderizada no kanban e no detalhe. */
  proximaAcao?: {
    data: string // YYYY-MM-DD
    descricao: string
    criadoEm: string
    criadoPor?: string
  }
  /** Tags livres para segmentar carteira (ex: "alta-prioridade", "aguardando-doc"). */
  tags?: string[]
  /** Notas internas (comentários livres) — equipe interna. */
  notas?: Array<{
    id: string
    autor: string
    criadoEm: string
    texto: string
  }>
  /** Timestamp da última transição de estágio (aging p/ SLA). */
  estagioDesde?: string
  /** Exposição por commodity — base para simulador e score SRAI. */
  exposicaoCommodity?: ExposicaoCommodity[]
  /** Checklists de visitas técnicas realizadas. */
  visitasTecnicas?: VisitaTecnica[]
  /** Credencial do Portal do Cliente (hash scrypt + metadados). */
  portalAcesso?: PortalAcesso
  /** Histórico de mensagens do Portal do Cliente (cliente ↔ consultor). */
  portalMensagens?: PortalMensagem[]
  /**
   * Snapshot das análises automáticas (SRAI + ABS + dívidas + projeções +
   * margem). Materializado pelo `AutoCalcOrchestrator` após enriquecimento e
   * persistido em disco via `AnalisesRepository`. Fica hidratado em memória
   * para o cliente não precisar disparar GET /srai + /abs + /... no mount.
   */
  analises?: AnaliseCliente
}

/* ========================================================================
 *  Dados em memória (seed com casos reais + fictícios)
 * ======================================================================== */

export const clientes: Map<string, Cliente> = new Map()

/**
 * Helper unificado: grava no Map (source of truth runtime) e tenta
 * espelhar no Postgres via dual-write. Erros do PG são best-effort —
 * nunca falham o caller. Também emite trilha de auditoria LGPD.
 */
function persistCliente(c: Cliente, ator = 'system'): void {
  const anterior = clientes.get(c.id)
  clientes.set(c.id, c)
  // fire-and-forget no upsert PG (não bloqueia o request).
  void pgUpsertCliente(c as unknown as Record<string, unknown> as Parameters<typeof pgUpsertCliente>[0])
  auditAsync({
    ator,
    acao: anterior ? 'update' : 'create',
    recurso: `cliente:${c.id}`,
    // Snapshots leves (chaves principais) para não estourar JSONB.
    // Caller que precisa do diff completo consulta `payload` na tabela cliente.
    dadosAntes: anterior
      ? { estagio: anterior.estagio, valorTotalDivida: anterior.valorTotalDivida, valorTotalPago: anterior.valorTotalPago }
      : null,
    dadosDepois: { estagio: c.estagio, valorTotalDivida: c.valorTotalDivida, valorTotalPago: c.valorTotalPago },
  })
}

/**
 * Variante que NÃO toca PG — usada pelo seed inicial. O seed roda em
 * module-load e não pode sobrescrever um PG já populado (perderia
 * mutações persistidas). A sincronização Map→PG é decidida depois
 * por `hydrateOrSeedClientesPg()` que respeita o que já está no banco.
 */
function setClienteLocal(c: Cliente): void {
  clientes.set(c.id, c)
}

/**
 * Boot orchestrator (chamado pelo server.ts após app.listen):
 *   - Se PG está OFF → no-op (Map é a fonte e está cheia via seed).
 *   - Se PG tem ≥ 1 cliente → SOBRESCREVE o Map com os dados do PG
 *     (estado persistido vence o seed em memória).
 *   - Se PG está vazio → semeia o PG com os clientes em Map agora
 *     (one-shot: o seed em memória é preservado no banco).
 *
 * Retorna { hydrated, seeded } para log do servidor.
 */
export async function hydrateOrSeedClientesPg(): Promise<{ hydrated: number; seeded: number }> {
  if (!isPgEnabled()) return { hydrated: 0, seeded: 0 }
  const fromPg = await pgListClientes()
  if (fromPg.length > 0) {
    // Sobrescreve Map (PG vence seed)
    clientes.clear()
    for (const c of fromPg) clientes.set(c.id as string, c as unknown as Cliente)
    return { hydrated: fromPg.length, seeded: 0 }
  }
  // PG vazio: dump do Map atual no banco (one-shot)
  let seeded = 0
  for (const c of clientes.values()) {
    await pgUpsertCliente(c as unknown as Record<string, unknown> as Parameters<typeof pgUpsertCliente>[0])
    seeded++
  }
  return { hydrated: 0, seeded }
}

/** Backward-compat: alias da função antiga. */
export const hydrateClientesFromPg = hydrateOrSeedClientesPg

function seed() {
  const data: Cliente[] = [
    /* ---- CASO REAL 1: Ailton Caeiro da Silva ---- */
    {
      id: 'cli-001',
      nome: 'Ailton Caeiro da Silva',
      cpfCnpj: '028.XXX.XXX-80',
      cidade: 'Toledo',
      uf: 'PR',
      telefone: '(45) 99999-1001',
      email: 'ailton.caeiro@email.com',
      atividade: 'Produtor rural - Grãos (soja, milho)',
      areaTotalHa: 480,
      culturas: ['soja', 'milho'],
      estagio: 'negociacao',
      consultor: 'Eduardo Mendes',
      credor: 'Sicoob',
      valorTotalDivida: 2148495.32,
      valorTotalPago: 2215482.03,
      dividas: [
        { contrato: '23110-0', valorOriginal: 350000.00, valorAtualizado: 412320.50, vencimento: '2023-06-15', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '24821-2', valorOriginal: 480000.00, valorAtualizado: 558912.00, vencimento: '2023-08-20', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '25381-4', valorOriginal: 320000.00, valorAtualizado: 379650.82, vencimento: '2023-10-10', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '25882-7', valorOriginal: 290000.00, valorAtualizado: 345200.00, vencimento: '2024-01-15', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '27981-3', valorOriginal: 410000.00, valorAtualizado: 452412.00, vencimento: '2024-03-20', status: 'renegociada', credor: 'Sicoob' },
        { contrato: '30262-4', valorOriginal: 2148495.32, valorAtualizado: 2148495.32, vencimento: '2025-12-31', status: 'em_acordo', credor: 'Sicoob' },
      ],
      pagamentos: [
        { data: '2024-03-15', valor: 500000.00, descricao: 'Pagamento parcial acordo', tipo: 'pagamento' },
        { data: '2024-06-20', valor: 450000.00, descricao: 'Pagamento pós-safra', tipo: 'pagamento' },
        { data: '2024-09-10', valor: 380000.00, descricao: 'Pagamento parcial', tipo: 'pagamento' },
        { data: '2025-01-15', valor: 521285.02, descricao: 'Dação imóvel mat. 45434', tipo: 'dacao' },
        { data: '2025-03-20', valor: 300000.00, descricao: 'Pagamento safra 24/25', tipo: 'pagamento' },
        { data: '2025-04-10', valor: 64197.01, descricao: 'Capital social Sicoob - quitação', tipo: 'pagamento' },
      ],
      timeline: [
        { data: '2024-01-10', tipo: 'contato', descricao: 'Primeiro contato - cliente busca renegociação de 5 contratos Sicoob' },
        { data: '2024-01-25', tipo: 'analise', descricao: 'Levantamento completo: contratos 23110-0, 24821-2, 25381-4, 25882-7, 27981-3' },
        { data: '2024-02-05', tipo: 'proposta', descricao: 'Proposta de consolidação em contrato único 30262-4' },
        { data: '2024-02-20', tipo: 'reuniao', descricao: 'Reunião Sicoob Toledo - apresentação proposta de liquidação' },
        { data: '2024-03-15', tipo: 'pagamento', descricao: 'Primeiro pagamento do acordo: R$500.000,00' },
        { data: '2024-06-20', tipo: 'pagamento', descricao: 'Pagamento pós-safra: R$450.000,00' },
        { data: '2024-09-10', tipo: 'pagamento', descricao: 'Pagamento parcial: R$380.000,00' },
        { data: '2025-01-15', tipo: 'acordo', descricao: 'Dação em pagamento - imóvel matrícula 45434 avaliado em R$521.285,02' },
        { data: '2025-03-20', tipo: 'pagamento', descricao: 'Pagamento safra 24/25: R$300.000,00' },
        { data: '2025-04-10', tipo: 'pagamento', descricao: 'Quitação final via capital social Sicoob: R$64.197,01' },
      ],
      dataCadastro: '2024-01-10',
      ultimaAtualizacao: '2025-04-10',
      observacoes: 'Proposta de liquidação via dação imóvel mat. 45434 + capital social R$64.197,01. Pagamentos totalizaram R$2.215.482,03.',
    },

    /* ---- CASO REAL 2: Paulo Luciano de Oliveira ---- */
    {
      id: 'cli-002',
      nome: 'Paulo Luciano de Oliveira',
      cpfCnpj: '452.XXX.XXX-91',
      cidade: 'Dourados',
      uf: 'MS',
      telefone: '(67) 99988-2002',
      email: 'paulo.luciano@email.com',
      atividade: 'Produtor rural - Grãos e pastagem',
      areaTotalHa: 320,
      culturas: ['soja', 'milho', 'pastagem'],
      estagio: 'negociacao',
      consultor: 'Eduardo Mendes',
      credor: 'Fertiflora/Herbioeste',
      valorTotalDivida: 277380.00,
      valorTotalPago: 30000.00,
      dividas: [
        { contrato: '20189', valorOriginal: 86940.00, valorAtualizado: 86940.00, vencimento: '2025-06-30', status: 'em_acordo', credor: 'Fertiflora' },
        { contrato: '20192', valorOriginal: 86940.00, valorAtualizado: 86940.00, vencimento: '2025-08-15', status: 'em_acordo', credor: 'Fertiflora' },
        { contrato: '20190', valorOriginal: 103500.00, valorAtualizado: 103500.00, vencimento: '2025-10-30', status: 'em_acordo', credor: 'Herbioeste' },
      ],
      pagamentos: [
        { data: '2025-12-23', valor: 10000.00, descricao: 'Sinal de boa-fé', tipo: 'pagamento' },
        { data: '2026-02-26', valor: 20000.00, descricao: 'Parcela intermediária', tipo: 'pagamento' },
      ],
      timeline: [
        { data: '2025-08-10', tipo: 'contato', descricao: 'Contato inicial - 3 títulos vencidos Fertiflora/Herbioeste' },
        { data: '2025-08-20', tipo: 'analise', descricao: 'Memória de cálculo: títulos 20189 (R$86.940), 20192 (R$86.940), 20190 (R$103.500)' },
        { data: '2025-09-05', tipo: 'proposta', descricao: 'Proposta: 4x R$70.550 alinhadas ao fluxo da safra' },
        { data: '2025-09-15', tipo: 'reuniao', descricao: 'Reunião com Fertiflora - negociação parcelas' },
        { data: '2025-12-23', tipo: 'pagamento', descricao: 'Sinal de boa-fé: R$10.000,00' },
        { data: '2026-02-26', tipo: 'pagamento', descricao: 'Parcela intermediária: R$20.000,00' },
      ],
      dataCadastro: '2025-08-10',
      ultimaAtualizacao: '2026-02-26',
      observacoes: 'Memória de cálculo elaborada. Proposta de 4x R$70.550 alinhadas safra. Pagamentos parciais em andamento.',
    },
  ]

  for (const c of data) {
    // Seed inicial só popula o Map; o PG é decidido pelo
    // `hydrateOrSeedClientesPg` no boot (PG vence se já tiver dados).
    setClienteLocal(c)
  }
}

seed()

/* ========================================================================
 *  Enriquecimento CAR automático
 * ======================================================================== */

/**
 * Dispara enriquecimento CAR em background para todos os clientes seed
 * ainda sem `car` — limite 1/s para não sobrecarregar. Fire-and-forget:
 * erros viram `carStatus.erro` e não interrompem o boot.
 */
function backfillSeedEnrichment(): void {
  const pendentes = Array.from(clientes.values()).filter((c) => !c.car && !c.carStatus)
  if (pendentes.length === 0) return
  setImmediate(async () => {
    for (const c of pendentes) {
      c.carStatus = { status: 'pendente', tentadoEm: new Date().toISOString() }
      try {
        await enrichAndApply(c, { motivo: 'backfill boot' })
      } catch {
        // Silencioso — status já foi preenchido por enrichAndApply
      }
      // Throttle suave entre enriquecimentos
      await new Promise((r) => setTimeout(r, 250))
    }
  })
}

function mapCarInfo(
  car: CarConsultaResult,
  source: 'offline' | 'live',
  outrosImoveis: number | undefined,
  totalHectares: number | undefined,
): ClienteCarInfo {
  return {
    codImovel: car.codImovel,
    areaImovel: car.areaImovel,
    municipio: car.municipio,
    uf: car.uf,
    condicaoCadastro: car.condicaoCadastro,
    statusAnalise: car.statusAnalise,
    modulosFiscais: car.modulosFiscais,
    areaAntropizada: car.areaAntropizada,
    areaReservaLegal: car.areaReservaLegal,
    areaPreservacaoPermanente: car.areaPreservacaoPermanente,
    areaVegetacaoNativa: car.areaVegetacaoNativa,
    tipoImovel: car.tipoImovel,
    source,
    estrategiaMatch: (car as any)._matchEstrategia,
    confidenceMatch: (car as any)._matchConfidence,
    outrosImoveis: outrosImoveis && outrosImoveis > 1 ? outrosImoveis - 1 : undefined,
    totalHectares,
    enriquecidoEm: new Date().toISOString(),
  }
}

function mapCnpjInfo(c: CnpjEnrichment): ClienteCnpjInfo {
  return {
    razaoSocial: c.razaoSocial,
    nomeFantasia: c.nomeFantasia,
    cnaeFiscal: c.cnaeFiscal,
    cnaeFiscalDescricao: c.cnaeFiscalDescricao,
    cnaesSecundarios: c.cnaesSecundarios,
    situacaoCadastral: c.situacaoCadastral,
    motivoSituacaoCadastral: c.motivoSituacaoCadastral,
    situacaoEspecial: c.situacaoEspecial,
    dataAbertura: c.dataAbertura,
    capitalSocial: c.capitalSocial,
    porte: c.porte,
    naturezaJuridica: c.naturezaJuridica,
    optantePeloSimples: c.optantePeloSimples,
    optantePeloMei: c.optantePeloMei,
    socios: c.socios,
    enriquecidoEm: c.enriquecidoEm,
  }
}

/**
 * Funde CEP/endereço vindos de 3 fontes numa estrutura única. Prioridade:
 *   RFB (BrasilAPI) > Correios (ViaCEP/Geo) > manual informado no cadastro.
 * Campos ausentes em fontes mais confiáveis caem na próxima.
 */
function mapEndereco(
  cnpj: CnpjEnrichment | undefined,
  geo: GeoEnrichment | undefined,
  manual: { cidade?: string; uf?: string; cep?: string },
): ClienteEnderecoEnriquecido | undefined {
  const rfb = cnpj?.endereco
  const hasAny = rfb || geo || manual.cep
  if (!hasAny) return undefined

  const cep = (rfb?.cep || geo?.cep || manual.cep || '').replace(/\D/g, '') || undefined
  const logradouro = rfb?.logradouro || geo?.logradouro
  const numero = rfb?.numero || undefined
  const complemento = rfb?.complemento || geo?.complemento
  const bairro = rfb?.bairro || geo?.bairro
  const cidade = rfb?.municipio || geo?.cidade || manual.cidade
  const uf = (rfb?.uf || geo?.uf || manual.uf || '').toUpperCase() || undefined
  const codigoMunicipioIbge = rfb?.codigoMunicipioIbge ?? geo?.codigoIbge

  const formatadoParts = [
    logradouro && numero ? `${logradouro}, ${numero}` : logradouro,
    complemento,
    bairro,
    cidade && uf ? `${cidade}/${uf}` : cidade || uf,
    cep ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : null,
  ].filter(Boolean)

  const fonte: ClienteEnderecoEnriquecido['fonte'] =
    rfb && geo ? 'composto' : rfb ? 'brasilapi' : geo ? 'viacep' : 'manual'

  return {
    cep,
    logradouro: logradouro || undefined,
    numero,
    complemento: complemento || undefined,
    bairro: bairro || undefined,
    cidade,
    uf,
    codigoMunicipioIbge,
    regiao: geo?.regiao,
    ddd: geo?.ddd,
    formatado: formatadoParts.length > 0 ? formatadoParts.join(' · ') : undefined,
    coordenadas: geo?.coordenadas || undefined,
    fonte,
    enriquecidoEm: new Date().toISOString(),
  }
}

/**
 * Lista de contatos = tudo que a BrasilAPI trouxer + o que o usuário digitou
 * manualmente. Deduplica por (tipo, valor normalizado).
 */
function buildContatos(
  cnpj: CnpjEnrichment | undefined,
  manual: { telefone?: string; email?: string },
): ContatoDescoberto[] {
  const out: ContatoDescoberto[] = []
  const seen = new Set<string>()

  const addPhone = (raw: string | undefined, fonte: 'brasilapi' | 'manual', label?: string, tipo: 'telefone' | 'fax' = 'telefone') => {
    if (!raw) return
    const digits = String(raw).replace(/\D/g, '')
    if (digits.length < 8) return
    const key = tipo + ':' + digits
    if (seen.has(key)) return
    seen.add(key)
    out.push({ tipo, valor: digits, fonte, label })
  }
  const addEmail = (raw: string | undefined, fonte: 'brasilapi' | 'manual', label?: string) => {
    if (!raw) return
    const v = String(raw).trim().toLowerCase()
    if (!v.includes('@')) return
    const key = 'email:' + v
    if (seen.has(key)) return
    seen.add(key)
    out.push({ tipo: 'email', valor: v, fonte, label })
  }

  // RFB/BrasilAPI — costuma ser o telefone da matriz
  addPhone(cnpj?.telefone1, 'brasilapi', 'RFB principal')
  addPhone(cnpj?.telefone2, 'brasilapi', 'RFB secundário')
  addPhone(cnpj?.fax, 'brasilapi', 'RFB fax', 'fax')
  addEmail(cnpj?.email, 'brasilapi', 'RFB')

  // Manual — o que já estava no cadastro
  addPhone(manual.telefone, 'manual', 'Cadastro')
  addEmail(manual.email, 'manual', 'Cadastro')

  return out
}

/**
 * Aplica o resultado do enriquecimento COMPLETO ao cliente (in-place):
 *   • CAR     → `car`, `carStatus`, `areaTotalHa` (se área SICAR confiável)
 *   • CNPJ    → `cnpjInfo`, `atividade` (se vazia)
 *   • Geo     → `endereco` (com coordenadas e IBGE) + `cep`
 *   • Contato → `contatos[]` (merge RFB + manual)
 *   • `enrichStatus` — resumo dos passos secundários
 *
 * Timeline recebe um único evento consolidado descrevendo o que foi descoberto.
 * Campos preenchidos manualmente no cadastro nunca são sobrescritos (exceto quando estão vazios).
 */
async function enrichAndApply(
  cliente: Cliente,
  opts: { codImovel?: string; motivo?: string } = {},
): Promise<void> {
  const agora = new Date().toISOString()
  const agoraDia = agora.slice(0, 10)
  try {
    const service = getProspeccaoService()
    const res = await service.enriquecerCliente({
      cpfCnpj: cliente.cpfCnpj,
      nome: cliente.nome,
      uf: cliente.uf,
      cidade: cliente.cidade,
      cep: cliente.cep,
      codImovel: opts.codImovel || cliente.carCodigoImovel,
    })

    // ---- CAR ----
    const resumo: string[] = []
    if (res.car && res.carSource) {
      const info = mapCarInfo(res.car, res.carSource, res.carOutrosImoveis?.length, res.totalHectares)
      cliente.car = info
      cliente.carCodigoImovel = info.codImovel
      cliente.carStatus = {
        status: 'ok',
        mensagem: `CAR ${info.codImovel} · ${info.areaImovel.toLocaleString('pt-BR')} ha em ${info.municipio}/${info.uf}`,
        tentadoEm: agora,
      }
      const sicarTotal = res.totalHectares ?? info.areaImovel
      if ((!cliente.areaTotalHa || cliente.areaTotalHa <= 0) && sicarTotal > 0) {
        cliente.areaTotalHa = Math.round(sicarTotal)
      }
      resumo.push(`CAR ${info.codImovel} (${info.areaImovel.toLocaleString('pt-BR')} ha)`)
    } else {
      const carErr = res.errors.car
      const noMatch = !!carErr && /não encontrado|NO_MATCH/i.test(carErr)
      cliente.carStatus = {
        status: noMatch ? 'nao_encontrado' : carErr ? 'erro' : cliente.carStatus?.status || 'nao_encontrado',
        mensagem: carErr,
        errorCode: noMatch ? 'NO_MATCH' : undefined,
        tentadoEm: agora,
      }
    }

    // ---- CNPJ ----
    if (res.cnpj) {
      cliente.cnpjInfo = mapCnpjInfo(res.cnpj)
      if (!cliente.atividade && res.cnpj.cnaeFiscalDescricao) {
        cliente.atividade = res.cnpj.cnaeFiscalDescricao
      }
      resumo.push(`RFB: ${res.cnpj.razaoSocial}`)
    }

    // ---- Endereço + Geo ----
    const endereco = mapEndereco(res.cnpj || undefined, res.geo || undefined, {
      cidade: cliente.cidade,
      uf: cliente.uf,
      cep: cliente.cep,
    })
    if (endereco) {
      cliente.endereco = endereco
      if (endereco.cep) cliente.cep = endereco.cep
      // Preenche cidade/uf se vieram vazios no cadastro
      if (!cliente.cidade && endereco.cidade) cliente.cidade = endereco.cidade
      if (!cliente.uf && endereco.uf) cliente.uf = endereco.uf
      if (endereco.coordenadas) resumo.push(`geo: ${endereco.coordenadas.lat.toFixed(4)}, ${endereco.coordenadas.lng.toFixed(4)}`)
      else if (endereco.formatado) resumo.push('endereço canônico')
    }

    // ---- Contatos (merge RFB + manual) ----
    const contatos = buildContatos(res.cnpj || undefined, {
      telefone: cliente.telefone,
      email: cliente.email,
    })
    if (contatos.length > 0) {
      cliente.contatos = contatos
      // Preenche telefone/email flat se vazios, usando RFB
      if (!cliente.telefone) {
        const tel = contatos.find((c) => c.tipo === 'telefone' && c.fonte === 'brasilapi')
        if (tel) cliente.telefone = tel.valor
      }
      if (!cliente.email) {
        const em = contatos.find((c) => c.tipo === 'email' && c.fonte === 'brasilapi')
        if (em) cliente.email = em.valor
      }
      const rfbTel = contatos.filter((c) => c.fonte === 'brasilapi' && c.tipo === 'telefone').length
      const rfbEmail = contatos.some((c) => c.fonte === 'brasilapi' && c.tipo === 'email')
      if (rfbTel > 0 || rfbEmail) {
        resumo.push(`${rfbTel} tel${rfbEmail ? ' + email' : ''} RFB`)
      }
    }

    // ---- Clima (NASA POWER) ----
    if (res.clima) {
      cliente.clima = res.clima
      resumo.push(
        `clima ${res.clima.tempMediaAnualC != null ? res.clima.tempMediaAnualC.toFixed(1) + '°C' : ''}` +
        (res.clima.chuvaAcumuladaAnualMm != null ? ` · ${Math.round(res.clima.chuvaAcumuladaAnualMm)} mm/ano` : ''),
      )
    }

    // ---- Produção municipal (IBGE SIDRA) ----
    if (res.producaoMunicipal) {
      cliente.producaoMunicipal = res.producaoMunicipal
      const top = res.producaoMunicipal.culturas.slice(0, 3).map((c) => c.cultura).join(', ')
      if (top) resumo.push(`top culturas município: ${top}`)
    }

    // ---- Status resumo dos enriquecimentos ----
    cliente.enrichStatus = {
      cnpj: res.cnpj ? 'ok' : res.errors.cnpj ? 'erro' : cliente.cpfCnpj.replace(/\D/g, '').length === 14 ? 'nao_aplicavel' : 'nao_aplicavel',
      geo: res.geo ? 'ok' : res.errors.geo ? 'nao_encontrado' : 'nao_encontrado',
      clima: res.clima ? 'ok' : res.errors.clima ? 'erro' : 'nao_disponivel',
      producao: res.producaoMunicipal ? 'ok' : res.errors.producao ? 'erro' : 'nao_disponivel',
      mensagem: [res.errors.cnpj, res.errors.geo, res.errors.clima, res.errors.producao].filter(Boolean).join(' · ') || undefined,
      tentadoEm: agora,
    }

    // ---- Timeline consolidada ----
    if (resumo.length > 0) {
      cliente.timeline.push({
        data: agoraDia,
        tipo: 'documento',
        descricao: 'Enriquecimento automático concluído',
        detalhes: resumo.join(' · ') + (opts.motivo ? ` · ${opts.motivo}` : ''),
      })
    }
  } catch (err: any) {
    cliente.carStatus = {
      status: 'erro',
      mensagem: err?.message || 'falha desconhecida',
      errorCode: err?.code || 'UNKNOWN',
      tentadoEm: agora,
    }
    cliente.enrichStatus = {
      mensagem: err?.message || 'falha desconhecida',
      tentadoEm: agora,
    }
  }
  cliente.ultimaAtualizacao = agoraDia
}

/* ========================================================================
 *  AutoCalc — orquestrador de análises automáticas
 * ======================================================================== */

/**
 * Dispara o orquestrador em background e, ao terminar, anexa o snapshot ao
 * cliente em memória. Sem await — o consumidor vê o snapshot atualizado na
 * próxima leitura (GET /clientes/:id). Idempotente via `inputHash`.
 */
function scheduleAnalises(cliente: Cliente, motivo: string): void {
  const orch = getAutoCalcOrchestrator()
  orch.schedule(cliente as unknown as ClienteParaAnalise)
  // Quando concluir, hidrata `cliente.analises` e (se algo mudou) registra eventos.
  setImmediate(async () => {
    try {
      const analise = await orch.orchestrate(cliente as unknown as ClienteParaAnalise)
      const antes = cliente.analises
      cliente.analises = analise
      registrarDiffsNaTimeline(cliente, antes, analise, motivo)
      try {
        getAnalisesBus().emitAtualizada({ clienteId: cliente.id, analise })
      } catch {
        // best-effort
      }
    } catch {
      // erros já são logados pelo orquestrador
    }
  })
}

/**
 * Compara o snapshot anterior e o novo e empurra para `timeline` apenas as
 * mudanças que o consultor precisa ver. Evita registrar quando o hash bateu
 * e nada mudou (orquestrador já pulou o recálculo).
 */
function registrarDiffsNaTimeline(
  cliente: Cliente,
  antes: AnaliseCliente | undefined,
  depois: AnaliseCliente,
  motivo: string,
): void {
  const hoje = new Date().toISOString().slice(0, 10)
  if (antes && antes.inputHash === depois.inputHash) return

  const eventos: string[] = []

  if (depois.srai) {
    const antesSrai = antes?.srai
    if (!antesSrai) {
      eventos.push(`Análise automática concluída: SRAI ${depois.srai.scoreTotal} (${depois.srai.classificacao})`)
    } else if (
      antesSrai.scoreTotal !== depois.srai.scoreTotal ||
      antesSrai.classificacao !== depois.srai.classificacao
    ) {
      eventos.push(`Score SRAI atualizado: ${antesSrai.scoreTotal} → ${depois.srai.scoreTotal} (${depois.srai.classificacao})`)
    }
  }

  if (depois.abs && antes?.abs && antes.abs.nivelElegibilidade !== depois.abs.nivelElegibilidade) {
    eventos.push(`AB+S: elegibilidade ${antes.abs.nivelElegibilidade} → ${depois.abs.nivelElegibilidade}`)
  }

  if (depois.saldoRecalculado && antes?.saldoRecalculado) {
    const antesTotal = antes.saldoRecalculado.totalSaldoRecalculado
    const depoisTotal = depois.saldoRecalculado.totalSaldoRecalculado
    if (antesTotal > 0) {
      const variacao = Math.abs(depoisTotal - antesTotal) / antesTotal
      if (variacao >= 0.05) {
        const pct = ((depoisTotal - antesTotal) / antesTotal) * 100
        eventos.push(`Saldo recalculado ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% (R$ ${depoisTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})`)
      }
    }
  }

  if (depois.margemCliente && antes?.margemCliente && antes.margemCliente.classificacao !== depois.margemCliente.classificacao) {
    eventos.push(`Margem financeira: ${antes.margemCliente.classificacao} → ${depois.margemCliente.classificacao}`)
  }

  const criticosAntes = new Set(
    (antes?.alertasTop ?? []).filter((a) => a.nivel === 'critico').map((a) => a.mensagem),
  )
  const criticosDepois = new Set(
    depois.alertasTop.filter((a) => a.nivel === 'critico').map((a) => a.mensagem),
  )
  for (const msg of criticosDepois) {
    if (!criticosAntes.has(msg)) eventos.push(`Alerta crítico: ${msg}`)
  }
  for (const msg of criticosAntes) {
    if (!criticosDepois.has(msg)) eventos.push(`Alerta resolvido: ${msg}`)
  }

  for (const descricao of eventos) {
    cliente.timeline.push({ data: hoje, tipo: 'analise', descricao, detalhes: motivo })
  }
}

/** Localiza cliente por CPF/CNPJ (digits-only) — usado pelo listener do bus. */
function buscarClientePorCpfCnpj(cpfCnpj: string): Cliente | null {
  const digits = cpfCnpj.replace(/\D/g, '')
  if (!digits) return null
  for (const c of clientes.values()) {
    if (c.cpfCnpj.replace(/\D/g, '') === digits) return c
  }
  return null
}

/** Janela de frescor do snapshot antes de agendar refresh automático. */
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function snapshotEstaVelho(analise: AnaliseCliente): boolean {
  const geradoEm = Date.parse(analise.geradoEm)
  if (!Number.isFinite(geradoEm)) return true
  return Date.now() - geradoEm > SNAPSHOT_TTL_MS
}

/** Backfill de análises ao boot — garante que seeds tenham snapshot inicial. */
function backfillSeedAnalises(): void {
  const alvos = Array.from(clientes.values())
  if (alvos.length === 0) return
  setImmediate(async () => {
    // Aguarda o enriquecimento CAR/geo terminar (500ms × N + margem)
    await new Promise((r) => setTimeout(r, 1500))
    for (const c of alvos) {
      try {
        const analise = await getAutoCalcOrchestrator().orchestrate(c as unknown as ClienteParaAnalise)
        c.analises = analise
      } catch {
        // best-effort
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  })
}

/* ========================================================================
 *  Roteador
 * ======================================================================== */

/**
 * Garante que o listener de invalidação (Financeiro → clientes) seja
 * registrado apenas uma vez — mesmo se o plugin for registrado múltiplas
 * vezes em testes.
 */
let _busSubscriberAtivo = false

function registrarSubscriberDoBus(): void {
  if (_busSubscriberAtivo) return
  _busSubscriberAtivo = true
  getAnalisesBus().onInvalidar(({ cpfCnpj, clienteId, motivo }) => {
    let cliente: Cliente | null = null
    if (clienteId) cliente = clientes.get(clienteId) ?? null
    if (!cliente && cpfCnpj) cliente = buscarClientePorCpfCnpj(cpfCnpj)
    if (!cliente) return
    scheduleAnalises(cliente, `[bus] ${motivo}`)
  })
}

export default async function (fastify: FastifyInstance) {
  // Backfill seed clients with CAR data when the module registers.
  backfillSeedEnrichment()
  // Hidrata seeds com o snapshot de análises (após enriquecimento).
  backfillSeedAnalises()
  // Assina o bus para reagir a mudanças do Financeiro (margem por cliente).
  registrarSubscriberDoBus()

  /* ---- LIST ---- */
  fastify.get('/api/clientes', async (request: FastifyRequest, _reply: FastifyReply) => {
    const { estagio, consultor, search } = request.query as {
      estagio?: string
      consultor?: string
      search?: string
    }

    let result = Array.from(clientes.values())

    if (estagio) {
      result = result.filter(c => c.estagio === estagio)
    }
    if (consultor) {
      result = result.filter(c => c.consultor.toLowerCase().includes(consultor.toLowerCase()))
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        c =>
          c.nome.toLowerCase().includes(q) ||
          c.cidade.toLowerCase().includes(q) ||
          c.credor.toLowerCase().includes(q) ||
          c.atividade.toLowerCase().includes(q),
      )
    }

    // Retorna resumo (sem arrays pesados)
    const resumos = result.map(c => ({
      id: c.id,
      nome: c.nome,
      cidade: c.cidade,
      uf: c.uf,
      estagio: c.estagio,
      consultor: c.consultor,
      credor: c.credor,
      valorTotalDivida: c.valorTotalDivida,
      valorTotalPago: c.valorTotalPago,
      culturas: c.culturas,
      areaTotalHa: c.areaTotalHa,
      ultimaAtualizacao: c.ultimaAtualizacao,
    }))

    return { success: true, data: resumos, total: resumos.length }
  })

  /* ---- GET BY ID ---- */
  fastify.get('/api/clientes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)

    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }

    return { success: true, data: cliente }
  })

  /* ---- CREATE ---- */
  fastify.post('/api/clientes', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>

    // Zod-style inline validation
    const errors: string[] = []
    if (!body.nome || typeof body.nome !== 'string') errors.push('nome é obrigatório (string)')
    if (!body.cpfCnpj || typeof body.cpfCnpj !== 'string') errors.push('cpfCnpj é obrigatório (string)')
    if (!body.cidade || typeof body.cidade !== 'string') errors.push('cidade é obrigatória (string)')
    if (!body.uf || typeof body.uf !== 'string' || (body.uf as string).length !== 2) errors.push('uf é obrigatória (2 caracteres)')
    if (!body.credor || typeof body.credor !== 'string') errors.push('credor é obrigatório (string)')
    if (body.valorTotalDivida === undefined || typeof body.valorTotalDivida !== 'number') errors.push('valorTotalDivida é obrigatório (number)')

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    const id = `cli-${String(clientes.size + 1).padStart(3, '0')}`
    const agora = new Date().toISOString().slice(0, 10)

    const novo: Cliente = {
      id,
      nome: body.nome as string,
      cpfCnpj: body.cpfCnpj as string,
      cidade: body.cidade as string,
      uf: body.uf as string,
      telefone: (body.telefone as string) || '',
      email: (body.email as string) || '',
      atividade: (body.atividade as string) || '',
      areaTotalHa: (body.areaTotalHa as number) || 0,
      culturas: (body.culturas as string[]) || [],
      estagio: (body.estagio as Cliente['estagio']) || 'prospeccao',
      consultor: (body.consultor as string) || 'Não atribuído',
      credor: body.credor as string,
      valorTotalDivida: body.valorTotalDivida as number,
      valorTotalPago: (body.valorTotalPago as number) || 0,
      dividas: (body.dividas as Divida[]) || [],
      pagamentos: (body.pagamentos as Pagamento[]) || [],
      timeline: [
        { data: agora, tipo: 'contato', descricao: 'Cliente cadastrado no sistema' },
      ],
      dataCadastro: agora,
      ultimaAtualizacao: agora,
      observacoes: (body.observacoes as string) || '',
      carCodigoImovel: (body.carCodigoImovel as string) || (body.codImovel as string) || undefined,
      cep: typeof body.cep === 'string' ? (body.cep as string).replace(/\D/g, '') || undefined : undefined,
      carStatus: { status: 'pendente', tentadoEm: new Date().toISOString() },
      enrichStatus: { cnpj: 'pendente', geo: 'pendente', tentadoEm: new Date().toISOString() },
    }

    persistCliente(novo)

    // Enriquecimento CAR — async, com timeout curto para offline; falha não bloqueia cadastro.
    // Se offline não achar, retorna imediatamente; live (codImovel) pode levar 15-30s.
    const enrichPromise = enrichAndApply(novo, {
      codImovel: novo.carCodigoImovel,
      motivo: 'cadastro inicial',
    }).catch((err) => {
      request.log.warn({ err, clienteId: id }, 'falha no enriquecimento CAR automático')
    })

    // Aguarda até 3s para incluir CAR offline na resposta — se não concluir,
    // devolve cliente e o enriquecimento continua em background.
    const waitResult = await Promise.race([
      enrichPromise.then(() => 'done' as const),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000)),
    ])

    // Dispara análises automáticas (SRAI, ABS, saldos, projeções, margem) —
    // fire-and-forget. Se o enriquecimento ainda estiver em voo, agenda outra
    // passada quando ele terminar para re-hidratar com CAR/clima/CNPJ.
    scheduleAnalises(novo, 'cadastro inicial')
    enrichPromise.then(() => scheduleAnalises(novo, 'pós-enriquecimento'))

    reply.status(201)
    return {
      success: true,
      data: clientes.get(id),
      carEnrichment: waitResult === 'done' ? 'applied' : 'pending',
    }
  })

  /* ---- UPDATE ---- */
  fastify.patch('/api/clientes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)

    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }

    const body = request.body as Record<string, unknown>
    const updatable = [
      'nome', 'cpfCnpj', 'cidade', 'uf', 'telefone', 'email', 'atividade',
      'areaTotalHa', 'culturas', 'estagio', 'consultor', 'credor',
      'valorTotalDivida', 'valorTotalPago', 'dividas', 'pagamentos',
      'observacoes', 'carCodigoImovel', 'cep',
      'proximaAcao', 'tags',
    ]

    const cpfAntes = cliente.cpfCnpj
    const nomeAntes = cliente.nome
    const codCarAntes = cliente.carCodigoImovel
    const estagioAntes = cliente.estagio

    for (const key of updatable) {
      if (body[key] !== undefined) {
        ;(cliente as unknown as Record<string, unknown>)[key] = body[key]
      }
    }

    cliente.ultimaAtualizacao = new Date().toISOString().slice(0, 10)

    // Add timeline event for stage change + track aging
    if (body.estagio && body.estagio !== estagioAntes) {
      cliente.estagioDesde = new Date().toISOString()
      cliente.timeline.push({
        data: cliente.ultimaAtualizacao,
        tipo: 'analise',
        descricao: `Estágio alterado para: ${body.estagio}`,
      })
    }

    // Timeline event for nova próxima ação
    if (body.proximaAcao && typeof body.proximaAcao === 'object') {
      const pa = body.proximaAcao as { data?: string; descricao?: string }
      if (pa.data && pa.descricao) {
        cliente.timeline.push({
          data: cliente.ultimaAtualizacao,
          tipo: 'analise',
          descricao: `Próxima ação (${pa.data}): ${pa.descricao}`,
        })
      }
    }

    // Re-enriquece CAR se o cpfCnpj, nome, ou código CAR mudaram — ou se
    // o cliente ainda não tem CAR carregado (tentativa oportunística).
    const precisaReenriquecer =
      cliente.cpfCnpj !== cpfAntes ||
      cliente.nome !== nomeAntes ||
      cliente.carCodigoImovel !== codCarAntes ||
      !cliente.car

    let carEnrichmentStatus: 'applied' | 'pending' | 'skipped' = 'skipped'
    if (precisaReenriquecer) {
      cliente.carStatus = { status: 'pendente', tentadoEm: new Date().toISOString() }
      const enrichPromise = enrichAndApply(cliente, {
        codImovel: cliente.carCodigoImovel,
        motivo: cpfAntes !== cliente.cpfCnpj ? 'cpfCnpj atualizado' : 'reavaliação CAR',
      }).catch((err) => {
        request.log.warn({ err, clienteId: id }, 'falha no enriquecimento CAR no update')
      })
      const waitResult = await Promise.race([
        enrichPromise.then(() => 'done' as const),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000)),
      ])
      carEnrichmentStatus = waitResult === 'done' ? 'applied' : 'pending'
    }

    persistCliente(cliente)
    // Qualquer PATCH pode mudar dívidas/área/cultura/estágio/exposição — o
    // orquestrador usa hash(input) então, se nada afetar análises, é no-op.
    scheduleAnalises(cliente, 'patch cliente')
    return { success: true, data: cliente, carEnrichment: carEnrichmentStatus }
  })

  /* ---- MANUAL CAR ENRICH (force) ---- */
  fastify.post('/api/clientes/:id/enriquecer-car', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)

    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }

    const body = (request.body as { codImovel?: string } | undefined) || {}
    const codImovel = body.codImovel || cliente.carCodigoImovel

    if (codImovel) cliente.carCodigoImovel = codImovel
    cliente.carStatus = { status: 'pendente', tentadoEm: new Date().toISOString() }

    await enrichAndApply(cliente, {
      codImovel,
      motivo: codImovel ? `live via código ${codImovel}` : 'reconsulta manual',
    })
    persistCliente(cliente)
    // Área e CAR acabaram de mudar — ABS/SRAI dependem disso.
    scheduleAnalises(cliente, 'reenriquecimento CAR manual')

    return {
      success: true,
      data: {
        id: cliente.id,
        car: cliente.car,
        carStatus: cliente.carStatus,
        carCodigoImovel: cliente.carCodigoImovel,
        areaTotalHa: cliente.areaTotalHa,
      },
    }
  })

  /**
   * Backfill em massa — re-enriquece clientes que ainda estão sem CAR válido.
   * Útil depois do cron `refresh-sicar` popular o índice com dados novos.
   * Roda sequencial com throttle para não sobrecarregar captcha/SICAR.
   */
  fastify.post(
    '/api/clientes/enriquecer-car/backfill',
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const body = (request.body as { force?: boolean; delayMs?: number } | undefined) || {}
      const force = body.force === true
      const delayMs = Math.max(0, Math.min(2000, body.delayMs ?? 250))

      const alvos = Array.from(clientes.values()).filter((c) => {
        if (force) return true
        if (!c.carStatus) return true
        return c.carStatus.status !== 'ok'
      })

      if (alvos.length === 0) {
        return { success: true, data: { processed: 0, ok: 0, pendentes: 0, total: clientes.size } }
      }

      // Fire-and-forget: responde rápido, processa em background. Cron do
      // refresh-sicar não precisa aguardar todos os enriquecimentos.
      setImmediate(async () => {
        for (const c of alvos) {
          c.carStatus = { status: 'pendente', tentadoEm: new Date().toISOString() }
          try {
            await enrichAndApply(c, { motivo: 'backfill pós-refresh SICAR' })
          } catch {
            // carStatus já atualizado com erro dentro de enrichAndApply
          }
          if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
        }
      })

      return {
        success: true,
        data: {
          scheduled: alvos.length,
          total: clientes.size,
          throttleMs: delayMs,
          startedAt: new Date().toISOString(),
        },
      }
    },
  )

  /**
   * Inicia prospecção — converte um lead PGFN em cliente no funil.
   *
   * Body: { cpfCnpj: string, consultor?: string, observacoes?: string }
   * Usa ProspeccaoService.getLead() para obter o LeadFull e deriva o cliente
   * preservando dívidas, score e sinais agro. Se o CPF/CNPJ já foi importado
   * anteriormente, retorna o cliente existente (idempotente).
   */
  fastify.post('/api/clientes/iniciar-prospeccao', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as { cpfCnpj?: string; consultor?: string; observacoes?: string }) || {}
    const cpfCnpjRaw = body.cpfCnpj || ''
    const clean = cpfCnpjRaw.replace(/\D/g, '')
    if (!clean || (clean.length !== 11 && clean.length !== 14)) {
      reply.status(400)
      return { success: false, error: 'cpfCnpj inválido' }
    }

    // Idempotência: se já existe cliente com esse CPF/CNPJ, retorna
    const existente = Array.from(clientes.values()).find(
      (c) => c.cpfCnpj.replace(/\D/g, '') === clean,
    )
    if (existente) {
      return {
        success: true,
        data: existente,
        jaExistia: true,
        message: 'Cliente já havia sido importado anteriormente',
      }
    }

    const service = getProspeccaoService()
    const lead: LeadFull | null = service.getLead(cpfCnpjRaw)
    if (!lead) {
      reply.status(404)
      return { success: false, error: 'Lead não encontrado na base PGFN' }
    }

    const id = `cli-${String(clientes.size + 1).padStart(3, '0')}`
    const agora = new Date().toISOString().slice(0, 10)
    const agoraIso = new Date().toISOString()

    // Mapeia dívidas PGFN para o formato interno
    const dividas: Divida[] = lead.debts.map((d) => ({
      contrato: d.inscricao,
      valorOriginal: d.valor,
      valorAtualizado: d.valor,
      vencimento: d.dataInscricao || agora,
      status: d.ajuizado ? 'ativa' : 'ativa',
      credor: d.fonte === 'PREV' ? 'RFB/Previdência' : d.fonte === 'FGTS' ? 'FGTS' : 'RFB/Dívida Ativa',
    }))

    const novo: Cliente = {
      id,
      nome: lead.cnpj?.razaoSocial || lead.nome,
      cpfCnpj: lead.cpfCnpj,
      cidade: lead.cnpj?.endereco?.municipio || '',
      uf: lead.cnpj?.endereco?.uf || lead.uf || '',
      telefone: lead.cnpj?.telefone1 || '',
      email: lead.cnpj?.email || '',
      atividade: lead.cnpj?.cnaeFiscalDescricao || lead.agroSignals.join(', ') || 'Produtor rural',
      areaTotalHa: Math.round(lead.area?.hectaresEstimados || 0),
      culturas: [],
      estagio: 'prospeccao',
      consultor: body.consultor || 'Não atribuído',
      credor: 'PGFN',
      valorTotalDivida: lead.totalDivida,
      valorTotalPago: 0,
      dividas,
      pagamentos: [],
      timeline: [
        {
          data: agora,
          tipo: 'contato',
          descricao: 'Lead importado da base PGFN via Prospecção OODA',
          detalhes: `Score ${lead.score.total} (${lead.score.classificacao}) · ${lead.qtdInscricoes} inscrições · ${lead.temAjuizada ? 'com ajuizamento' : 'sem ajuizamento'}`,
        },
      ],
      dataCadastro: agora,
      ultimaAtualizacao: agora,
      observacoes: body.observacoes || `Honorários estimados: R$ ${lead.score.honorariosEstimados.toLocaleString('pt-BR')}. Sinais agro: ${lead.agroSignals.join(', ') || '—'}.`,
      carCodigoImovel: lead.car?.codImovel,
      cep: lead.cnpj?.endereco?.cep?.replace(/\D/g, ''),
      cnpjInfo: lead.cnpj ? mapCnpjInfo(lead.cnpj) : undefined,
      carStatus: lead.car ? { status: 'ok', tentadoEm: agoraIso } : { status: 'pendente', tentadoEm: agoraIso },
      enrichStatus: { cnpj: lead.cnpj ? 'ok' : 'pendente', geo: 'pendente', clima: 'pendente', producao: 'pendente', tentadoEm: agoraIso },
      leadOrigem: {
        cpfCnpjClean: lead.cpfCnpjClean,
        scoreTotal: lead.score.total,
        classificacao: lead.score.classificacao,
        honorariosEstimados: lead.score.honorariosEstimados,
        temAjuizada: lead.temAjuizada,
        totalDividaPgfn: lead.totalDivida,
        importadoEm: agoraIso,
      },
    }

    // Aplica CAR já vindo do lead (se houver)
    if (lead.car && lead.carSource) {
      novo.car = mapCarInfo(lead.car, lead.carSource, lead.carOutrosImoveis?.length, lead.car.areaImovel)
      if ((!novo.areaTotalHa || novo.areaTotalHa <= 0) && lead.car.areaImovel > 0) {
        novo.areaTotalHa = Math.round(lead.car.areaImovel)
      }
    }

    persistCliente(novo)

    // Enriquecimento em background (geo + clima + produção). Fire-and-forget.
    // Após o enrichment concluir, roda o orquestrador com o estado já completo.
    setImmediate(() => {
      enrichAndApply(novo, { motivo: 'import prospecção PGFN' })
        .then(() => scheduleAnalises(novo, 'pós-import prospecção'))
        .catch((err) => {
          request.log.warn({ err, clienteId: id }, 'falha no enriquecimento pós-import prospecção')
        })
    })
    // Já dispara uma primeira passada com o que temos (dívidas PGFN + CAR se veio).
    scheduleAnalises(novo, 'import prospecção PGFN')

    reply.status(201)
    return {
      success: true,
      data: novo,
      jaExistia: false,
      message: 'Lead importado com sucesso para o funil CRM',
    }
  })

  /* ---- SCORE SRAI (Risco Agrícola Integrado) ---- */
  fastify.get('/api/clientes/:id/srai', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const input = buildSraiInput(cliente as unknown as ClienteParaAnalise)
    const score = calcularSRAI(input)
    return { success: true, data: { ...score, input } }
  })

  /* ---- VERIFICADOR AB+S (Agro Brasil Sustentável) ---- */
  fastify.get('/api/clientes/:id/abs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const q = (request.query as { plantioDireto?: string; ilpf?: string; prada?: string }) || {}
    const input = buildAbsInput(cliente as unknown as ClienteParaAnalise, {
      plantioDireto: q.plantioDireto === 'true',
      ilpf: q.ilpf === 'true',
      prada: q.prada === 'true',
    })
    const resultado = verificarABS(input)
    return { success: true, data: { ...resultado, input } }
  })

  /* ---- SNAPSHOT DE ANÁLISES AUTOMÁTICAS (Cliente Inteligente) ----
   *
   * Stale-while-revalidate: se o snapshot existe mas passou da janela de
   * frescor (24h), serve o cache imediatamente e agenda um refresh em
   * background. Garante resposta rápida (<50ms) sem perder consistência
   * eventual com entradas externas (commodities, dívidas externas, etc).
   */
  fastify.get('/api/clientes/:id/analises', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const orch = getAutoCalcOrchestrator()
    let analise = cliente.analises ?? orch.get(id)
    if (!analise) {
      // Primeira leitura — força execução síncrona (≈50-200ms).
      analise = await orch.orchestrate(cliente as unknown as ClienteParaAnalise)
      cliente.analises = analise
    } else if (snapshotEstaVelho(analise)) {
      // Cache válido porém velho — agenda refresh em background e devolve o
      // cache agora. O frontend pegará o novo snapshot na próxima abertura.
      scheduleAnalises(cliente, 'stale-while-revalidate')
    }
    return { success: true, data: analise }
  })

  /* ---- RECALCULAR ANÁLISES (força nova execução) ---- */
  fastify.post('/api/clientes/:id/recalcular', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const orch = getAutoCalcOrchestrator()
    const analise = await orch.orchestrate(cliente as unknown as ClienteParaAnalise, { force: true })
    cliente.analises = analise
    return { success: true, data: analise }
  })

  /* ---- CATÁLOGO DE REGRAS DO SMARTADVISOR (debug/admin) ---- */
  fastify.get('/api/advisor/regras', async () => {
    return { success: true, data: getSmartAdvisor().listarRegras() }
  })

  /* ---- EXPOSIÇÃO POR COMMODITY ---- */
  fastify.put('/api/clientes/:id/exposicao', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const body = request.body as { exposicao?: Array<Partial<ExposicaoCommodity>> }
    if (!Array.isArray(body.exposicao)) {
      reply.status(400)
      return { success: false, error: 'exposicao deve ser um array' }
    }
    const agoraIso = new Date().toISOString()
    const normalizadas: ExposicaoCommodity[] = []
    const errs: string[] = []
    body.exposicao.forEach((e, idx) => {
      if (!e.commodity || typeof e.commodity !== 'string') {
        errs.push(`[${idx}] commodity obrigatória`)
        return
      }
      if (typeof e.areaHa !== 'number' || e.areaHa < 0) {
        errs.push(`[${idx}] areaHa inválida`)
        return
      }
      if (typeof e.produtividade !== 'number' || e.produtividade < 0) {
        errs.push(`[${idx}] produtividade inválida`)
        return
      }
      if (typeof e.precoReferencia !== 'number' || e.precoReferencia < 0) {
        errs.push(`[${idx}] precoReferencia inválido`)
        return
      }
      normalizadas.push({
        commodity: e.commodity.toLowerCase().trim(),
        areaHa: e.areaHa,
        produtividade: e.produtividade,
        unidadeProdutividade: e.unidadeProdutividade || 'sc/ha',
        precoReferencia: e.precoReferencia,
        unidadePreco: e.unidadePreco || 'R$/sc',
        pctReceita: typeof e.pctReceita === 'number' ? e.pctReceita : undefined,
        atualizadoEm: agoraIso,
        observacoes: e.observacoes?.trim() || undefined,
      })
    })
    if (errs.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errs }
    }
    cliente.exposicaoCommodity = normalizadas
    cliente.ultimaAtualizacao = new Date().toISOString().slice(0, 10)
    cliente.timeline.push({
      data: cliente.ultimaAtualizacao,
      tipo: 'analise',
      descricao: 'Exposição por commodity atualizada',
      detalhes: normalizadas
        .map((e) => `${e.commodity}: ${e.areaHa} ha × ${e.produtividade} ${e.unidadeProdutividade}`)
        .join(' · '),
    })
    return { success: true, data: cliente.exposicaoCommodity }
  })

  /* ---- VISITA TÉCNICA ---- */
  fastify.post('/api/clientes/:id/visitas', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const body = request.body as Partial<VisitaTecnica>
    if (!body.consultor || !body.data) {
      reply.status(400)
      return { success: false, error: 'consultor e data são obrigatórios' }
    }
    const visita: VisitaTecnica = {
      id: `visita-${Date.now()}`,
      data: body.data,
      consultor: body.consultor,
      duracaoMinutos: body.duracaoMinutos,
      coordenadas: body.coordenadas,
      checklist: body.checklist || {},
      observacoesGerais: body.observacoesGerais?.trim() || undefined,
      riscos: body.riscos?.filter((r) => r && r.trim().length > 0),
      oportunidades: body.oportunidades?.filter((o) => o && o.trim().length > 0),
      fotos: body.fotos,
      criadoEm: new Date().toISOString(),
    }
    cliente.visitasTecnicas = [...(cliente.visitasTecnicas || []), visita]
    cliente.ultimaAtualizacao = new Date().toISOString().slice(0, 10)

    const itensOk = Object.values(visita.checklist).filter(Boolean).length
    const totalChecklist = Object.keys(visita.checklist).length
    cliente.timeline.push({
      data: visita.data,
      tipo: 'reuniao',
      descricao: `Visita técnica realizada por ${visita.consultor}`,
      detalhes: `Checklist: ${itensOk}/${totalChecklist} itens OK${visita.observacoesGerais ? ' · ' + visita.observacoesGerais.slice(0, 100) : ''}`,
    })

    reply.status(201)
    return { success: true, data: visita, total: cliente.visitasTecnicas.length }
  })

  fastify.delete('/api/clientes/:id/visitas/:visitaId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, visitaId } = request.params as { id: string; visitaId: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const antes = cliente.visitasTecnicas?.length || 0
    cliente.visitasTecnicas = (cliente.visitasTecnicas || []).filter((v) => v.id !== visitaId)
    if (cliente.visitasTecnicas.length === antes) {
      reply.status(404)
      return { success: false, error: 'Visita não encontrada' }
    }
    return { success: true }
  })

  /* ---- NOTAS (comentários internos) ---- */
  fastify.post('/api/clientes/:id/notas', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const body = request.body as { texto?: string; autor?: string }
    if (!body.texto || body.texto.trim().length === 0) {
      reply.status(400)
      return { success: false, error: 'Texto da nota é obrigatório' }
    }
    const nota = {
      id: `nota-${Date.now()}`,
      autor: body.autor || 'Sistema',
      criadoEm: new Date().toISOString(),
      texto: body.texto.trim(),
    }
    cliente.notas = [...(cliente.notas || []), nota]
    cliente.ultimaAtualizacao = new Date().toISOString().slice(0, 10)
    return { success: true, data: nota, total: cliente.notas.length }
  })

  fastify.delete('/api/clientes/:id/notas/:notaId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, notaId } = request.params as { id: string; notaId: string }
    const cliente = clientes.get(id)
    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }
    const antes = cliente.notas?.length || 0
    cliente.notas = (cliente.notas || []).filter((n) => n.id !== notaId)
    if (cliente.notas.length === antes) {
      reply.status(404)
      return { success: false, error: 'Nota não encontrada' }
    }
    return { success: true }
  })

  /* ---- TIMELINE ---- */
  fastify.get('/api/clientes/:id/timeline', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const cliente = clientes.get(id)

    if (!cliente) {
      reply.status(404)
      return { success: false, error: 'Cliente não encontrado' }
    }

    const sorted = [...cliente.timeline].sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
    )

    return {
      success: true,
      data: {
        clienteId: id,
        clienteNome: cliente.nome,
        eventos: sorted,
        total: sorted.length,
      },
    }
  })

  /* ======================================================================
   *  PORTAL DO CLIENTE — gestão de acessos (consultor em Configurações)
   * ==================================================================== */

  /** Listagem resumida de todos os clientes + status do portalAcesso. */
  fastify.get('/api/portal-admin/clientes', async () => {
    const lista = Array.from(clientes.values()).map((c) => ({
      id: c.id,
      nome: c.nome,
      cpfCnpj: c.cpfCnpj,
      email: c.email,
      cidade: c.cidade,
      uf: c.uf,
      estagio: c.estagio,
      consultor: c.consultor,
      portal: c.portalAcesso
        ? {
            usuario: c.portalAcesso.usuario,
            ativo: c.portalAcesso.ativo,
            criadoEm: c.portalAcesso.criadoEm,
            atualizadoEm: c.portalAcesso.atualizadoEm,
            ultimoLoginEm: c.portalAcesso.ultimoLoginEm,
            forcaTrocaSenha: c.portalAcesso.forcaTrocaSenha,
          }
        : null,
      mensagensNaoLidas:
        c.portalMensagens?.filter((m) => m.de === 'cliente' && !m.lidaEm).length ?? 0,
    }))
    return { success: true, data: lista }
  })

  /** Cria ou reseta o acesso portal. Retorna senha temporária UMA vez. */
  fastify.post(
    '/api/clientes/:id/portal-access',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const cliente = clientes.get(id)
      if (!cliente) {
        reply.status(404)
        return { success: false, error: 'Cliente não encontrado' }
      }
      const body = request.body as { usuario?: string; senhaInicial?: string } | undefined
      const usuarioInput =
        body?.usuario?.trim() ||
        cliente.email?.trim() ||
        cliente.cpfCnpj.replace(/\D/g, '')
      if (!usuarioInput) {
        reply.status(400)
        return { success: false, error: 'Informe usuário, email ou CPF/CNPJ no cliente' }
      }
      const usuarioNorm = normalizarUsuario(usuarioInput)
      // Verifica colisão de usuário em outros clientes
      for (const outro of clientes.values()) {
        if (outro.id === id) continue
        if (outro.portalAcesso?.usuario === usuarioNorm) {
          reply.status(409)
          return { success: false, error: `Usuário já está em uso por ${outro.nome}` }
        }
      }
      const { acesso, senhaTemporaria } = criarAcessoPortal({
        usuario: usuarioNorm,
        senhaInicial: body?.senhaInicial,
      })
      cliente.portalAcesso = acesso
      cliente.ultimaAtualizacao = new Date().toISOString()
      return {
        success: true,
        data: {
          usuario: acesso.usuario,
          senhaTemporaria,
          ativo: acesso.ativo,
          forcaTrocaSenha: acesso.forcaTrocaSenha,
          criadoEm: acesso.criadoEm,
        },
      }
    }
  )

  /** Toggle ativo/inativo. */
  fastify.patch(
    '/api/clientes/:id/portal-access',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const cliente = clientes.get(id)
      if (!cliente || !cliente.portalAcesso) {
        reply.status(404)
        return { success: false, error: 'Acesso portal não configurado' }
      }
      const body = request.body as { ativo?: boolean } | undefined
      if (typeof body?.ativo !== 'boolean') {
        reply.status(400)
        return { success: false, error: 'Campo "ativo" (boolean) obrigatório' }
      }
      cliente.portalAcesso.ativo = body.ativo
      cliente.portalAcesso.atualizadoEm = new Date().toISOString()
      return { success: true, data: { ativo: cliente.portalAcesso.ativo } }
    }
  )

  /** Revoga (apaga) credencial. */
  fastify.delete(
    '/api/clientes/:id/portal-access',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const cliente = clientes.get(id)
      if (!cliente || !cliente.portalAcesso) {
        reply.status(404)
        return { success: false, error: 'Acesso portal não configurado' }
      }
      cliente.portalAcesso = undefined
      cliente.ultimaAtualizacao = new Date().toISOString()
      return { success: true, data: { revogado: true } }
    }
  )

  /** Lista mensagens portal (consultor vê todas). */
  fastify.get(
    '/api/clientes/:id/portal-mensagens',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const cliente = clientes.get(id)
      if (!cliente) {
        reply.status(404)
        return { success: false, error: 'Cliente não encontrado' }
      }
      return { success: true, data: cliente.portalMensagens ?? [] }
    }
  )

  /** Consultor responde ao cliente pelo sistema. */
  fastify.post(
    '/api/clientes/:id/portal-mensagens',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const cliente = clientes.get(id)
      if (!cliente) {
        reply.status(404)
        return { success: false, error: 'Cliente não encontrado' }
      }
      const body = request.body as { texto?: string; autorNome?: string } | undefined
      const texto = body?.texto?.trim()
      if (!texto) {
        reply.status(400)
        return { success: false, error: 'Texto obrigatório' }
      }
      const msg: PortalMensagem = {
        id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        de: 'consultor',
        autorNome: body?.autorNome?.trim() || cliente.consultor || 'Consultor ALETIS',
        texto,
        criadoEm: new Date().toISOString(),
      }
      cliente.portalMensagens = [...(cliente.portalMensagens ?? []), msg]
      return reply.status(201).send({ success: true, data: msg })
    }
  )

  /** Marca mensagens do cliente como lidas (pelo consultor). */
  fastify.patch(
    '/api/clientes/:id/portal-mensagens/marcar-lidas',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const cliente = clientes.get(id)
      if (!cliente) {
        reply.status(404)
        return { success: false, error: 'Cliente não encontrado' }
      }
      const agora = new Date().toISOString()
      let marcadas = 0
      for (const m of cliente.portalMensagens ?? []) {
        if (m.de === 'cliente' && !m.lidaEm) {
          m.lidaEm = agora
          marcadas++
        }
      }
      return { success: true, data: { marcadas } }
    }
  )
}
