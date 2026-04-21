import type { SraiOutput, SraiInput } from '../ScoreSRAI.js'
import type { AbsOutput, AbsInput } from '../VerificadorABS.js'
import type { ResultadoRecalculo, ProjecaoFluxoCaixa } from '../../lib/financeiro.js'
import type { FluxoPlurianualResultado } from '../../lib/calculadoras-premium.js'
import type { MargemCliente } from '../financeiro/types.js'
import type { Recommendation } from './advisor/types.js'

/**
 * Snapshot por-cliente produzido pelo `AutoCalcOrchestrator`. Materializa no
 * cadastro do cliente o conjunto de análises que o consultor precisa ver
 * imediatamente ao abrir o CRM — sem depender de chamadas GET /api/... sob
 * demanda. Persistido em `storage/clientes/<id>.analise.json`.
 *
 * Cada execução gera um hash do input canônico — se nada mudou, o orquestrador
 * pula o recálculo (idempotência).
 */
export interface AnaliseCliente {
  /** Hash SHA-256 do input canônico — usado para skip-if-same. */
  inputHash: string
  geradoEm: string
  versao: string

  /** Quanto o orquestrador levou (ms) — útil para observabilidade. */
  duracaoMs: number

  /** Score de Risco Agrícola Integrado (ScoreSRAI). */
  srai: (SraiOutput & { input: SraiInput }) | null
  /** Diagnóstico AB+S. */
  abs: (AbsOutput & { input: AbsInput }) | null

  /** Saldo recalculado por dívida ativa (juros 1,5% am default) + total agregado. */
  saldoRecalculado: {
    taxaMensalPadrao: number
    dataCorte: string
    totalValorOriginal: number
    totalValorAtualizado: number
    totalSaldoRecalculado: number
    totalJurosAcumulados: number
    porDivida: Array<{
      contrato: string
      credor: string
      valorOriginal: number
      valorAtualizado: number
      saldoRecalculado: number
      jurosAcumulados: number
      diasDesdeVencimento: number
      detalhamento: ResultadoRecalculo['detalhamento']
    }>
  } | null

  /** Projeção plurianual (5 safras) — usa exposição por commodity se houver. */
  projecao5Safras: FluxoPlurianualResultado | null

  /** Projeção do fluxo de caixa da safra corrente + 6 meses pós-colheita. */
  fluxoCaixaSafra: ProjecaoFluxoCaixa | null

  /** Margem cliente (receita − despesas do Financeiro). Null se sem lançamentos. */
  margemCliente: MargemCliente | null

  /** Lista de alertas agregados (top 6) — fonte única p/ o Radar. */
  alertasTop: Array<{
    nivel: 'critico' | 'alto' | 'moderado' | 'info'
    origem: 'srai' | 'abs' | 'caixa' | 'dividas' | 'relacionamento'
    mensagem: string
  }>

  /**
   * Recomendações acionáveis produzidas pelo `SmartAdvisor` a partir das
   * calculadoras acima — o "o que fazer agora" para o consultor. Ordenadas
   * por prioridade (p1 → p3).
   */
  recomendacoes: Recommendation[]

  /** Erros por calculadora (não bloqueia — apenas reporta). */
  erros: Record<string, string>
}

export const ANALISE_VERSAO = 'analise-v1.1'
