// ============================================================
// ALETIS — Desenrola Rural / PGFN (simulação + elegibilidade)
// ============================================================
//
// Tipos canonicos para o módulo Desenrola Rural, programa federal
// de renegociação de débitos rurais com a PGFN / Receita Federal.
//
// Base legal:
//   - MP 1208/2024 (institui o programa)
//   - Lei 14.973/2024 (consolida e autoriza transição excepcional)
//   - Portaria PGFN/ME de regulamentação (transação por adesão)
//
// Prazo de adesão: 31/12/2026 (conforme regulamentação vigente).
//
// Convenções:
//   - Valores em BRL, datas em ISO-8601 (YYYY-MM-DD).
//   - Descontos em percentual (0.65 = 65%).
// ============================================================

/**
 * Faixa de capacidade de pagamento atribuída ao produtor.
 *
 * Calculada a partir do ratio dívidas/ativos e da receita bruta
 * anual. Quanto pior a capacidade, maior o desconto autorizado.
 *
 * - `A` alta capacidade   → descontos menores
 * - `B` média-alta
 * - `C` média-baixa
 * - `D` baixa capacidade  → até 100% juros, 65% multa
 */
export type FaixaCapacidadePagamento = 'A' | 'B' | 'C' | 'D';

/** Dívida rural candidata ao programa. */
export interface DividaRural {
  id: string;
  /** Valor originalmente inscrito em dívida ativa (BRL). */
  valorInscrito: number;
  /** Valor atualizado com juros e multa (BRL). */
  valorAtualizado: number;
  /** Data de inscrição em dívida ativa (ISO YYYY-MM-DD). */
  dataInscricao: string;
  origem:
    | 'pgfn'
    | 'receita_federal'
    | 'banco_publico'
    | 'banco_cooperativa'
    | 'outro';
  modalidade: 'custeio' | 'investimento' | 'comercializacao' | 'outra';
  garantias?: string[];
}

/** Perfil do produtor para enquadramento na faixa de capacidade. */
export interface PerfilProdutor {
  tipo: 'PF' | 'PJ';
  /** Receita bruta anual declarada (BRL). */
  receitaBrutaAnual: number;
  /** Ativos declarados (terras, maquinário, estoque) (BRL). */
  ativosDeclarados: number;
  /** Total de dívidas do produtor (todas as fontes) (BRL). */
  dividasTotal: number;
  /** Faixa já informada — caso deseje simular uma faixa específica. */
  capacidadePagamento: FaixaCapacidadePagamento;
}

/** Parcela no cronograma proposto de quitação. */
export interface ParcelaCronograma {
  parcela: number;
  valor: number;
  data: string;
}

/** Resultado completo da simulação Desenrola Rural. */
export interface SimulacaoDesenrolaRural {
  divida: DividaRural;
  perfil: PerfilProdutor;
  elegivel: boolean;
  motivos: string[];
  valorAtualizado: number;
  descontoJurosPct: number;
  descontoMultaPct: number;
  descontoEncargosLegaisPct: number;
  entradaMinima: number;
  parcelamentoMaximoMeses: number;
  valorAPagar: number;
  economia: number;
  cronogramaProposto: ParcelaCronograma[];
  prazoAdesao: string;
  baseLegal: string[];
}
