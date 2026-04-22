// ============================================================
// ALETIS — Desmatamento / Alertas INPE (DETER / PRODES / MapBiomas)
// ============================================================
//
// Tipos canonicos para consulta de alertas de desmatamento por
// municipio/CAR. Essencial para compliance de credito rural
// (Resolucao CMN nº 5.081/2023 e regulamentacoes 2024-26):
// imoveis rurais tomando Pronaf/Pronamp devem comprovar ausencia
// de alertas de desmatamento recentes.
//
// Fontes:
//  - INPE/DETER-AMZ (Amazonia Legal, alerta quase-real tempo)
//  - INPE/DETER-CER (Cerrado)
//  - PRODES (anual, oficial)
//  - MapBiomas Alertas (complementar)
// ============================================================

/** Bioma onde o alerta foi detectado. */
export type BiomaDesmatamento =
  | 'Amazônia'
  | 'Cerrado'
  | 'Caatinga'
  | 'Mata Atlântica'
  | 'Pantanal'
  | 'Pampa';

/** Classificacao do alerta (conforme nomenclatura DETER). */
export type ClasseDesmatamento =
  | 'CORTE_RASO'
  | 'DEGRADACAO'
  | 'MINERACAO'
  | 'CICATRIZ_QUEIMADA'
  | 'OUTRO';

/** Origem da deteccao. */
export type FonteDesmatamento = 'DETER' | 'PRODES' | 'MapBiomas';

/** Alerta individual. */
export interface AlertaDesmatamento {
  id: string;
  dataDeteccao: string; // ISO-8601 YYYY-MM-DD
  bioma: BiomaDesmatamento;
  uf: string;
  codigoIbge?: string;
  areaHa: number;
  classe: ClasseDesmatamento;
  fonte: FonteDesmatamento;
  latitude?: number;
  longitude?: number;
}

/** Agregado de alertas para um recorte (municipio, CAR, UF, etc.). */
export interface AlertasDesmatamento {
  alertas: AlertaDesmatamento[];
  total: number;
  areaTotalHa: number;
  /** Restricoes aplicaveis (ex: "imovel embargado, nao pode receber credito"). */
  bloqueios: string[];
  atualizadoEm: string;
  /** De onde veio: API viva, cache ou fallback curado. */
  fonte: 'api' | 'cache' | 'fallback';
}

/** Resumo agregado por bioma + UF (nacional). */
export interface ResumoDesmatamento {
  periodo: string; // ex: "2025-01-01/2025-12-31"
  areaTotalHa: number;
  totalAlertas: number;
  porBioma: { bioma: BiomaDesmatamento; areaHa: number; alertas: number }[];
  porUF: { uf: string; areaHa: number; alertas: number }[];
  topMunicipios: { codigoIbge: string; municipio: string; uf: string; areaHa: number }[];
  atualizadoEm: string;
  fonte: 'api' | 'cache' | 'fallback';
}
