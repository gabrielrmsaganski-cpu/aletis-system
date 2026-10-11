// ============================================================
// CrmEnrichmentEngine — Decide criar vs atualizar cliente
// Mapeia DocumentExtractionResult → payload pronto para CRMWriter
// ============================================================

import type {
  DocumentExtractionResult,
  CrmEnrichmentPayload,
  ClienteExtractionData,
  DividaExtractionData,
  PropriedadeExtractionData,
} from '@aletis/shared-types';
import { isValidCpfCnpj, normalizeCpfCnpj } from '../../../db/ClienteRepository.js';
import { buildDocumentFinancialReview, normalizeDocumentDebt } from '../crm/DocumentFinancialReview.js';

// Simula acesso ao store de clientes (importado dinamicamente para evitar circular dep)
type ClienteLike = Record<string, unknown>;

export interface EnrichmentOptions {
  /** Força operação create mesmo que exista cliente */
  forceCreate?: boolean;
  /** ID de cliente pré-selecionado (quando o consultor já sabe) */
  targetClienteId?: string;
}

function buildClienteFromExtraction(
  clienteData: ClienteExtractionData,
  dividas: DividaExtractionData[],
  propriedades: PropriedadeExtractionData[],
  documentoId: string,
  evidencias: DocumentExtractionResult['evidencias'],
): CrmEnrichmentPayload['cliente'] {
  const now = new Date().toISOString();
  const hoje = now.slice(0, 10);
  const financialReview = buildDocumentFinancialReview(dividas.map(d => ({ ...d })), evidencias);

  return {
    ...(clienteData.nome ? { nome: clienteData.nome } : {}),
    ...(clienteData.cpfCnpj ? { cpfCnpj: clienteData.cpfCnpj } : {}),
    ...(clienteData.tipoPessoa ? { tipoPessoa: clienteData.tipoPessoa } : {}),
    ...(clienteData.cidade ? { cidade: clienteData.cidade } : {}),
    ...(clienteData.uf ? { uf: clienteData.uf } : {}),
    ...(clienteData.telefone ? { telefone: clienteData.telefone } : {}),
    ...(clienteData.email ? { email: clienteData.email } : {}),
    ...(clienteData.endereco ? {
      endereco: {
        ...(clienteData.endereco.logradouro ? { logradouro: clienteData.endereco.logradouro } : {}),
        ...(clienteData.endereco.numero ? { numero: clienteData.endereco.numero } : {}),
        ...(clienteData.endereco.complemento ? { complemento: clienteData.endereco.complemento } : {}),
        ...(clienteData.endereco.bairro ? { bairro: clienteData.endereco.bairro } : {}),
        ...(clienteData.endereco.cidade ? { cidade: clienteData.endereco.cidade } : {}),
        ...(clienteData.endereco.uf ? { uf: clienteData.endereco.uf } : {}),
        ...(clienteData.endereco.cep ? { cep: clienteData.endereco.cep } : {}),
      },
    } : {}),
    ...(clienteData.atividade ? { atividade: clienteData.atividade } : {}),
    ...(clienteData.areaTotalHa ? { areaTotalHa: clienteData.areaTotalHa } : {}),
    ...(clienteData.culturas?.length ? { culturas: clienteData.culturas } : {}),
    ...(clienteData.carCodigoImovel ? { carCodigoImovel: clienteData.carCodigoImovel } : {}),
    estagio: 'lead',
    credor: dividas[0]?.credor || 'A definir',
    ...(financialReview.saldoAtualTotalComprovado !== undefined
      ? { valorTotalDivida: financialReview.saldoAtualTotalComprovado } : {}),
    origem: 'alix-documento',
    observacoes: `Cadastro gerado automaticamente pela ALIX a partir do documento ${documentoId}. Revisar dados antes de confirmar.`,
    dividas: dividas.map((d) => ({
      contrato: d.contrato || d.numeroContrato || 'Não identificado',
      ...normalizeDocumentDebt({ ...d }),
      ...(d.vencimento ? { vencimento: d.vencimento } : {}),
      ...(d.status ? { status: d.status } : {}),
      credor: d.credor || 'A definir',
      ...(d.taxaContratadaAa ? { taxaContratada: d.taxaContratadaAa } : {}),
      ...(d.garantias?.length ? { garantias: d.garantias } : {}),
      ...(d.modalidade ? { modalidade: d.modalidade } : {}),
    })),
    propriedades: propriedades.map((p) => ({
      ...(p.nome ? { nome: p.nome } : {}),
      ...(p.municipio ? { municipio: p.municipio } : {}),
      ...(p.uf ? { uf: p.uf } : {}),
      ...(p.areaHa != null ? { areaTotal: p.areaHa } : {}),
      ...(p.car ? { car: p.car } : {}),
      ...(p.ccir ? { ccir: p.ccir } : {}),
      ...(p.matricula ? { matricula: p.matricula } : {}),
      ...(p.condicao ? { condicao: p.condicao } : {}),
      culturas: clienteData.culturas || [],
    })),
    timeline: [{
      data: hoje,
      tipo: 'documento',
      descricao: 'Cliente cadastrado pela ALIX via análise de documento',
      detalhes: `Documento: ${documentoId}`,
    }],
  };
}

