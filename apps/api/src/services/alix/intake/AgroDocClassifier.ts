// ============================================================
// AgroDocClassifier — identifica o tipo de documento agro
// a partir do extractedText + extrai campos estruturados.
// ============================================================
// Tipos suportados:
//   - CCIR (Certificado de Cadastro de Imóvel Rural)
//   - CAR (Cadastro Ambiental Rural — demonstrativo)
//   - Matrícula (Registro de Imóveis)
//   - Extrato bancário (saldos, movimentação)
//   - Contrato de crédito rural (Pronaf/Pronamp/MCR)
//   - DAP (Declaração de Aptidão Pronaf)
//   - NFe de produtor rural
//   - Laudo técnico/agronômico
//
// Cada tipo tem regex de detecção + extratores específicos.
// Retorna { tipo, camposExtraidos, confianca } — usado pelo
// DocumentIntakeService para enriquecer metadata automaticamente.
// ============================================================

export type AgroDocTipo =
  | 'CCIR'
  | 'CAR'
  | 'MATRICULA'
  | 'EXTRATO_BANCARIO'
  | 'CONTRATO_CREDITO_RURAL'
  | 'DAP'
  | 'NFE_PRODUTOR'
  | 'LAUDO_TECNICO'
  | 'OUTRO';

export interface AgroDocClassification {
  tipo: AgroDocTipo;
  confianca: number; // 0-1
  camposExtraidos: Record<string, unknown>;
  indicadores: string[]; // keywords que levaram à classificação
}

