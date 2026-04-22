import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  BSC_KPIS,
  calcularBSC,
  listarKpis,
  listarPorPerspectiva,
} from '../src/index.js';
import type { ContextoBSCCalculo } from '@aletis/shared-types/src/bsc.js';

/* ------------------------------------------------------------------
 * Contextos de referência
 * ------------------------------------------------------------------ */

/** Produtor saudável: todos KPIs perto/acima da meta. */
const CTX_SAUDAVEL: ContextoBSCCalculo = {
  receitaBruta: 12_000_000,
  receitaLiquida: 11_000_000,
  custosProducao: 7_000_000, // ~R$ 4.666/ha (abaixo da meta 5.000)
  despesasOperacionais: 1_500_000,
  ebitda: 3_500_000, // margem EBITDA ~29%
  lucroLiquido: 2_000_000,
  ativoTotal: 20_000_000,
  passivoCirculante: 2_000_000,
  ativoCirculante: 4_000_000, // liquidez 2,0
  estoque: 1_500_000, // giro = 8
  contasReceber: 900_000, // PMR ~27 dias
  dividasTotal: 5_000_000, // end. = 0,5 (abaixo de 1)
  patrimonioLiquido: 10_000_000,
  investimentoCapital: 12_500_000, // ROIC 16%
  areaPlantadaHa: 1_500,
  producaoTotalTon: 5_700, // 3,8 t/ha
  numeroColaboradores: 12,
  horasTreinamento: 280, // 23,3 h/colab
  turnoverPct: 0.08,
  npsCliente: 65,
  prazoMedioRecebimentoDias: 27,
  percInadimplencia: 0.02,
  tempoCicloProducao: 115,
  periodo: '2026-Q1',
};

/** Produtor crítico: todos KPIs sofrem. */
const CTX_CRITICO: ContextoBSCCalculo = {
  receitaBruta: 4_000_000,
  receitaLiquida: 3_800_000,
  custosProducao: 4_200_000, // ~R$ 7.000/ha (acima da meta 5.000)
  despesasOperacionais: 800_000,
  ebitda: 300_000, // margem 7,5%
  lucroLiquido: -200_000,
  ativoTotal: 10_000_000,
  passivoCirculante: 3_500_000,
  ativoCirculante: 2_800_000, // liquidez 0,8
  estoque: 2_000_000, // giro = 2
  contasReceber: 1_500_000, // PMR ~137 dias
  dividasTotal: 8_000_000, // end. = 4 (muito alto)
  patrimonioLiquido: 2_000_000,
  investimentoCapital: 10_000_000, // ROIC -2%
  areaPlantadaHa: 600,
  producaoTotalTon: 1_440, // 2,4 t/ha
  numeroColaboradores: 8,
  horasTreinamento: 40, // 5 h/colab
  turnoverPct: 0.35,
  npsCliente: 15,
  percInadimplencia: 0.18,
  tempoCicloProducao: 180,
  periodo: '2026-Q1',
};

/* ------------------------------------------------------------------
 * Catálogo
 * ------------------------------------------------------------------ */

describe('BSC_KPIS catálogo', () => {
  it('contém entre 12 e 15 KPIs', () => {
    assert.ok(
      BSC_KPIS.length >= 12 && BSC_KPIS.length <= 15,
      `Esperado 12-15 KPIs, recebido ${BSC_KPIS.length}`,
    );
  });

  it('cobre as 4 perspectivas', () => {
    const persp = new Set(BSC_KPIS.map((k) => k.perspectiva));
    assert.equal(persp.size, 4);
    assert.ok(persp.has('financeira'));
    assert.ok(persp.has('clientes'));
    assert.ok(persp.has('processos_internos'));
    assert.ok(persp.has('aprendizado_crescimento'));
  });

  it('ids únicos, snake_case', () => {
    const ids = BSC_KPIS.map((k) => k.id);
    assert.equal(new Set(ids).size, ids.length, 'ids duplicados');
    for (const id of ids) {
      assert.match(id, /^[a-z][a-z0-9_]*$/, `id inválido: ${id}`);
    }
  });

  it('todo KPI tem tendência válida', () => {
    for (const k of BSC_KPIS) {
      assert.ok(
        k.tendencia === 'maior_melhor' || k.tendencia === 'menor_melhor',
        `tendencia inválida em ${k.id}: ${k.tendencia}`,
      );
    }
  });

  it('listarKpis devolve cópia (não referência)', () => {
    const a = listarKpis();
    const b = listarKpis();
    assert.notEqual(a, b);
    assert.equal(a.length, BSC_KPIS.length);
  });

  it('listarPorPerspectiva filtra corretamente', () => {
    const fin = listarPorPerspectiva('financeira');
    assert.ok(fin.length >= 3);
    assert.ok(fin.every((k) => k.perspectiva === 'financeira'));
  });
});

