// ============================================================
// EntityMapper — Mapeia extrações de documento → modelo Cliente
// Normaliza, valida e consolida entidades de todos os extractors
// ============================================================

import type {
  DocumentExtractionResult,
  ExtractedEntity,
  ClienteExtractionData,
  DividaExtractionData,
  PropriedadeExtractionData,
  DocumentEvidence,
  ContratoExtractedData,
} from '@aletis/shared-types';

// ── Normalizações ──

function cleanText(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function toUf(v: unknown): string | undefined {
  const s = String(v ?? '').toUpperCase().replace(/\W/g, '');
  if (/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(s)) return s;
  return undefined;
}

function toCpfCnpj(v: unknown): string | undefined {
  const s = String(v ?? '').replace(/\D/g, '');
  if (s.length === 11 || s.length === 14) return s;
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function toIsoDate(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  // Tenta converter dd/mm/yyyy → yyyy-mm-dd
  const brMatch = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const year = y.length === 2 ? (Number(y) < 50 ? `20${y}` : `19${y}`) : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Já está ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return undefined;
}

function mergeEndereco(base?: ClienteExtractionData['endereco'], novo?: ClienteExtractionData['endereco']): ClienteExtractionData['endereco'] {
  if (!base && !novo) return undefined;
  if (!novo) return base;
  if (!base) return novo;
  return {
    logradouro: cleanText(novo.logradouro || base.logradouro),
    numero: cleanText(novo.numero || base.numero),
    complemento: cleanText(novo.complemento || base.complemento),
    bairro: cleanText(novo.bairro || base.bairro),
    cidade: cleanText(novo.cidade || base.cidade),
    uf: toUf(novo.uf || base.uf),
    cep: cleanText(novo.cep || base.cep)?.replace(/\D/g, ''),
  };
}

function mergeClienteData(base: ClienteExtractionData, novo: ClienteExtractionData): ClienteExtractionData {
  return {
    nome: cleanText(novo.nome || base.nome),
    cpfCnpj: toCpfCnpj(novo.cpfCnpj || base.cpfCnpj),
    tipoPessoa: novo.tipoPessoa || base.tipoPessoa || (toCpfCnpj(novo.cpfCnpj || base.cpfCnpj)?.length === 14 ? 'PJ' : 'PF'),
    cidade: cleanText(novo.cidade || base.cidade),
    uf: toUf(novo.uf || base.uf),
    telefone: cleanText(novo.telefone || base.telefone),
    email: cleanText(novo.email || base.email),
    endereco: mergeEndereco(base.endereco, novo.endereco),
    atividade: cleanText(novo.atividade || base.atividade),
    areaTotalHa: toNumber(novo.areaTotalHa ?? base.areaTotalHa),
    culturas: novo.culturas?.length ? novo.culturas : base.culturas,
    carCodigoImovel: cleanText(novo.carCodigoImovel || base.carCodigoImovel),
    propriedades: novo.propriedades?.length ? novo.propriedades : base.propriedades,
  };
}

// ── Extrai ClienteExtractionData de entidades genéricas ──

function entitiesToClienteData(entities: ExtractedEntity[]): ClienteExtractionData {
  const pessoas = entities.filter((e) => e.tipo === 'pessoa' || e.tipo === 'empresa');
  const principal = pessoas.sort((a, b) => b.confianca - a.confianca)[0];

  const enderecos = entities.filter((e) => e.tipo === 'endereco');
  const endereco = enderecos.sort((a, b) => b.confianca - a.confianca)[0];

  const cidadesUfs = entities
    .filter((e) => e.categoria === 'cidade' || e.categoria === 'municipio')
    .map((e) => ({ cidade: e.nome, uf: toUf(e.descricao) }));

  const valoresDivida = entities.filter((e) => e.tipo === 'valor' && /d[ií]vida|saldo|passivo|d[eé]bito|credito/.test(e.categoria));
  const maiorDivida = valoresDivida.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))[0];

  const bancos = Array.from(
    new Set(entities.filter((e) => e.tipo === 'banco').map((e) => cleanText(e.nome)).filter(Boolean))
  );

  return {
    nome: principal?.nome,
    cpfCnpj: toCpfCnpj(principal?.cpfCnpj),
    tipoPessoa: toCpfCnpj(principal?.cpfCnpj)?.length === 14 ? 'PJ' : 'PF',
    cidade: cidadesUfs[0]?.cidade,
    uf: cidadesUfs[0]?.uf,
    telefone: principal?.telefone,
    email: principal?.email,
    endereco: endereco
      ? {
          logradouro: cleanText(endereco.endereco),
          cidade: cleanText(endereco.endereco),
        }
      : undefined,
    atividade: bancos.length ? `Produtor rural - ${bancos[0]}` : undefined,
  };
}