function buildPatchFromExtraction(
  clienteExistente: ClienteLike,
  extraction: DocumentExtractionResult,
): Partial<CrmEnrichmentPayload['cliente']> {
  const patch: Partial<CrmEnrichmentPayload['cliente']> = {};
  const cd = extraction.clienteData;

  // Só preenche campos vazios ou insuficientes no cliente existente
  if (cd.nome && !clienteExistente.nome) patch.nome = cd.nome;
  if (cd.cpfCnpj && !clienteExistente.cpfCnpj) patch.cpfCnpj = cd.cpfCnpj;
  if (cd.cidade && !clienteExistente.cidade) patch.cidade = cd.cidade;
  if (cd.uf && !clienteExistente.uf) patch.uf = cd.uf;
  if (cd.telefone && !clienteExistente.telefone) patch.telefone = cd.telefone;
  if (cd.email && !clienteExistente.email) patch.email = cd.email;
  if (cd.endereco && !clienteExistente.endereco) patch.endereco = cd.endereco;
  if (cd.atividade && !clienteExistente.atividade) patch.atividade = cd.atividade;
  if (cd.areaTotalHa && !clienteExistente.areaTotalHa) patch.areaTotalHa = cd.areaTotalHa;
  if (cd.culturas?.length && !(clienteExistente.culturas as any[])?.length) patch.culturas = cd.culturas;
  if (cd.carCodigoImovel && !clienteExistente.carCodigoImovel) patch.carCodigoImovel = cd.carCodigoImovel;

  // Dívidas: adiciona novas (evita duplicidade por número de contrato)
  const dividasExistentes = (clienteExistente.dividas as any[]) || [];
  const contratosExistentes = new Set(dividasExistentes.map((d: any) => String(d.contrato || d.numeroContrato || '')));
  const novasDividas = extraction.dividas.filter((d) => !contratosExistentes.has(d.contrato || d.numeroContrato || ''));
  if (novasDividas.length > 0) {
    patch.dividas = [
      ...dividasExistentes,
      ...novasDividas.map((d) => ({
        contrato: d.contrato || d.numeroContrato || 'Não identificado',
        ...normalizeDocumentDebt({ ...d }),
        ...(d.vencimento ? { vencimento: d.vencimento } : {}),
        ...(d.status ? { status: d.status } : {}),
        credor: d.credor || 'A definir',
      })),
    ];
  }

  // Propriedades: adiciona novas (evita duplicidade por CAR/CCIR)
  const propriedadesExistentes = (clienteExistente.propriedades as any[]) || [];
  const carExistentes = new Set(propriedadesExistentes.map((p: any) => String(p.car || '')));
  const novasPropriedades = extraction.propriedades.filter((p) => p.car && !carExistentes.has(p.car));
  if (novasPropriedades.length > 0) {
    patch.propriedades = [
      ...propriedadesExistentes,
      ...novasPropriedades.map((p) => ({
        nome: p.nome || p.municipio || 'Propriedade rural',
        municipio: p.municipio || '',
        uf: p.uf || '',
        ...(p.areaHa != null ? { areaTotal: p.areaHa } : {}),
        car: p.car || '',
        ccir: p.ccir || '',
        matricula: p.matricula || '',
        ...(p.condicao ? { condicao: p.condicao } : {}),
        culturas: cd.culturas || [],
      })),
    ];
  }

  return patch;
}

/**
 * Compara os dados extraídos com o cliente existente e monta payload de enriquecimento.
 */
export async function buildCrmEnrichment(
  extraction: DocumentExtractionResult,
  findClienteByCpfCnpj: (cpfCnpj: string) => ClienteLike | null | undefined | Promise<ClienteLike | null | undefined>,
  opts: EnrichmentOptions = {},
): Promise<CrmEnrichmentPayload | null> {
  const rawCpfCnpj = extraction.clienteData.cpfCnpj;
  if (rawCpfCnpj && !isValidCpfCnpj(rawCpfCnpj)) return null;
  const cpfCnpj = rawCpfCnpj ? normalizeCpfCnpj(rawCpfCnpj) : undefined;
  const documentoId = extraction.documentoId;
  const revisaoFinanceira = buildDocumentFinancialReview(extraction.dividas.map(d => ({ ...d })), extraction.evidencias);
  const dividas = extraction.dividas.map(d => normalizeDocumentDebt({ ...d }));
  const lacunas = [...new Set([...extraction.lacunas, ...revisaoFinanceira.pendencias.map(p => `${p.campo}: ${p.orientacao}`)])];

  // Se não tem CPF/CNPJ e não é extrato/láudo avulso, não dá para criar cliente
  if (!cpfCnpj && extraction.tipoDocumento !== 'extrato_bancario' && extraction.tipoDocumento !== 'laudo_tecnico') {
    return null;
  }

  // Verifica existência
  const existente = opts.targetClienteId
    ? ({ id: opts.targetClienteId } as ClienteLike)
    : cpfCnpj
      ? (await findClienteByCpfCnpj(cpfCnpj) ?? null)
      : null;

  if (existente && !opts.forceCreate) {
    // Atualização
    const patch = buildPatchFromExtraction(existente, extraction);
    const hasChanges = Object.keys(patch).length > 0 || extraction.dividas.length > 0;

    if (!hasChanges) {
      return null;
    }

    return {
      operation: 'update',
      clienteId: String(existente.id || ''),
      cpfCnpj,
      nome: extraction.clienteData.nome,
      cliente: patch as any,
      dividas,
      propriedades: extraction.propriedades,
      documentoId,
      evidencias: extraction.evidencias,
      confiancaDocumento: extraction.confianca,
      lacunas,
      revisaoFinanceira,
      riscos: extraction.riscos,
    };
  }

  // Criação
  const cliente = buildClienteFromExtraction(
    extraction.clienteData,
    extraction.dividas,
    extraction.propriedades,
    documentoId,
    extraction.evidencias,
  );

  return {
    operation: 'create',
    cpfCnpj,
    nome: extraction.clienteData.nome,
    cliente,
    dividas,
    propriedades: extraction.propriedades,
    documentoId,
    evidencias: extraction.evidencias,
    confiancaDocumento: extraction.confianca,
    lacunas,
    revisaoFinanceira,
    riscos: extraction.riscos,
  };
}