const TIPOS_DETECTORES: Array<{
  tipo: AgroDocTipo;
  signals: Array<{ pattern: RegExp; weight: number }>;
  extrair: (text: string) => Record<string, unknown>;
}> = [
  // ─── CCIR ─────────────────────────────────────────────
  {
    tipo: 'CCIR',
    signals: [
      { pattern: /certificado\s+de\s+cadastro\s+de\s+im[óo]vel\s+rural/i, weight: 0.9 },
      { pattern: /\bCCIR\b/i, weight: 0.7 },
      { pattern: /INCRA/i, weight: 0.3 },
      { pattern: /código\s+do\s+im[óo]vel\s+rural/i, weight: 0.4 },
    ],
    extrair: (text) => {
      const out: Record<string, unknown> = {};
      const codImovel = text.match(/c[oó]digo\s+(?:do\s+)?im[oó]vel\s+rural[\s:]+([0-9.\-]+)/i);
      if (codImovel) out.codigoImovel = codImovel[1];
      const area = text.match(/[aá]rea\s+total[\s:]+([0-9.,]+)\s*(?:ha|hectares?)/i);
      if (area) out.areaTotalHa = parseFloat(area[1].replace(/\./g, '').replace(',', '.'));
      const modulos = text.match(/m[oó]dulos?\s+fiscais?[\s:]+([0-9.,]+)/i);
      if (modulos) out.modulosFiscais = parseFloat(modulos[1].replace(',', '.'));
      const municipio = text.match(/munic[ií]pio[\s:]+([A-ZÁ-Úa-zá-ú\s]{3,40})\b/i);
      if (municipio) out.municipio = municipio[1].trim();
      const uf = text.match(/\bUF[\s:]+([A-Z]{2})\b/);
      if (uf) out.uf = uf[1];
      const proprietario = text.match(/propriet[aá]rio[\s:]+([^\n]{5,80})/i);
      if (proprietario) out.proprietario = proprietario[1].trim();
      return out;
    },
  },
  // ─── CAR ──────────────────────────────────────────────
  {
    tipo: 'CAR',
    signals: [
      { pattern: /cadastro\s+ambiental\s+rural/i, weight: 0.9 },
      { pattern: /\bCAR\b.*?(\d{2}-\d{7}-[A-F0-9]{32,})/i, weight: 0.8 },
      { pattern: /demonstrativo\s+do\s+im[oó]vel/i, weight: 0.5 },
      { pattern: /reserva\s+legal/i, weight: 0.3 },
    ],
    extrair: (text) => {
      const out: Record<string, unknown> = {};
      const carCode = text.match(/\b([A-Z]{2}-\d{7}-[A-F0-9]{32,44})\b/i);
      if (carCode) out.codigoCar = carCode[1];
      const area = text.match(/[aá]rea\s+(?:do\s+)?im[oó]vel[\s:]+([0-9.,]+)\s*ha/i);
      if (area) out.areaImovelHa = parseFloat(area[1].replace(/\./g, '').replace(',', '.'));
      const rl = text.match(/reserva\s+legal[\s:]+([0-9.,]+)\s*ha/i);
      if (rl) out.reservaLegalHa = parseFloat(rl[1].replace(/\./g, '').replace(',', '.'));
      const app = text.match(/[áa]rea\s+de\s+preserva[cç][aã]o[\s:]+([0-9.,]+)\s*ha/i);
      if (app) out.appHa = parseFloat(app[1].replace(/\./g, '').replace(',', '.'));
      return out;
    },
  },
  // ─── Matrícula ────────────────────────────────────────
  {
    tipo: 'MATRICULA',
    signals: [
      { pattern: /certid[aã]o\s+da\s+matr[ií]cula/i, weight: 0.9 },
      { pattern: /cart[oó]rio\s+de\s+registro\s+de\s+im[oó]veis/i, weight: 0.7 },
      { pattern: /\bmatr[ií]cula\s+n[º°]?\s*[\d.]+/i, weight: 0.6 },
      { pattern: /livro\s+\d+/i, weight: 0.3 },
    ],
    extrair: (text) => {
      const out: Record<string, unknown> = {};
      const mat = text.match(/matr[ií]cula\s+n[º°]?\s*([\d.]+)/i);
      if (mat) out.numeroMatricula = mat[1].replace(/\D/g, '');
      const livro = text.match(/livro[\s:]+([0-9-]+)/i);
      if (livro) out.livro = livro[1];
      const onus = /hipoteca|penhora|alien[aã]o|usufruto|servid[aã]o/i.test(text);
      if (onus) out.temOnus = true;
      const hipotecas = text.match(/hipoteca/gi);
      if (hipotecas) out.hipotecasCount = hipotecas.length;
      const penhoras = text.match(/penhora/gi);
      if (penhoras) out.penhorasCount = penhoras.length;
      return out;
    },
  },
  // ─── Extrato bancário ──────────────────────────────────
  {
    tipo: 'EXTRATO_BANCARIO',
    signals: [
      { pattern: /extrato\s+(?:banc[aá]rio|da\s+conta)/i, weight: 0.9 },
      { pattern: /saldo\s+anterior|saldo\s+atual|saldo\s+disponível/i, weight: 0.6 },
      { pattern: /d[eé]bito.*cr[eé]dito|cr[eé]dito.*d[eé]bito/i, weight: 0.3 },
      { pattern: /(?:banco|ag[eê]ncia|conta).*\b\d{4,}/i, weight: 0.4 },
    ],
    extrair: (text) => {
      const out: Record<string, unknown> = {};
      const banco = text.match(/banco\s+(?:do\s+)?([A-Za-zÁ-Úá-ú\s]{3,30}?)\s*(?:\n|s\/a|S\/A)/i);
      if (banco) out.banco = banco[1].trim();
      const agencia = text.match(/ag[eê]ncia[\s:]+([0-9-]+)/i);
      if (agencia) out.agencia = agencia[1];
      const conta = text.match(/conta[\s:]+([0-9-]+)/i);
      if (conta) out.conta = conta[1];
      const saldoMatch = text.match(/saldo\s+(?:atual|final|dispon[ií]vel)[\s:]+R?\$?\s*([0-9.,-]+)/i);
      if (saldoMatch) {
        const raw = saldoMatch[1].replace(/\./g, '').replace(',', '.');
        const n = parseFloat(raw);
        if (!isNaN(n)) out.saldoAtual = n;
      }
      return out;
    },
  },
  // ─── Contrato crédito rural ────────────────────────────
  {
    tipo: 'CONTRATO_CREDITO_RURAL',
    signals: [
      { pattern: /c[eé]dula\s+rural|contrato\s+de\s+(?:c[eé]dula\s+)?rural/i, weight: 0.9 },
      { pattern: /Pronaf|Pronamp|MCR|Plano\s+Safra/i, weight: 0.7 },
      { pattern: /custeio\s+(?:agr[ií]cola|pecu[aá]rio|rural)/i, weight: 0.5 },
      { pattern: /garantia.*(?:hipoteca|penhor|cauci)/i, weight: 0.3 },
    ],
    extrair: (text) => {
      const out: Record<string, unknown> = {};
      const linha = text.match(/\b(pronaf|pronamp|funcafé|mcr|plano\s+safra)\b/i);
      if (linha) out.linhaCredito = linha[1].toUpperCase();
      const valor = text.match(/valor\s+(?:do\s+)?(?:contrato|cr[eé]dito|financiamento)[\s:]+R?\$?\s*([0-9.,]+)/i);
      if (valor) {
        const n = parseFloat(valor[1].replace(/\./g, '').replace(',', '.'));
        if (!isNaN(n)) out.valorContrato = n;
      }
      const taxa = text.match(/taxa\s+(?:de\s+)?juros[\s:]+([0-9.,]+)\s*%/i);
      if (taxa) out.taxaPctAnual = parseFloat(taxa[1].replace(',', '.'));
      const prazo = text.match(/prazo\s+(?:total\s+)?(?:de\s+)?([0-9]+)\s+(?:meses|anos)/i);
      if (prazo) out.prazoMeses = parseInt(prazo[1]);
      const safra = text.match(/safra[\s:]+([0-9]{4}\/[0-9]{2,4})/i);
      if (safra) out.safra = safra[1];
      return out;
    },
  },
  // ─── DAP ──────────────────────────────────────────────
  {
    tipo: 'DAP',
    signals: [
      { pattern: /declara[cç][aã]o\s+de\s+aptid[aã]o.*Pronaf/i, weight: 0.95 },
      { pattern: /\bDAP\b/i, weight: 0.5 },
    ],
    extrair: (text) => {
      const out: Record<string, unknown> = {};
      const numDap = text.match(/DAP[\s:]+([A-Z0-9-]+)/i);
      if (numDap) out.numeroDap = numDap[1];
      const validade = text.match(/validade[\s:]+(\d{2}\/\d{2}\/\d{4})/i);
      if (validade) out.validade = validade[1];
      return out;
    },
  },
];