/* ------------------------------------------------------------------
 * Fórmulas individuais — cenário saudável
 * ------------------------------------------------------------------ */

describe('calcularBSC — fórmulas individuais', () => {
  it('ROIC = lucroLiquido / investimentoCapital', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    const fin = r.porPerspectiva.find((p) => p.perspectiva === 'financeira')!;
    const roic = fin.kpis.find((k) => k.kpiId === 'roic')!;
    // 2_000_000 / 12_500_000 = 0.16
    assert.ok(Math.abs(roic.valor - 0.16) < 0.0001);
  });

  it('Margem EBITDA = ebitda / receitaBruta', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    const fin = r.porPerspectiva.find((p) => p.perspectiva === 'financeira')!;
    const me = fin.kpis.find((k) => k.kpiId === 'margem_ebitda')!;
    assert.ok(Math.abs(me.valor - 3_500_000 / 12_000_000) < 0.0001);
  });

  it('Liquidez corrente = AC / PC', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    const fin = r.porPerspectiva.find((p) => p.perspectiva === 'financeira')!;
    const lc = fin.kpis.find((k) => k.kpiId === 'liquidez_corrente')!;
    assert.ok(Math.abs(lc.valor - 2.0) < 0.0001);
  });

  it('Endividamento (menor_melhor): score = meta/real quando real > meta', () => {
    const r = calcularBSC(CTX_CRITICO);
    const fin = r.porPerspectiva.find((p) => p.perspectiva === 'financeira')!;
    const end = fin.kpis.find((k) => k.kpiId === 'endividamento')!;
    // real = 4, meta = 1 → score = 1/4 = 0.25
    assert.equal(end.valor, 4);
    assert.ok(Math.abs(end.score - 0.25) < 0.0001);
    assert.equal(end.status, 'abaixo_meta');
  });

  it('Produtividade (maior_melhor): score = real/meta', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    const proc = r.porPerspectiva.find((p) => p.perspectiva === 'processos_internos')!;
    const prod = proc.kpis.find((k) => k.kpiId === 'produtividade_t_ha')!;
    // 5700/1500 = 3.8 t/ha, meta 3.5 → score = 3.8/3.5 ≈ 1.086
    assert.ok(Math.abs(prod.valor - 3.8) < 0.0001);
    assert.ok(prod.score > 1, `esperado score > 1, got ${prod.score}`);
    assert.equal(prod.status, 'acima_meta');
  });

  it('Custo por hectare (menor_melhor): cálculo automático se custoHectare ausente', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    const proc = r.porPerspectiva.find((p) => p.perspectiva === 'processos_internos')!;
    const cph = proc.kpis.find((k) => k.kpiId === 'custo_por_hectare')!;
    // 7_000_000 / 1_500 ≈ 4.666,67
    assert.ok(Math.abs(cph.valor - 7_000_000 / 1_500) < 0.01);
    // meta 5000, real 4666 → score = 5000/4666 ≈ 1.07
    assert.equal(cph.status, 'acima_meta');
  });

  it('PMR: usa override direto quando fornecido', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    const cli = r.porPerspectiva.find((p) => p.perspectiva === 'clientes')!;
    const pmr = cli.kpis.find((k) => k.kpiId === 'prazo_medio_recebimento')!;
    assert.equal(pmr.valor, 27);
  });

  it('metasOverride substitui a meta padrão do catálogo', () => {
    const ctx: ContextoBSCCalculo = {
      ...CTX_SAUDAVEL,
      metasOverride: { roic: 0.25 }, // sobe meta de 15% para 25%
    };
    const r = calcularBSC(ctx);
    const fin = r.porPerspectiva.find((p) => p.perspectiva === 'financeira')!;
    const roic = fin.kpis.find((k) => k.kpiId === 'roic')!;
    assert.equal(roic.meta, 0.25);
    // valor 0.16, meta 0.25 → score = 0.64 (abaixo_meta)
    assert.ok(Math.abs(roic.score - 0.64) < 0.01);
    assert.equal(roic.status, 'abaixo_meta');
  });
});

/* ------------------------------------------------------------------
 * Cenário saudável × crítico
 * ------------------------------------------------------------------ */

