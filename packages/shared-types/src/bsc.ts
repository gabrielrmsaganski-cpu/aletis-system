// ============================================================
// ALETIS — Balanced Scorecard Agro (BSC) — Wave 8a
// ============================================================
//
// Tipos canonicos para o módulo BSC aplicado ao agronegócio.
//
// Base conceitual:
//   - Kaplan & Norton, "The Balanced Scorecard" (1996), aplicado
//     ao produtor rural / agroindústria.
//   - Framework extraído de `99_98 - Formulas Lambda-BSC_v5.xlsx`
//     (LAMBDAs AA_BSC_BUSCAR_VALOR / AA_BSC_CALC_KPI /
//     AA_BSC_MAPA_ESTRATEGICO) que traz a mecânica de:
//       * Polaridade (Maior Melhor / Menor Melhor)
//       * Score por KPI = Real / Meta (ou Meta / Real)
//       * Status visual por thresholds 1.00 / 0.90
//
// Convenções:
//   - Alíquotas / percentuais em fração (0.15 = 15%).
//   - Valores monetários em BRL.
//   - Período no formato 'YYYY-MM', 'YYYY-Qn' ou ISO 'YYYY-MM-DD'.
//   - IDs de KPI em snake_case ASCII (slug estável).
// ============================================================

/**
 * As quatro perspectivas do Balanced Scorecard de Kaplan & Norton,
 * aplicadas ao contexto do agronegócio.
 *
 * - `financeira`               → ROIC, Margem EBITDA, Liquidez, Endividamento.
 * - `clientes`                 → NPS, PMR (prazo médio de recebimento),
 *                                Inadimplência.
 * - `processos_internos`       → Giro de estoques, custo por hectare,
 *                                produtividade (t/ha), ciclo operacional.
 * - `aprendizado_crescimento`  → Treinamento per capita, turnover.
 */
export type PerspectivaBSC =
  | 'financeira'
  | 'clientes'
  | 'processos_internos'
  | 'aprendizado_crescimento';

/**
 * Polaridade do indicador. Replica o comportamento da LAMBDA
 * `AA_BSC_CALC_KPI` do Excel:
 *   - 'maior_melhor' → score = real / meta   (quanto mais alto, melhor)
 *   - 'menor_melhor' → score = meta / real   (quanto mais baixo, melhor)
 */
export type TendenciaKpi = 'maior_melhor' | 'menor_melhor';

/**
 * Status de atingimento da meta. Thresholds idênticos ao Excel
 * (🟢 / 🟡 / 🔴):
 *   - `acima_meta`   → score >= 1.00
 *   - `na_meta`      → 0.90 <= score < 1.00
 *   - `abaixo_meta`  → score <  0.90
 *   - `sem_meta`     → meta ausente ou zero (score neutro = 1)
 */
export type StatusKpi = 'acima_meta' | 'na_meta' | 'abaixo_meta' | 'sem_meta';

/** Definição estática de um KPI no catálogo BSC. */
export interface KpiBSCDefinicao {
  /** Slug estável, snake_case ASCII (ex.: 'roic', 'margem_ebitda'). */
  id: string;
  /** Nome exibível (pt-BR). */
  nome: string;
  perspectiva: PerspectivaBSC;
  /** Descrição humana da fórmula (não é expressão executável). */
  formula: string;
  /** Unidade de medida (ex.: '%', 'R$', 'dias', 't/ha', 'score'). */
  unidade: string;
  /** Meta padrão (usada quando o contexto não traz uma meta específica). */
  meta?: number;
  tendencia: TendenciaKpi;
  /** Descrição longa para tooltip / documentação. */
  descricao: string;
}

/** Valor calculado de um KPI para um período específico. */
export interface ValorKpi {
  kpiId: string;
  /** Valor realizado (unidade conforme `KpiBSCDefinicao.unidade`). */
  valor: number;
  /** Período de referência ('2026-Q1', '2026-03', ISO date). */
  periodo: string;
  /** Meta efetiva considerada (override ou padrão). */
  meta?: number;
  /** Status de atingimento (semáforo). */
  status: StatusKpi;
  /**
   * Score normalizado (0..1.5), conforme lógica de polaridade:
   *   maior_melhor  → real / meta
   *   menor_melhor  → meta / real
   * Capado em 1.5 para evitar outliers; 1 se sem_meta.
   */
  score: number;
}

/**
 * Contexto de entrada do cálculo BSC.
 *
 * Todos os valores financeiros são sobre o **período completo** em
 * análise (ex.: trimestre 2026-Q1). Agro-específicos referem-se
 * à safra/ano agrícola em curso.
 */
export interface ContextoBSCCalculo {
  // ── Demonstrações financeiras agregadas ────────────────
  receitaBruta: number;
  receitaLiquida: number;
  custosProducao: number;
  despesasOperacionais: number;
  ebitda: number;
  lucroLiquido: number;

  // ── Balanço Patrimonial ─────────────────────────────────
  ativoTotal: number;
  passivoCirculante: number;
  ativoCirculante: number;
  estoque: number;
  contasReceber: number;
  dividasTotal: number;
  patrimonioLiquido: number;
  /** Capital investido (PL + dívida onerosa de longo prazo). */
  investimentoCapital: number;

  // ── Agro-específicos ────────────────────────────────────
  /** Área plantada total (hectares). */
  areaPlantadaHa: number;
  /** Produção total no período (toneladas). */
  producaoTotalTon: number;
  /** Custo por hectare (R$/ha) — pode ser calculado se ausente. */
  custoHectare?: number;

  // ── Pessoas ─────────────────────────────────────────────
  numeroColaboradores?: number;
  horasTreinamento?: number;
  turnoverPct?: number;

  // ── Clientes ────────────────────────────────────────────
  npsCliente?: number;
  prazoMedioRecebimentoDias?: number;
  percInadimplencia?: number;

  // ── Processos ───────────────────────────────────────────
  /** Tempo de ciclo operacional (plantio → colheita → venda), em dias. */
  tempoCicloProducao?: number;

  // ── Meta e janela ───────────────────────────────────────
  /** Período de referência ('2026-Q1', '2026-03', ISO). */
  periodo: string;
  /**
   * Overrides de meta por kpiId (substitui a meta padrão do catálogo).
   * Ex.: { margem_ebitda: 0.30, roic: 0.18 }.
   */
  metasOverride?: Record<string, number>;
}

/** Score consolidado de uma perspectiva inteira. */
export interface ScorePerspectivaBSC {
  perspectiva: PerspectivaBSC;
  /** Score da perspectiva em 0..100 (média dos KPIs × 100). */
  score: number;
  kpis: ValorKpi[];
}

/** Resultado consolidado do Balanced Scorecard. */
export interface ResultadoBSC {
  periodo: string;
  /** Score geral em 0..100 (média ponderada das perspectivas). */
  scoreGeral: number;
  porPerspectiva: ScorePerspectivaBSC[];
  observacoes: string[];
  recomendacoes: string[];
}
