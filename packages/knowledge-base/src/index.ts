/**
 * ALETIS - Knowledge Base
 * Base de conhecimento normativo, jurisprudencial e regulatorio do credito rural brasileiro
 *
 * Uso: importar em `@aletis/api` (routes credito, propostas, ALIX) para
 * alimentar propostas, calculadoras e respostas da IA com dados autoritativos
 * e atualizados.
 */

export {
  SUMULAS_STJ,
  buscarSumulaPorTema,
  listarSumulasPorArea,
} from './sumulas-stj.js'
export type { SumulaSTJ } from './sumulas-stj.js'

export {
  MCR_SECOES,
  MCR_2_1,
  MCR_2_6_4,
  MCR_2_8,
  MCR_3_2,
  MCR_6_2,
  MCR_7_1,
  MCR_7_4,
  MCR_8,
  MCR_16_PROAGRO,
  buscarMCRPorTema,
} from './mcr-secoes.js'
export type { MCRSecao } from './mcr-secoes.js'

export {
  PRONAF_LINHAS,
  PRONAMP_LINHAS,
  EMPRESARIAL_LINHAS,
  PLANO_SAFRA_2025_26,
  buscarLinhaPorPrograma,
  buscarLinhasPorPublico,
  calcularEconomiaMudancaLinha,
} from './plano-safra-2025-26.js'
export type { LinhaCredito } from './plano-safra-2025-26.js'

export {
  PROAGRO_REGRAS_2025_26,
  CULTURAS_PROAGRO,
  avaliarBloqueioProagro,
} from './proagro.js'

export {
  ESTAGIOS_ECL,
  RESOLUCAO_4966_PONTOS_CHAVE,
  classificarOperacao,
  estimarSpreadAdicionalPorEstagio,
} from './resolucao-4966.js'

export {
  PRECEDENTES,
} from './precedentes-judiciais.js'

// ----------------------------------------------------------------------------
// RAG BM25 (Wave 8b): indexa PDFs de inbox/documentos para busca semantica leve.
// A API completa esta em `./rag/index.js`; re-exportamos o essencial aqui.
// ----------------------------------------------------------------------------
export * from './rag/index.js'

import { SUMULAS_STJ } from './sumulas-stj.js'
import { MCR_SECOES } from './mcr-secoes.js'
import { PRONAF_LINHAS, PRONAMP_LINHAS, EMPRESARIAL_LINHAS, PLANO_SAFRA_2025_26 } from './plano-safra-2025-26.js'
import { PROAGRO_REGRAS_2025_26, CULTURAS_PROAGRO } from './proagro.js'
import { ESTAGIOS_ECL, RESOLUCAO_4966_PONTOS_CHAVE } from './resolucao-4966.js'
import { PRECEDENTES } from './precedentes-judiciais.js'

/**
 * Snapshot completo da base para consumo pelo sistema.
 */
export const KNOWLEDGE_SNAPSHOT = {
  versao: '1.0.0',
  atualizadoEm: '2026-04-16',
  sumulas: SUMULAS_STJ,
  mcr: MCR_SECOES,
  planoSafra: {
    pronaf: PRONAF_LINHAS,
    pronamp: PRONAMP_LINHAS,
    empresarial: EMPRESARIAL_LINHAS,
    consolidado: PLANO_SAFRA_2025_26,
  },
  proagro: {
    regras: PROAGRO_REGRAS_2025_26,
    culturas: CULTURAS_PROAGRO,
  },
  contabilidade: {
    estagiosEcl: ESTAGIOS_ECL,
    resolucao4966: RESOLUCAO_4966_PONTOS_CHAVE,
  },
  precedentes: PRECEDENTES,
}

/**
 * Busca unificada - recebe um termo e retorna todas as referencias relevantes
 * na base de conhecimento (sumulas, MCR, precedentes).
 */
export function buscarConhecimento(termo: string): {
  sumulas: typeof SUMULAS_STJ[keyof typeof SUMULAS_STJ][]
  mcr: (typeof MCR_SECOES)[keyof typeof MCR_SECOES][]
  precedentes: typeof PRECEDENTES
  totalMatches: number
} {
  const t = termo.toLowerCase()
  const sumulas = Object.values(SUMULAS_STJ).filter(
    s => s.texto.toLowerCase().includes(t) || s.contexto.toLowerCase().includes(t) || s.aplicacaoPratica.toLowerCase().includes(t),
  )
  const mcr = Object.values(MCR_SECOES).filter(
    s => s.titulo.toLowerCase().includes(t) || s.ementa.toLowerCase().includes(t) || s.aplicacaoPratica.toLowerCase().includes(t),
  )
  const precedentes = PRECEDENTES.filter(
    p => p.ementa.toLowerCase().includes(t) || p.tese.toLowerCase().includes(t) || p.aplicacaoALETIS.toLowerCase().includes(t),
  )

  return {
    sumulas,
    mcr,
    precedentes,
    totalMatches: sumulas.length + mcr.length + precedentes.length,
  }
}