describe('calcularBSC — cenários end-to-end', () => {
  it('cenário saudável → scoreGeral >= 85', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    assert.ok(r.scoreGeral >= 85, `scoreGeral saudável = ${r.scoreGeral}`);
  });

  it('cenário crítico → scoreGeral < 60', () => {
    const r = calcularBSC(CTX_CRITICO);
    assert.ok(r.scoreGeral < 60, `scoreGeral crítico = ${r.scoreGeral}`);
  });

  it('cenário crítico gera recomendações para todas as perspectivas fracas', () => {
    const r = calcularBSC(CTX_CRITICO);
    assert.ok(r.recomendacoes.length >= 3);
    const textoRec = r.recomendacoes.join('\n');
    assert.match(textoRec, /financeira/i);
    assert.match(textoRec, /processos/i);
  });

  it('todas as 4 perspectivas aparecem no resultado', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    assert.equal(r.porPerspectiva.length, 4);
    const nomes = r.porPerspectiva.map((p) => p.perspectiva);
    assert.ok(nomes.includes('financeira'));
    assert.ok(nomes.includes('clientes'));
    assert.ok(nomes.includes('processos_internos'));
    assert.ok(nomes.includes('aprendizado_crescimento'));
  });

  it('scoreGeral clampa em [0, 100] e scores perspectiva também', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    assert.ok(r.scoreGeral >= 0 && r.scoreGeral <= 100, `geral=${r.scoreGeral}`);
    for (const p of r.porPerspectiva) {
      assert.ok(p.score >= 0 && p.score <= 100, `perspectiva ${p.perspectiva}: ${p.score}`);
    }
  });

  it('KPIs sem dados são omitidos silenciosamente', () => {
    // Remove campos opcionais
    const ctx: ContextoBSCCalculo = {
      ...CTX_SAUDAVEL,
      npsCliente: undefined,
      turnoverPct: undefined,
      horasTreinamento: undefined,
      numeroColaboradores: undefined,
      tempoCicloProducao: undefined,
      percInadimplencia: undefined,
    };
    const r = calcularBSC(ctx);
    const cli = r.porPerspectiva.find((p) => p.perspectiva === 'clientes')!;
    const apr = r.porPerspectiva.find((p) => p.perspectiva === 'aprendizado_crescimento')!;
    assert.ok(!cli.kpis.some((k) => k.kpiId === 'nps_cliente'));
    assert.ok(!cli.kpis.some((k) => k.kpiId === 'perc_inadimplencia'));
    assert.equal(apr.kpis.length, 0);
    // Score geral ainda é computado (sem a perspectiva aprendizado)
    assert.ok(r.scoreGeral > 0);
  });

  it('período é preservado no resultado e em cada valor de KPI', () => {
    const r = calcularBSC(CTX_SAUDAVEL);
    assert.equal(r.periodo, '2026-Q1');
    for (const p of r.porPerspectiva) {
      for (const k of p.kpis) {
        assert.equal(k.periodo, '2026-Q1');
      }
    }
  });
});

/* ------------------------------------------------------------------
 * Robustez
 * ------------------------------------------------------------------ */

describe('calcularBSC — robustez', () => {
  it('divisão por zero não explode (retorna valor = 0)', () => {
    const ctx: ContextoBSCCalculo = {
      ...CTX_SAUDAVEL,
      investimentoCapital: 0, // ROIC → 0 por safeDiv
      passivoCirculante: 0, // liquidez → 0
      estoque: 0, // giro → 0
      areaPlantadaHa: 0, // custo/ha, produtividade → 0
    };
    const r = calcularBSC(ctx);
    assert.ok(Number.isFinite(r.scoreGeral));
    for (const p of r.porPerspectiva) {
      for (const k of p.kpis) {
        assert.ok(Number.isFinite(k.valor), `${k.kpiId}: ${k.valor}`);
        assert.ok(Number.isFinite(k.score), `${k.kpiId}: score ${k.score}`);
      }
    }
  });

  it('menor_melhor com valor zero retorna score cap (ótimo)', () => {
    const ctx: ContextoBSCCalculo = {
      ...CTX_SAUDAVEL,
      percInadimplencia: 0, // menor_melhor, zero = ótimo
    };
    const r = calcularBSC(ctx);
    const cli = r.porPerspectiva.find((p) => p.perspectiva === 'clientes')!;
    const inad = cli.kpis.find((k) => k.kpiId === 'perc_inadimplencia')!;
    assert.equal(inad.status, 'acima_meta');
    assert.ok(inad.score >= 1);
  });
});
