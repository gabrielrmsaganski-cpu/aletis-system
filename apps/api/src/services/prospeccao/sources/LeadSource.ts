import type { LeadRaw } from '../types'

/**
 * Contrato de uma fonte de leads.
 *
 * Cada fonte (PGFN, CAR, CNPJ-CNAE-agro, etc.) implementa este contrato e
 * é registrada no `LeadSourceRegistry`. O registry consolida todas as
 * fontes num único índice, deduplicando por `cpfCnpjClean` e mesclando
 * sinais cross-source (procedência persiste em `LeadRaw.sources`).
 *
 * Convenção:
 *  - `fonte`: identificador curto em UPPERCASE (PGFN, CAR, CNPJ, SIDRA...).
 *  - `load()`: carrega/reidrata a fonte para memória. Idempotente.
 *  - `all()`: retorna todos os leads conhecidos pela fonte.
 *  - `find(cpfCnpj)`: busca direta por documento (só-dígitos).
 *  - `manifest()`: snapshot da fonte p/ UI de admin e `sources.json`.
 *
 * Implementações pesadas (I/O, rede) devem paginar/streamar internamente
 * e expor `all()` já materializado — o registry não orquestra paginação.
 */
export interface LeadSource {
  readonly fonte: string

  load(): void | Promise<void>
  all(): LeadRaw[]
  find(cpfCnpj: string): LeadRaw | null

  manifest(): LeadSourceManifest
}

export interface LeadSourceManifest {
  fonte: string
  /** Descrição humana — ex: "PGFN Dívida Ativa (FGTS + Prev + Não-Prev)". */
  descricao: string
  /** Quantos leads a fonte contribui (após seu próprio filtro interno). */
  contagem: number
  /** ISO — quando o snapshot atual foi gerado pela fonte (ingest offline, etc). */
  lastIngestAt: string | null
  /** Hash do arquivo-fonte quando aplicável — serve p/ detectar re-ingest. */
  sha256?: string
  /** Metadados livres específicos da fonte. */
  extra?: Record<string, unknown>
}