/**
 * Classifica um documento agro a partir do texto extraído.
 * Aplica cada detector e escolhe o de maior score.
 */
export function classifyAgroDoc(extractedText: string): AgroDocClassification {
  if (!extractedText || extractedText.trim().length < 50) {
    return { tipo: 'OUTRO', confianca: 0, camposExtraidos: {}, indicadores: [] };
  }

  const scores: Array<{ tipo: AgroDocTipo; score: number; matched: string[]; fields: Record<string, unknown> }> = [];
  for (const detector of TIPOS_DETECTORES) {
    let score = 0;
    const matched: string[] = [];
    for (const s of detector.signals) {
      if (s.pattern.test(extractedText)) {
        score += s.weight;
        matched.push(s.pattern.source.slice(0, 50));
      }
    }
    if (score > 0) {
      scores.push({
        tipo: detector.tipo,
        score,
        matched,
        fields: detector.extrair(extractedText),
      });
    }
  }

  if (scores.length === 0) {
    return { tipo: 'OUTRO', confianca: 0, camposExtraidos: {}, indicadores: [] };
  }

  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];
  return {
    tipo: winner.tipo,
    confianca: Math.min(1, winner.score), // cap em 1
    camposExtraidos: winner.fields,
    indicadores: winner.matched,
  };
}
