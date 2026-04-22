// ============================================================
// ALETIS — ABIOVE / Moratoria da Soja
// ============================================================
//
// Tipos canonicos para consulta do status da Moratoria da Soja
// (ABIOVE/ANEC/GTS), que veda a compra de soja oriunda de areas
// desmatadas na Amazonia apos 22/07/2008. Tradings signatarias
// (Cargill, Bunge, Amaggi, etc.) exigem compliance do produtor
// para aceitar a commodity.
//
// Fonte: ABIOVE — https://abiove.org.br/ + GTS (Grupo de Trabalho
// da Soja). Nao ha API publica: dataset curado interno.
// ============================================================

/** Status vigente da moratoria. */
export interface StatusMoratoria {
  /** Se a moratoria esta vigente hoje. */
  vigente: boolean;
  /** Data de inicio da moratoria (ISO YYYY-MM-DD). */
  desde: string;
  /** Ultima revisao / prorrogacao publicada. */
  ultimaRevisao: string;
  /** Data-corte que separa areas elegiveis das nao elegiveis. */
  dataLimite: string;
  /** Signatarios atuais do acordo. */
  signatarios: string[];
  /** URLs de documentos oficiais / comunicados. */
  fontes: string[];
  /** Observacoes (ex: discussao sobre fim da moratoria em 2025-26). */
  observacoes: string;
}

/** Elegibilidade de um imovel/municipio para comercializar soja sob a moratoria. */
export interface ElegibilidadeMoratoria {
  municipio: string;
  codigoIbge: string;
  uf: string;
  /** Se o municipio esta no bioma Amazonia (onde a moratoria se aplica). */
  noBiomaAmazonia: boolean;
  /** Se ha restricoes detectadas (desmatamento pos-2008, embargo, etc.). */
  elegivelAComprarSoja: boolean;
  /** Lista de restricoes aplicaveis (vazia se totalmente elegivel). */
  restricoes: string[];
  /** Alternativas/orientacoes para o produtor adequar-se. */
  alternativas: string[];
}