function entitiesToDividas(entities: ExtractedEntity[]): DividaExtractionData[] {
  const dividas: DividaExtractionData[] = [];
  const porContrato = new Map<string, DividaExtractionData>();

  for (const e of entities) {
    if (e.tipo === 'valor' && e.valor && /d[ií]vida|saldo|passivo|d[eé]bito|credito/.test(e.categoria)) {
      const key = e.categoria;
      const existente = porContrato.get(key);
      if (!existente || (e.valor > (existente.valorAtualizado || 0))) {
        porContrato.set(key, {
          valorAtualizado: e.valor,
          credor: e.descricao || e.categoria,
          status: 'ativa',
        });
      }
    }
  }

  for (const d of porContrato.values()) {
    dividas.push(d);
  }
  return dividas;
}

function entitiesToPropriedades(entities: ExtractedEntity[]): PropriedadeExtractionData[] {
  return entities
    .filter((e) => e.tipo === 'imovel_rural')
    .map((e) => ({
      nome: cleanText(e.nome),
      municipio: cleanText(e.endereco),
      areaHa: toNumber(e.valor),
      car: e.descricao?.match(/CAR[:\s]*([A-Z0-9\-]+)/i)?.[1],
      ccir: e.descricao?.match(/CCIR[:\s]*([\d\.]+)/i)?.[1],
      matricula: e.descricao?.match(/matr[ií]cula[:\s]*([\d\.]+)/i)?.[1],
      condicao: 'proprietario' as const,
    }));
}

// ── Constrói ContratoExtractedData a partir de entidades genéricas (fallback) ──

function buildContratoFromEntities(entities: ExtractedEntity[]): ContratoExtractedData | undefined {
  const pessoas = entities.filter((e) => e.tipo === 'pessoa' || e.tipo === 'empresa');
  const devedor = pessoas.find((e) => e.categoria === 'devedor');
  const credor = pessoas.find((e) => e.categoria === 'credor') || entities.find((e) => e.tipo === 'banco');
  const conjuge = pessoas.find((e) => e.categoria === 'conjuge');
  const avalistas = pessoas.filter((e) => e.categoria === 'avalista');
  const fiadores = pessoas.filter((e) => e.categoria === 'fiador');

  if (!devedor) return undefined;

  const imoveis = entitiesToPropriedades(entities).map((p) => ({
    tipo: 'imovel_rural' as const,
    categoria: 'imovel_garantia',
    nome: p.nome || p.municipio || 'Imóvel rural',
    endereco: p.municipio ? `${p.municipio}${p.uf ? `, ${p.uf}` : ''}` : '',
    descricao: `CAR: ${p.car || '—'}, CCIR: ${p.ccir || '—'}, Matrícula: ${p.matricula || '—'}`,
    fonte: p.car || p.ccir || p.municipio || '',
    confianca: 0.6,
  }));
  const garantias = entities
    .filter((e) => e.categoria === 'garantia_real' || e.categoria === 'garantia')
    .map((e) => ({
      tipo: e.descricao?.toLowerCase().includes('hipoteca')
        ? 'hipoteca' as const
        : e.descricao?.toLowerCase().includes('penhor')
          ? 'penhor' as const
          : e.descricao?.toLowerCase().includes('aval')
            ? 'aval' as const
            : 'outro' as const,
      descricao: e.descricao || e.fonte,
    }));

  return {
    tipoContrato: 'outro',
    partes: {
      devedor,
      conjuge,
      avalistas,
      fiadores,
    },
    credor: credor || { tipo: 'empresa', categoria: 'credor', nome: 'Não identificado', fonte: '', confianca: 0 },
    garantias,
    imoveisVinculados: imoveis,
    clausulasRisco: [],
  };
}

// ── API pública ──

export interface MappedResult {
  result: DocumentExtractionResult;
  confianca: number;
}

