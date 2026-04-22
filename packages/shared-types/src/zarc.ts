// ============================================================
// ALETIS — ZARC / Zoneamento Agricola de Risco Climatico
// ============================================================
//
// Tipos canonicos para consulta do ZARC (MAPA), obrigatorio para
// habilitacao ao Proagro e Proagro-Mais (MCR 16-4). Sem ZARC
// valido para o conjunto (cultura, municipio, tipo de solo,
// ciclo de variedade, decendio de plantio), o produtor nao
// recebe cobertura securitaria e pode ter o credito recusado.
//
// Fonte: MAPA / SPA — https://indicadores.agricultura.gov.br/zarc/
// Safra 2025/26 publicada por Portarias SPA por cultura/UF.
// ============================================================

/** Tipo de solo conforme classificacao ZARC. */
export type TipoSoloZarc = 'I' | 'II' | 'III';

/** Ciclo da variedade. */
export type CicloVariedade = 'precoce' | 'medio' | 'tardio';

/**
 * Janela de plantio = um decendio (3 por mes, 36 por ano)
 * com o risco climatico projetado pelo modelo SPA/MAPA.
 */
export interface JanelaPlantio {
  /** 1..36 (decendios corridos de Janeiro a Dezembro). */
  decendio: number;
  /** Data de inicio do decendio no formato MM-DD. */
  dataInicio: string;
  /** Data de fim do decendio no formato MM-DD. */
  dataFim: string;
  /** Risco climatico agregado (0..1). Menor = melhor; 0.2 = 20%. */
  risco: number;
  /** Se o decendio faz parte da janela ZARC autorizada. */
  zarcValido: boolean;
}

/** Conjunto de janelas para uma combinacao cultura/UF/solo/ciclo. */
export interface JanelasPlantio {
  cultura: string;
  uf: string;
  codigoIbge?: string;
  tipoSolo: TipoSoloZarc;
  cicloVariedade: CicloVariedade;
  safra: string; // ex: "2025/26"
  janelas: JanelaPlantio[];
  /** Referencia a portaria MAPA que publicou o zoneamento. */
  portaria: string;
  atualizadoEm: string;
  fonte: 'api' | 'cache' | 'fallback';
}

/** Resultado da validacao de um plano de plantio contra o ZARC. */
export interface ValidacaoZarc {
  valido: boolean;
  decendio: number;
  janelaMaisProxima?: JanelaPlantio;
  risco?: number;
  /** Explicacao humana — pode ser usada para feedback ao produtor. */
  mensagem: string;
  /** Se o plano habilita Proagro / Proagro-Mais. */
  proagroElegivel: boolean;
}
