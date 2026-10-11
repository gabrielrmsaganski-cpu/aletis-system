import type { DossieAgro } from '@aletis/shared-types'
import { clientes } from '../../routes/clientes.js'
import { getDossieRepository } from '../cliente/DossieRepository.js'
import { getFarmsService } from '../farms/FarmsService.js'
import { getGestaoFinanceiraService } from '../gestao-financeira/GestaoFinanceiraService.js'
import { getGestaoFinanceiraServiceV2 } from '../gestao-financeira/GestaoFinanceiraServiceV2.js'
import { parseDossieNumericValue as numberValue } from './DossieNumericValue.js'
import type {
  ClienteDossieInput,
  CompradorDossieInput,
  DadosCanonicosDossieInput,
  GerarPacoteDossieInput,
  PeriodoSafra,
} from './types.js'

export interface FonteConsolidacaoDossie {
  fonte: 'crm' | 'dossie_agro' | 'gestao_financeira' | 'farms' | 'manual'
  registros: number
  detalhe: string
}

export interface ConsolidacaoDossieResult {
  cliente: ClienteDossieInput
  dados: DadosCanonicosDossieInput
  fontes: FonteConsolidacaoDossie[]
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

function cleanCulture(value: unknown): string | undefined {
  const normalized = text(value)
  if (!normalized) return undefined
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function addressFromCrm(cliente: any): string | undefined {
  if (typeof cliente?.endereco === 'string') return text(cliente.endereco)
  return text(cliente?.endereco?.formatado)
    || text([
      cliente?.endereco?.logradouro,
      cliente?.endereco?.numero,
      cliente?.endereco?.bairro,
      cliente?.endereco?.cidade,
      cliente?.endereco?.uf,
    ].filter(Boolean).join(', '))
}

function rowKey(row: object, fields: string[]): string {
  const values = row as Record<string, unknown>
  return fields
    .map((field) => text(values[field])?.toLowerCase() || '')
    .join('|')
}

function mergeRows<T extends object>(
  base: T[] | undefined,
  override: T[] | undefined,
  keyFields: string[],
): T[] {
  const merged = new Map<string, T>()
  for (const row of [...(base ?? []), ...(override ?? [])]) {
    const key = rowKey(row, keyFields) || JSON.stringify(row)
    merged.set(key, { ...(merged.get(key) ?? {}), ...row })
  }
  return [...merged.values()]
}

function mergeCanonical(base: DadosCanonicosDossieInput, override?: DadosCanonicosDossieInput): DadosCanonicosDossieInput {
  if (!override) return base
  return {
    ...base,
    ...override,
    operacao: { ...(base.operacao ?? {}), ...(override.operacao ?? {}) },
    atividades: mergeRows(base.atividades, override.atividades, ['tipo']),
    administradores: mergeRows(base.administradores, override.administradores, ['nome']),
    grupoEconomico: mergeRows(base.grupoEconomico, override.grupoEconomico, ['cpfCnpj', 'nome']),
    empresas: mergeRows(base.empresas, override.empresas, ['cnpj', 'razaoSocial']),
    propriedades: mergeRows(base.propriedades, override.propriedades, ['matricula', 'fazenda']),
    arrendamentos: mergeRows(base.arrendamentos, override.arrendamentos, ['matricula', 'fazenda']),
    maquinas: mergeRows(base.maquinas, override.maquinas, ['descricao', 'tipo']),
    ativosOutros: mergeRows(base.ativosOutros, override.ativosOutros, ['descricao', 'tipo']),
    compradores: mergeRows(base.compradores, override.compradores, ['nome', 'cultura', 'safra']),
    dividas: mergeRows(base.dividas, override.dividas, ['instituicao', 'contrato', 'tomador']),
    dividasTerras: mergeRows(base.dividasTerras, override.dividasTerras, ['descricao']),
    fornecedores: mergeRows(base.fornecedores, override.fornecedores, ['nome', 'vencimento']),
    producoes: mergeRows(base.producoes, override.producoes, ['cultura', 'safra', 'periodo', 'regiao']),
    pecuaria: mergeRows(base.pecuaria, override.pecuaria, ['tipoAnimal', 'periodo', 'regiao']),
    investimentos: mergeRows(base.investimentos, override.investimentos, ['descricao', 'dataPrevista']),
  }
}

function fromDossieAgro(dossie: DossieAgro): DadosCanonicosDossieInput {
  const producoes = dossie.producao.agricultura.flatMap((quadro) =>
    quadro.safras.map((safra) => ({
      cultura: cleanCulture(quadro.outroDescricao || quadro.cultura),
      periodo: (safra.tipo === 'prevista' ? 'planejada' : safra.tipo) as PeriodoSafra,
      safra: safra.safra,
      regiao: quadro.uf,
      areaPropriaHa: safra.areaPropriaHa,
      areaArrendadaHa: safra.areaArrendadaHa,
      produtividade: safra.rendimentoScHa,
      precoUnitario: safra.precoMedio,
      custoHa: safra.custoMedioPorHa,
      observacoes: quadro.observacoes,
    })),
  )
  const compradores: CompradorDossieInput[] = dossie.comerciais.relacoes.map((relacao) => ({
    nome: relacao.razaoSocial,
    cultura: relacao.produtos,
    volume: relacao.volumeMedio,
  }))
  for (const comercial of dossie.operacional.comercializacao) {
    for (const safra of [comercial.safraAtual, comercial.safraPrevista].filter(Boolean)) {
      compradores.push({
        nome: safra?.compradores,
        cultura: cleanCulture(comercial.outroDescricao || comercial.cultura),
        safra: safra?.safra,
        volume: safra?.volumeVendidoSacas,
        precoUnitario: safra?.precoMedio,
        estoque: safra?.estoqueSacas,
        percentualVendidoPlantio: safra?.pctVendidoPlantio,
        precoRegime: safra?.precoRegime,
        percentualSpot: safra?.pctSpot,
        entrega: safra?.entrega,
        hedgeCambial: safra?.hedgeCambial,
      })
    }
  }

  return {
    dataBase: dossie.dataBase,
    historico: dossie.operacional.historia,
    infraestrutura: [
      dossie.operacional.terceirizacaoMaquinario?.descricao,
      dossie.operacional.terceirizacaoArmazenagem?.descricao,
      dossie.imoveis.armazenagens.map((item) => `${item.local}: ${item.capacidadeSacas} sacas`).join('; '),
    ].filter(Boolean).join(' | ') || undefined,
    operacao: {
      limiteSolicitado: dossie.grupoEconomico.demandaTotal,
      comentarios: dossie.observacoes || dossie.grupoEconomico.observacoes,
    },
    administradores: dossie.operacional.administradores.map((item) => ({
      nome: item.nome,
      responsabilidade: item.responsabilidade,
      experiencia: item.grauInstrucaoOuExperiencia,
    })),
    grupoEconomico: dossie.grupoEconomico.pessoasFisicas.map((item) => ({
      nome: item.nome,
      cpfCnpj: item.cpf,
      idade: item.idade,
      restricoes: item.restricoes,
      bacenTotal: item.bacenTotal,
      curtoPrazo: item.curtoPrazo,
      longoPrazo: item.longoPrazo,
      coobrigacoes: item.coobrigacoes,
      moedaEstrangeira: item.moedaEstrangeira,
      atuaAtividade: true,
    })),
    empresas: dossie.grupoEconomico.pessoasJuridicas.map((item) => ({
      razaoSocial: item.razaoSocial,
      cnpj: item.cnpj,
      atividade: item.atividade,
      restricoes: item.restricoes,
      bacenTotal: item.bacenTotal,
      curtoPrazo: item.curtoPrazo,
      longoPrazo: item.longoPrazo,
      coobrigacoes: item.coobrigacoes,
      moedaEstrangeira: item.moedaEstrangeira,
    })),
    propriedades: dossie.imoveis.propriedades.map((item) => ({
      fazenda: item.fazenda,
      proprietario: item.proprietario,
      matricula: item.matricula,
      municipio: item.municipio,
      uf: item.uf,
      areaTotalHa: item.areasTotaisHa,
      areaPlantioHa: item.areasPlantioHa,
      areaIrrigadaHa: item.areaIrrigadaHa,
      areaPastagemHa: item.areaPastagemHa,
      reservaLegalHa: item.reservaLegalHa,
      avaliacao: item.valorMercado,
      onus: item.onus,
      livreOnus: item.areasLivresOnusHa === undefined
        ? undefined
        : item.areasLivresOnusHa >= item.areasTotaisHa,
    })),
    maquinas: dossie.maquinas.maquinas.map((item) => ({
      tipo: item.tipo,
      descricao: [item.descricao, item.modelo, item.quantidade > 1 ? `${item.quantidade} unidades` : ''].filter(Boolean).join(' - '),
      marca: item.marca,
      ano: item.ano,
      valor: item.valorMercadoUnitario === undefined ? undefined : item.valorMercadoUnitario * item.quantidade,
      onus: item.dividaId ? `Financiada - dívida ${item.dividaId}` : undefined,
    })),
    ativosOutros: [
      { tipo: 'Recebíveis', descricao: 'Recebíveis correntes', valor: dossie.capitalGiro.recebiveis },
      { tipo: 'Estoques', descricao: 'Produtos e insumos em estoque', valor: dossie.capitalGiro.estoques },
      { tipo: 'Disponibilidades', descricao: 'Caixa e bancos', valor: dossie.capitalGiro.disponibilidades },
    ].filter((item) => item.valor !== undefined),
    compradores,
    dividas: dossie.dividas.bancarias.map((item) => ({
      tomador: item.tomador,
      instituicao: item.instituicao,
      contrato: item.numeroContrato,
      tipoCredito: item.modalidade,
      contratacao: item.dataContratacao,
      vencimento: item.dataVencimento,
      finalidade: item.finalidade,
      moeda: item.moeda,
      taxaJuros: item.taxaJuros,
      saldoDevedor: item.saldoTotal,
      amortizacoes: item.amortizacoesPorAno,
    })),
    dividasTerras: dossie.dividas.terras.map((item) => ({
      descricao: item.fazenda,
      areaTotalHa: item.areaHa,
      valorTotal: item.totalVencer ?? item.valorAquisicao,
      formaPagamento: item.amortizacoesPorSafra.map((parcela) => `${parcela.safra}: ${parcela.valor}`).join('; '),
    })),
    fornecedores: dossie.dividas.fornecedores.map((item) => ({
      nome: item.fornecedor,
      valor: item.valorBRL,
      volumeSoja: item.volumeSojaSacas,
      volumeMilho: item.volumeMilhoSacas,
      vencimento: item.dataPagamento,
      observacoes: item.observacoes,
    })),
    producoes,
    pecuaria: dossie.producao.pecuaria.map((item) => ({
      periodo: 'atual' as const,
      tipoAnimal: cleanCulture(item.outroDescricao || item.atividade),
      regiao: item.uf,
      quantidadeTotal: item.cabecas,
      areaHa: item.areaPastagemHa,
      observacoes: item.observacoes,
    })),
  }
}

function crmCanonical(cliente: any): DadosCanonicosDossieInput {
  return {
    dataBase: new Date().toISOString().slice(0, 10),
    atividades: cliente?.atividade ? [{ tipo: cliente.atividade }] : [],
    grupoEconomico: (cliente?.grupoFamiliar ?? []).map((item: any) => ({
      nome: item.nome,
      cpfCnpj: item.cpfCnpj,
      parentesco: item.parentesco || item.vinculoCliente,
      telefone: item.telefone,
      email: item.email,
      atuaAtividade: item.atuaAtividade,
    })),
    dividas: (cliente?.dividas ?? []).map((item: any) => ({
      tomador: cliente.nome,
      documento: cliente.cpfCnpj,
      instituicao: item.credor,
      contrato: item.contrato,
      tipoCredito: item.modalidade || cliente.modalidadeCredito || 'Crédito rural',
      contratacao: item.dataContratacao,
      vencimento: item.vencimento,
      finalidade: item.finalidade,
      moeda: 'BRL',
      taxaJuros: numberValue(item.taxaJuros),
      saldoDevedor: numberValue(item.valorAtualizado ?? item.saldoDevedor ?? item.valorOriginal),
    })),
    propriedades: cliente?.car ? [{
      fazenda: 'Imóvel rural principal - CAR',
      proprietario: cliente.nome,
      car: cliente.car.codImovel,
      municipio: cliente.car.municipio || cliente.cidade,
      uf: cliente.car.uf || cliente.uf,
      areaTotalHa: numberValue(cliente.car.areaImovel),
      areaConsolidadaHa: numberValue(cliente.car.areaAntropizada),
      reservaLegalHa: numberValue(cliente.car.areaReservaLegal),
    }] : [],
  }
}

async function financialCanonical(clienteId: string): Promise<{ dados: DadosCanonicosDossieInput; registros: number }> {
  const service = getGestaoFinanceiraService()
  const serviceV2 = getGestaoFinanceiraServiceV2()
  const groups = await service.listarGruposPorCliente(clienteId)
  const group = groups[0]
  if (!group) return { dados: {}, registros: 0 }
  const [members, cultures, demands, contracts, farms, otherAssets, otherLiabilities] = await Promise.all([
    service.listarMembros(group.id),
    service.listarCulturas(group.id),
    service.listarDemandas(group.id),
    service.listarContratos(group.id),
    service.listarFazendas(group.id),
    serviceV2.listarAtivosOutros(group.id),
    serviceV2.listarPassivosOutros(group.id),
  ])
  const demand = demands[0]
  const supplierLiabilities = otherLiabilities.filter((item) =>
    ['fornecedor', 'fiscal', 'trabalhista', 'outro'].includes(item.tipo),
  )
  return {
    registros: members.length + cultures.length + demands.length + contracts.length + farms.length
      + otherAssets.length + otherLiabilities.length,
    dados: {
      dataBase: group.dataBase,
      historico: group.historico || undefined,
      operacao: demand ? {
        limiteSolicitado: numberValue(demand.valor),
        prazo: demand.prazo || undefined,
        finalidade: demand.finalidade || undefined,
        garantias: demand.garantias || undefined,
        comentarios: demand.parecerTex || undefined,
      } : undefined,
      grupoEconomico: members.map((item) => ({
        nome: item.nome,
        cpfCnpj: item.cpfCnpj || undefined,
        parentesco: item.tipoRelacao || undefined,
        atuaAtividade: item.atuaAtividade,
      })),
      propriedades: farms.map((item) => ({
        fazenda: item.fazenda,
        proprietario: item.proprietario || undefined,
        car: item.nrCar || undefined,
        matricula: item.matricula || undefined,
        municipio: item.cidade || undefined,
        uf: item.estado || undefined,
        areaTotalHa: numberValue(item.areaTotalHa),
        areaConsolidadaHa: numberValue(item.areaConsolidadaHa),
        areaPlantioHa: numberValue(item.areaPlantioHa),
        areaIrrigadaHa: numberValue(item.areaIrrigadaHa),
        areaPastagemHa: numberValue(item.areaPastagemHa),
        reservaLegalHa: numberValue(item.areaReservaHa),
        avaliacao: (numberValue(item.valorHaMercado) ?? 0) * (numberValue(item.areaTotalHa) ?? 0) || undefined,
        capacidadeProdutiva: item.observacoes || undefined,
      })),
      ativosOutros: otherAssets.map((item) => ({
        tipo: item.tipo,
        descricao: item.descricao,
        fonte: [item.produto, item.safra, item.estadoUf].filter(Boolean).join(' - ') || undefined,
        quantidade: numberValue(item.quantidade),
        valor: numberValue(item.valorTotal),
        observacoes: item.observacoes || undefined,
      })),
      dividas: contracts.map((item) => ({
        tomador: item.emitente || group.nomeGrupo,
        instituicao: item.credor,
        contrato: item.contrato || undefined,
        tipoCredito: item.enquadramento || item.metodoCalculo,
        contratacao: item.dataContratacao || undefined,
        vencimento: item.ultimaParcela || undefined,
        finalidade: item.finalidade || undefined,
        moeda: item.variacaoCambial ? 'USD' : 'BRL',
        taxaJuros: numberValue(item.taxaNominalAa),
        saldoDevedor: numberValue(item.valorPresenteAtualizado ?? item.valorPresente ?? item.valorFinanciado),
      })),
      fornecedores: supplierLiabilities.map((item) => ({
        nome: item.credor || item.descricao,
        tipoProduto: item.tipo,
        valor: numberValue(item.valor),
        vencimento: item.vencimento || undefined,
        prazoPagamento: item.formaPagamento || undefined,
        observacoes: item.observacoes || item.finalidade || undefined,
      })),
      producoes: cultures.map((item) => ({
        cultura: item.cultura,
        periodo: (item.cenario === 'realizado' ? 'anterior' : item.cenario === 'planejado' ? 'atual' : 'planejada') as PeriodoSafra,
        safra: item.safra,
        areaPropriaHa: numberValue(item.areaPropriaHa),
        areaArrendadaHa: numberValue(item.areaArrendadaHa),
        produtividade: numberValue(item.rendimentoScHa),
        precoUnitario: numberValue(item.precoMedioRs),
        custoHa: numberValue(item.custoUnitarioInsumosRs),
        custoArrendamento: numberValue(item.arrendamentoBaseScHa),
        observacoes: item.observacoes || undefined,
      })),
    },
  }
}

function farmsCanonical(clienteId: string): { dados: DadosCanonicosDossieInput; registros: number } {
  const plans = getFarmsService().listarPorCliente(clienteId)
  return {
    registros: plans.length,
    dados: {
      producoes: plans.map((plan) => {
        const normal = plan.resultado.cenarios.find((scenario) => scenario.id === 'normal')
        return {
          cultura: plan.cultura,
          periodo: plan.status === 'pronto' ? 'atual' : 'planejada',
          safra: plan.safra,
          areaPropriaHa: plan.areaProdutivaHa,
          produtividade: normal?.produtividadeScHa,
          precoUnitario: plan.precoBaseRsSc,
          custoHa: normal?.custoTotalRsHa ?? plan.resultado.desembolsoPorHa,
          observacoes: plan.observacoes,
        }
      }),
    },
  }
}

export async function consolidarDadosDossie(input: GerarPacoteDossieInput): Promise<ConsolidacaoDossieResult> {
  const clienteId = input.clienteId || input.cliente?.id
  const crm = clienteId ? clientes.get(clienteId) as any : undefined
  const crmCliente: ClienteDossieInput = crm ? {
    id: crm.id,
    nome: crm.nome,
    cpfCnpj: crm.cpfCnpj,
    tipo: crm.tipo,
    cidade: crm.cidade || crm.endereco?.cidade,
    uf: crm.uf || crm.endereco?.uf,
    endereco: addressFromCrm(crm),
    cep: crm.cep,
    email: crm.email,
    telefone: crm.telefone,
    responsavel: crm.consultor,
    atividade: crm.atividade,
    observacoes: crm.observacoes,
  } : {}
  const cliente: ClienteDossieInput = {
    ...crmCliente,
    ...(input.cliente ?? {}),
    id: clienteId || input.cliente?.id,
  }

  let dados: DadosCanonicosDossieInput = crm ? crmCanonical(crm) : {}
  const fontes: FonteConsolidacaoDossie[] = []
  if (crm) {
    fontes.push({
      fonte: 'crm',
      registros: 1 + (crm.grupoFamiliar?.length ?? 0) + (crm.dividas?.length ?? 0),
      detalhe: 'Cadastro, contatos, grupo familiar, CAR e dívidas do CRM.',
    })
  }

  if (clienteId) {
    const dossie = getDossieRepository().get(clienteId)
    if (dossie) {
      dados = mergeCanonical(dados, fromDossieAgro(dossie))
      fontes.push({
        fonte: 'dossie_agro',
        registros: dossie.grupoEconomico.pessoasFisicas.length
          + dossie.grupoEconomico.pessoasJuridicas.length
          + dossie.producao.agricultura.length
          + dossie.imoveis.propriedades.length
          + dossie.dividas.bancarias.length,
        detalhe: `Dossiê Agro canônico v${dossie.versao}.`,
      })
    }
    try {
      const financial = await financialCanonical(clienteId)
      dados = mergeCanonical(dados, financial.dados)
      if (financial.registros) {
        fontes.push({
          fonte: 'gestao_financeira',
          registros: financial.registros,
          detalhe: 'Grupo, produção, demanda, fazendas, ativos e passivos da Gestão Financeira.',
        })
      }
    } catch (error) {
      console.warn('[DossieDataConsolidator] Gestão Financeira indisponível:', error)
    }
    try {
      const farms = farmsCanonical(clienteId)
      dados = mergeCanonical(dados, farms.dados)
      if (farms.registros) {
        fontes.push({
          fonte: 'farms',
          registros: farms.registros,
          detalhe: 'Planos de viabilidade e cenários agrícolas do Farms.',
        })
      }
    } catch (error) {
      console.warn('[DossieDataConsolidator] Farms indisponível:', error)
    }
  }

  dados = mergeCanonical(dados, input.dados)
  if (input.dados || input.cliente) {
    fontes.push({
      fonte: 'manual',
      registros: 1,
      detalhe: 'Ajustes informados na tela de geração; prevalecem sobre as fontes automáticas.',
    })
  }

  return { cliente, dados, fontes }
}