export function mapContractExtraction(
  doc: { id: string; sessionId: string },
  contractResult: import('./ContractExtractor.js').ContractExtractionResult,
): MappedResult {
  const cd = contractResult.data;
  const clienteData: ClienteExtractionData = {
    nome: cd.partes.devedor.nome,
    cpfCnpj: toCpfCnpj(cd.partes.devedor.cpfCnpj),
    tipoPessoa: toCpfCnpj(cd.partes.devedor.cpfCnpj)?.length === 14 ? 'PJ' : 'PF',
    cidade: cleanText(cd.partes.devedor.endereco),
    telefone: cleanText(cd.partes.devedor.telefone),
    email: cleanText(cd.partes.devedor.email),
    endereco: parseEnderecoCompleto(cd.partes.devedor.endereco),
    atividade: 'Produtor rural',
    areaTotalHa: cd.imoveisVinculados.reduce((sum, i) => sum + (i.valor || 0), 0) || undefined,
    culturas: undefined,
    carCodigoImovel: cd.imoveisVinculados[0]?.descricao?.match(/CAR[:\s]*([A-Z0-9\-]+)/i)?.[1],
    propriedades: cd.imoveisVinculados.map((i) => ({
      nome: cleanText(i.nome),
      municipio: cleanText(i.endereco),
      areaHa: toNumber(i.valor),
      car: i.descricao?.match(/CAR[:\s]*([A-Z0-9\-]+)/i)?.[1],
      ccir: i.descricao?.match(/CCIR[:\s]*([\d\.]+)/i)?.[1],
      matricula: i.descricao?.match(/matr[ií]cula[:\s]*([\d\.]+)/i)?.[1],
      condicao: 'proprietario',
    })),
  };

  const dividas: DividaExtractionData[] = [];
  if (cd.valorLiberado || cd.valorAtualizado || cd.numeroContrato) {
    dividas.push({
      contrato: cd.numeroContrato || 'Não identificado',
      valorOriginal: cd.valorLiberado,
      valorAtualizado: cd.valorAtualizado,
      vencimento: cd.dataVencimento,
      status: 'ativa',
      credor: cd.credor.nome || 'Não identificado',
      numeroContrato: cd.numeroContrato,
      taxaContratadaAa: cd.taxaContratadaAa,
      garantias: cd.garantias.map((g) => g.descricao),
      modalidade: cd.tipoContrato,
    });
  }

  const result: DocumentExtractionResult = {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    tipoDocumento: 'contrato_credito_rural',
    confianca: contractResult.confianca,
    entidades: [
      cd.partes.devedor,
      ...(cd.partes.conjuge ? [cd.partes.conjuge] : []),
      ...(cd.partes.avalistas || []),
      ...(cd.partes.fiadores || []),
      cd.credor,
      ...(cd.imoveisVinculados || []),
      ...cd.garantias.map((g) => ({
        tipo: 'outro' as const,
        categoria: 'garantia',
        descricao: `${g.tipo}: ${g.descricao}`,
        fonte: g.descricao,
        confianca: 0.7,
      })),
    ],
    clienteData,
    dividas,
    propriedades: clienteData.propriedades || [],
    contrato: cd,
    riscos: cd.clausulasRisco.map((c) => `${c.tipo} (${c.severidade}): ${c.texto}`),
    lacunas: contractResult.lacunas,
    acoesSugeridas: [
      'Criar/atualizar cliente no CRM com dados do contrato',
      'Gerar proposta inteligente baseada nas condições contratuais',
      ...(cd.clausulasRisco.some((c) => c.severidade === 'alta' || c.severidade === 'critica')
        ? ['Revisar cláusulas de risco antes de propor renegociação']
        : []),
    ],
    evidencias: contractResult.evidencias,
  };

  return { result, confianca: contractResult.confianca };
}

export function mapProposalExtraction(
  doc: { id: string; sessionId: string },
  proposalResult: import('./ProposalExtractor.js').ProposalExtractionResult,
): MappedResult {
  const result: DocumentExtractionResult = {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    tipoDocumento: 'proposta_comercial',
    confianca: proposalResult.confianca,
    entidades: [],
    clienteData: proposalResult.clienteData,
    dividas: proposalResult.dividaTotal
      ? [{
          valorAtualizado: proposalResult.dividaTotal,
          credor: proposalResult.bancos[0] || 'Não identificado',
          status: 'ativa',
          garantias: [],
        }]
      : [],
    propriedades: [],
    riscos: [],
    lacunas: proposalResult.lacunas,
    acoesSugeridas: ['Criar/atualizar cliente no CRM com dados da proposta'],
    evidencias: proposalResult.evidencias,
  };
  return { result, confianca: proposalResult.confianca };
}

export function mapBankStatementExtraction(
  doc: { id: string; sessionId: string },
  bankResult: import('./BankStatementExtractor.js').BankStatementResult,
): MappedResult {
  const result: DocumentExtractionResult = {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    tipoDocumento: 'extrato_bancario',
    confianca: bankResult.confianca,
    entidades: [],
    clienteData: bankResult.clienteData,
    dividas: [],
    propriedades: [],
    riscos: [],
    lacunas: bankResult.lacunas,
    acoesSugeridas: ['Anexar extrato bancário ao cliente existente'],
    evidencias: bankResult.evidencias,
  };
  return { result, confianca: bankResult.confianca };
}

