// ============================================================
// ALETIS — Simulador de Reforma Tributária (CBS / IBS) 2026+
// ============================================================
//
// Tipos canonicos para o módulo de Reforma Tributária do produtor
// rural e da agroindústria. Baseado em:
//   - EC 132/2023 (Reforma Tributária)
//   - LC 214/2025 (institui a CBS + IBS, substituindo PIS/COFINS,
//     ICMS, ISS e, em regime normal, IPI)
//   - LC 215/2025 (regulamenta CBS)
//   - Cronograma oficial de transição 2026-2033 publicado pelo
//     Ministério da Fazenda (ref: comunicado RFB/SE-MF de dez/2024).
//
// Cobertura:
//   - PF/PJ rural imune (receita bruta anual <= R$ 3.600.000,00;
//     piso da imunidade estabelecido na regulamentação do art.
//     156-A §2º CF + LC 214/2025).
//   - PF/PJ rural no regime normal (acima do piso).
//   - Agroindústria (sempre regime normal).
//
// Convenções:
//   - Alíquotas expressas em fração (0.009 = 0,9%).
//   - Valores monetários em BRL.
//   - Ano no formato AAAA. Aceita 2026..2033+.
// ============================================================

/**
 * Regime tributário do contribuinte rural para fins de CBS/IBS.
 *
 * - `*_imune`  → receita bruta anual ≤ R$ 3.600.000 (piso legal).
 * - `*_normal` → receita bruta anual > R$ 3.600.000.
 * - `agroindustria` → sempre regime normal (industrialização).
 */
export type RegimeTributarioRural =
  | 'produtor_rural_pf_imune'
  | 'produtor_rural_pf_normal'
  | 'produtor_rural_pj_imune'
  | 'produtor_rural_pj_normal'
  | 'agroindustria';

/** Cenário de entrada para simulação da Reforma Tributária. */
export interface CenarioTributario {
  /** Ano a simular (2026..2033+). */
  ano: number;
  regime: RegimeTributarioRural;
  /** Receita bruta anual (BRL). */
  receitaBruta: number;
  /** Total de compras de insumos no ano (BRL) — base para crédito CBS/IBS. */
  comprasInsumos: number;
  /** Se true, inclui detalhe das alíquotas aplicadas por tributo. */
  mostraDetalhePorTributo?: boolean;
}

/**
 * Resultado detalhado da simulação comparando sistema antigo
 * (PIS+COFINS+ICMS+IPI+Funrural) × novo (CBS+IBS).
 */
export interface ResultadoTributario {
  sistemaAtual: {
    pisCofins: number;
    icms: number;
    ipi: number;
    funrural: number;
    total: number;
  };
  sistemaNovo: {
    /** CBS devida: alíquota CBS × receita (zerada se imune). */
    cbs: number;
    /** IBS devida: alíquota IBS × receita (zerada se imune). */
    ibs: number;
    /** CBS+IBS recuperáveis das compras de insumos (crédito integral). */
    creditosCompras: number;
    /** Funrural remanescente — ainda devido pela PF não imune. */
    funruralRemanescente: number;
    /** Total líquido (CBS + IBS - creditosCompras + funruralRemanescente). */
    total: number;
  };
  /** sistemaNovo.total - sistemaAtual.total. Negativo = economia. */
  diferencaAbsoluta: number;
  /** diferencaAbsoluta / sistemaAtual.total × 100 (0 se atual zerado). */
  diferencaPercentual: number;
  /** Alíquotas oficiais aplicadas ao ano consultado (fração). */
  aliquotasAno: { cbs: number; ibs: number };
  observacoes: string[];
  recomendacoes: string[];
}
