/**
 * Plano de Contas de exemplo — subset do plano padrão brasileiro,
 * usado pelos testes. Estrutura hierárquica com níveis em
 * `caracteres` (1, 3, 5, 7, 9, 11, 13).
 *
 * Códigos começando com "1" = Ativo; "2" = Passivo/PL; "3" = Receita;
 * "4" = Custos/Despesas; "5" = Financeiras.
 */

import type { PlanoContas } from '../types.js';

export const PLANO_CONTAS_FIXTURE: PlanoContas[] = [
  // ── ATIVO ──────────────────────────────────────────────────
  {
    codigo: '1',
    descricao: 'ATIVO',
    caracteres: 1,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '1.1',
    descricao: 'ATIVO CIRCULANTE',
    caracteres: 3,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '1.1.1',
    descricao: 'Caixa e Equivalentes',
    caracteres: 5,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '1.1.1.01.0002',
    descricao: 'Bancos Conta Movimento',
    caracteres: 13,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '1.1.2.01.0001',
    descricao: 'Clientes Nacionais',
    caracteres: 13,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '1.1.3.01.0001',
    descricao: 'Mercadorias Revenda',
    caracteres: 13,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },

  // ── PASSIVO + PL ───────────────────────────────────────────
  {
    codigo: '2',
    descricao: 'PASSIVO',
    caracteres: 1,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '2.1.3.01.0001',
    descricao: 'Simples Nacional',
    caracteres: 13,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '2.3.1.01.0001',
    descricao: 'Capital Subscrito',
    caracteres: 13,
    balancete: true,
    balanco: true,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },

  // ── RECEITAS ───────────────────────────────────────────────
  // Contas aglutinadoras (flags false — as flags só marcam analíticas,
  // que é o que bate com BD_Lancamento[Conta2]).
  {
    codigo: '3',
    descricao: 'RECEITAS',
    caracteres: 1,
    balancete: true,
    balanco: false,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '3.1.1.01.0001',
    descricao: 'Venda de Produtos',
    caracteres: 13,
    balancete: true,
    balanco: false,
    ebitda: true,
    ebit: true,
    lucroLiquido: true,
  },
  {
    codigo: '3.2.1.01.0001',
    descricao: '(-) ICMS sobre Vendas',
    caracteres: 13,
    balancete: true,
    balanco: false,
    ebitda: true,
    ebit: true,
    lucroLiquido: true,
  },

  // ── CUSTOS / DESPESAS ──────────────────────────────────────
  {
    codigo: '4',
    descricao: 'CUSTOS E DESPESAS',
    caracteres: 1,
    balancete: true,
    balanco: false,
    ebitda: false,
    ebit: false,
    lucroLiquido: false,
  },
  {
    codigo: '4.1.1.01.0001',
    descricao: 'Custo Merc. Vendida',
    caracteres: 13,
    balancete: true,
    balanco: false,
    ebitda: true,
    ebit: true,
    lucroLiquido: true,
  },
  {
    codigo: '4.2.4.01.0004',
    descricao: 'Amortização Softwares',
    caracteres: 13,
    balancete: true,
    balanco: false,
    // Depreciação/Amortização: sai do EBITDA (flag false) mas conta p/ EBIT e LL
    ebitda: false,
    ebit: true,
    lucroLiquido: true,
  },
];