export function mapIdentityDocExtraction(
  doc: { id: string; sessionId: string },
  idResult: import('./IdentityDocExtractor.js').IdentityDocResult,
): MappedResult {
  const result: DocumentExtractionResult = {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    tipoDocumento: 'documento_pessoal',
    confianca: idResult.confianca,
    entidades: [],
    clienteData: idResult.clienteData,
    dividas: [],
    propriedades: [],
    riscos: [],
    lacunas: idResult.lacunas,
    acoesSugeridas: ['Criar/atualizar cliente com dados do documento pessoal'],
    evidencias: idResult.evidencias,
  };
  return { result, confianca: idResult.confianca };
}

export function mapTechnicalReportExtraction(
  doc: { id: string; sessionId: string },
  reportResult: import('./TechnicalReportExtractor.js').TechnicalReportResult,
): MappedResult {
  const result: DocumentExtractionResult = {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    tipoDocumento: 'laudo_tecnico',
    confianca: reportResult.confianca,
    entidades: [],
    clienteData: reportResult.clienteData,
    dividas: [],
    propriedades: reportResult.propriedades,
    riscos: [],
    lacunas: reportResult.lacunas,
    acoesSugeridas: ['Atualizar cliente com dados do laudo técnico e imóveis'],
    evidencias: reportResult.evidencias,
  };
  return { result, confianca: reportResult.confianca };
}

export function mapSpreadsheetExtraction(
  doc: { id: string; sessionId: string },
  sheetResult: import('./SpreadsheetExtractor.js').SpreadsheetResult,
): MappedResult {
  const result: DocumentExtractionResult = {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    tipoDocumento: 'planilha_gestao',
    confianca: sheetResult.confianca,
    entidades: [],
    clienteData: sheetResult.clienteData,
    dividas: sheetResult.dividaTotalDeclarada
      ? [{
          valorAtualizado: sheetResult.dividaTotalDeclarada,
          credor: sheetResult.instituicoesCredoras[0] || 'Não identificado',
          status: 'ativa',
          garantias: [],
        }]
      : [],
    propriedades: [],
    riscos: [],
    lacunas: sheetResult.lacunas,
    acoesSugeridas: ['Importar planilha para gestão financeira do cliente'],
    evidencias: sheetResult.evidencias,
  };
  return { result, confianca: sheetResult.confianca };
}

export function mapGenericEntities(
  doc: { id: string; sessionId: string },
  tipoDocumento: import('@aletis/shared-types').DocumentType,
  entities: ExtractedEntity[],
  confianca: number,
): MappedResult {
  const clienteData = entitiesToClienteData(entities);
  const dividas = entitiesToDividas(entities);
  const propriedades = entitiesToPropriedades(entities);

  const result: DocumentExtractionResult = {
    documentoId: doc.id,
    sessionId: doc.sessionId,
    tipoDocumento,
    confianca,
    entidades: entities,
    clienteData,
    dividas,
    propriedades,
    contrato: buildContratoFromEntities(entities),
    riscos: [],
    lacunas: [],
    acoesSugeridas: confianca > 0.6 ? ['Criar/atualizar cliente com dados extraídos'] : ['Revisar documento manualmente antes de criar cliente'],
    evidencias: entities
      .filter((e) => e.cpfCnpj || e.valor || e.nome)
      .map((e) => ({
        field: e.categoria,
        value: e.cpfCnpj || e.valor || e.nome,
        fonte: e.fonte,
        trecho: e.fonte,
        page: e.page,
        confianca: e.confianca,
      })),
  };

  if (!clienteData.nome) result.lacunas.push('Nome não identificado');
  if (dividas.length === 0) result.lacunas.push('Dívidas não identificadas');

  return { result, confianca };
}

// ── Helper privado ──

function parseEnderecoCompleto(raw?: string): ClienteExtractionData['endereco'] {
  if (!raw) return undefined;
  const s = cleanText(raw);
  // Tenta detectar padrão: Rua X, 123, Bairro, Cidade - UF, CEP
  const match = s.match(/^(.+?),\s*(\d+)(?:\s*[-–]\s*(.+?))?[,;]\s*(.+?)[,;]\s*([A-Z]{2})\s*[,\-]?\s*(\d{2}\-?\d{3})?$/i);
  if (match) {
    return {
      logradouro: cleanText(match[1]),
      numero: cleanText(match[2]),
      complemento: cleanText(match[3]),
      bairro: cleanText(match[4]),
      cidade: cleanText(match[4]),
      uf: toUf(match[5]),
      cep: cleanText(match[6])?.replace(/\D/g, ''),
    };
  }
  // Fallback simples
  return { logradouro: s };
}
