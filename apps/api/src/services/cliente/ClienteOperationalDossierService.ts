import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../db/client.js'
import { portalUpload, type PortalUploadRow } from '../../db/schema.js'
import { clientes } from '../../routes/clientes.js'
import { propostas, propostasInteligentes } from '../../routes/propostas.js'
import { getClientCoreService } from '../core/ClientCoreService.js'
import { getFarmsService } from '../farms/FarmsService.js'
import { getGestaoFinanceiraService } from '../gestao-financeira/GestaoFinanceiraService.js'
import { buildClienteDocumentoDossie, classificarDocumentoCliente, type DocumentoDossie } from '../documentos/ClienteDocumentoIntelligence.js'
import { getClienteDemandaService, type ClienteDemandaRecord, type DemandProposalLike } from './ClienteDemandaService.js'

type Prioridade = 'critica' | 'alta' | 'media' | 'baixa'

export interface ClienteOperationalPendencia {
  id: string
  area: 'cadastro' | 'documentos' | 'financeiro' | 'negociacao' | 'agenda' | 'processo' | 'ia'
  prioridade: Prioridade
  titulo: string
  detalhe: string
  acaoSugerida: string
}

export interface ClienteOperationalDossier {
  clienteId: string
  atualizadoEm: string
  cliente: {
    id: string
    nome: string
    estagio?: string
    consultor?: string
    credor?: string
    cidade?: string
    uf?: string
    valorTotalDivida: number
    grupoFamiliarTotal: number
    proximaAcao?: unknown
  }
  qualidade: {
    score: number
    nivel: 'excelente' | 'boa' | 'atencao' | 'critica'
    resumo: string
  }
  documentos: {
    total: number
    porGrupo: Record<string, number>
    dossie: DocumentoDossie
    faltantes: string[]
    revisao: DocumentoDossie['documentosRevisao']
    principais: Array<{
      id: string
      nome: string
      grupoDocumento: string
      categoriaInteligente: string
      prioridade: string
      resumoIa?: string
      enviadoEm?: string
    }>
  }
  propostas: {
    total: number
    abertas: number
    valorTotal: number
    itens: Array<{ id: string; titulo: string; status?: string; credor?: string; valor?: number }>
  }
  demandas: {
    total: number
    ativas: number
    urgentes: number
    atrasadas: number
    semResponsavel: number
    checklistPendentes: number
    itens: Array<{
      id: string
      codigo: string
      titulo: string
      assunto: string
      categoria: string
      status: string
      prioridade: string
      responsavel?: string
      credor?: string
      valorPretendido?: string
      prazoAlvo?: string
      proximaAcao?: string
      proximaAcaoEm?: string
      probabilidade: number
      resultadoEsperado?: string
      propostaPrincipalId?: string
      checklistPendentes: number
      ultimaAtividade?: { titulo: string; tipo: string; criadoEm: string }
      totalPropostas: number
    }>
  }
  core: {
    tarefasPendentes: number
    tarefasAtrasadas: number
    reunioesFuturas: number
    contratosAtivos: number
    eventosTimeline: number
  }
  modulos: {
    farms: number
    gestaoFinanceira: number
  }
  pendencias: ClienteOperationalPendencia[]
  proximasAcoes: Array<{ titulo: string; detalhe: string; area: ClienteOperationalPendencia['area']; prioridade: Prioridade }>
  instrucoesAlix: string[]
}

function numberOf(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function textOf(value: unknown, fallback = ''): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function dateIso(value: unknown): string | undefined {
  if (!value) return undefined
  const d = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString()
}

function groupCounts(dossie: DocumentoDossie): Record<string, number> {
  const out: Record<string, number> = {}
  for (const group of dossie.grupos) out[group.grupo] = group.total
  return out
}

function getProposalClientId(p: any): string | undefined {
  return textOf(p?.clienteId || p?.cliente?.id || p?.dadosCliente?.id || p?.clientId) || undefined
}

function getProposalValue(p: any): number {
  return numberOf(
    p?.valorProposta ??
      p?.valorProposto ??
      p?.metricasChave?.valorPropostaEstruturada ??
      p?.metricas?.valorProposta ??
      p?.secoes?.financeiro?.valorProposta,
  )
}

function getProposalTitle(p: any): string {
  return textOf(
    p?.titulo ||
      p?.secoes?.capa?.titulo ||
      p?.nome ||
      p?.tipo ||
      'Proposta sem título',
  )
}

function buildMissingDocumentGroups(params: {
  cliente: any
  porGrupo: Record<string, number>
  propostasTotal: number
}): string[] {
  const faltantes: string[] = []
  const atividade = `${params.cliente?.atividade ?? ''} ${(params.cliente?.culturas ?? []).join(' ')}`.toLowerCase()
  const isAgro = /agro|rural|soja|milho|algod[aã]o|pecu[aá]ria|fazenda|produtor/.test(atividade)
  if (!params.porGrupo.cadastro) faltantes.push('Cadastro')
  if (!params.porGrupo.financeiro && !Array.isArray(params.cliente?.dividas)) faltantes.push('Financeiro')
  if (!params.porGrupo.financeiro && Array.isArray(params.cliente?.dividas) && params.cliente.dividas.length === 0 && params.propostasTotal === 0) {
    faltantes.push('Financeiro')
  }
  if (isAgro && !params.porGrupo.patrimonio) faltantes.push('Patrimônio rural')
  const text = `${params.cliente?.estagio ?? ''} ${(params.cliente?.tags ?? []).join(' ')} ${(params.cliente?.observacoes ?? '')}`.toLowerCase()
  if (/judicial|execu[cç][aã]o|leil[aã]o|processo/.test(text) && !params.porGrupo.juridico) faltantes.push('Jurídico')
  return Array.from(new Set(faltantes))
}

function priorityWeight(priority: Prioridade): number {
  if (priority === 'critica') return 22
  if (priority === 'alta') return 14
  if (priority === 'media') return 8
  return 4
}

function qualityLevel(score: number): ClienteOperationalDossier['qualidade']['nivel'] {
  if (score >= 86) return 'excelente'
  if (score >= 70) return 'boa'
  if (score >= 50) return 'atencao'
  return 'critica'
}

function qualitySummary(score: number, pendencias: ClienteOperationalPendencia[]): string {
  if (pendencias.length === 0) return 'Cliente com base operacional consistente para análise e atendimento.'
  const top = pendencias.slice(0, 2).map((p) => p.titulo.toLowerCase()).join(' e ')
  if (score < 50) return `Cliente precisa de organização antes de avançar: ${top}.`
  if (score < 70) return `Cliente utilizável, mas com pontos de atenção: ${top}.`
  return `Cliente em boa condição, com ajustes pontuais: ${top}.`
}

function addPendencia(list: ClienteOperationalPendencia[], item: ClienteOperationalPendencia): void {
  if (!list.some((p) => p.id === item.id)) list.push(item)
}

export async function buildClienteOperationalDossier(clienteId: string): Promise<ClienteOperationalDossier | null> {
  const cliente = clientes.get(clienteId) as any
  if (!cliente) return null

  let rows: PortalUploadRow[] = []
  try {
    rows = await getDb()
      .select()
      .from(portalUpload)
      .where(eq(portalUpload.clienteId, clienteId))
      .orderBy(desc(portalUpload.enviadoEm))
      .limit(500) as PortalUploadRow[]
  } catch {
    rows = []
  }

  const dossie = buildClienteDocumentoDossie(rows)
  const porGrupo = groupCounts(dossie)
  const propostaRows = [
    ...Array.from((propostas as any).values()).filter((p: any) => getProposalClientId(p) === clienteId),
    ...Array.from((propostasInteligentes as any).values()).filter((p: any) => getProposalClientId(p) === clienteId),
  ]
  const propostaItens = propostaRows.slice(0, 20).map((p: any) => ({
    id: textOf(p?.id, 'sem-id'),
    titulo: getProposalTitle(p),
    status: textOf(p?.status || p?.situacao) || undefined,
    credor: textOf(p?.credor || p?.banco || p?.instituicao) || undefined,
    valor: getProposalValue(p) || undefined,
  }))
  const propostasTotal = propostaRows.length
  let demandaRows: ClienteDemandaRecord[] = []
  try {
    const propostasPadrao = Array.from((propostas as any).values()).filter((p: any) => getProposalClientId(p) === clienteId)
    demandaRows = await getClienteDemandaService().organizeProposals(clienteId, propostasPadrao as DemandProposalLike[])
  } catch {
    demandaRows = []
  }
  const faltantes = buildMissingDocumentGroups({ cliente, porGrupo, propostasTotal })

  let core: Awaited<ReturnType<ReturnType<typeof getClientCoreService>['getSummary']>> | null = null
  try {
    core = await getClientCoreService().getSummary(clienteId, Array.isArray(cliente.timeline) ? cliente.timeline : [])
  } catch {
    core = null
  }

  let farmsTotal = 0
  let gestaoFinanceiraTotal = 0
  try { farmsTotal = getFarmsService().listarPorCliente(clienteId).length } catch { farmsTotal = 0 }
  try { gestaoFinanceiraTotal = (await getGestaoFinanceiraService().listarGruposPorCliente(clienteId)).length } catch { gestaoFinanceiraTotal = 0 }

  const pendencias: ClienteOperationalPendencia[] = []
  if (!cliente.proximaAcao) {
    addPendencia(pendencias, {
      id: 'sem-proxima-acao',
      area: 'agenda',
      prioridade: 'alta',
      titulo: 'Próxima ação indefinida',
      detalhe: 'O cliente não possui data e responsável para continuidade do atendimento.',
      acaoSugerida: 'Registrar próxima ação com prazo e responsável no CRM.',
    })
  }
  for (const grupo of faltantes) {
    addPendencia(pendencias, {
      id: `doc-faltante-${grupo.toLowerCase().replace(/\s+/g, '-')}`,
      area: 'documentos',
      prioridade: grupo === 'Financeiro' ? 'alta' : 'media',
      titulo: `Dossiê sem bloco ${grupo}`,
      detalhe: `Não encontrei documentos suficientes no grupo ${grupo}.`,
      acaoSugerida: `Solicitar ou anexar documentos de ${grupo} antes de emitir análise conclusiva.`,
    })
  }
  for (const item of dossie.documentosRevisao.slice(0, 4)) {
    addPendencia(pendencias, {
      id: `doc-revisao-${item.id}`,
      area: 'documentos',
      prioridade: 'media',
      titulo: 'Documento precisa de revisão',
      detalhe: `${item.nome}: ${item.motivo}.`,
      acaoSugerida: 'Abrir o documento, conferir OCR/classificação e atualizar o resumo se necessário.',
    })
  }
  if (cliente.valorTotalDivida > 0 && propostaRows.length === 0 && ['analise', 'negociacao', 'acordo'].includes(String(cliente.estagio || ''))) {
    addPendencia(pendencias, {
      id: 'sem-propostas',
      area: 'negociacao',
      prioridade: 'alta',
      titulo: 'Cliente sem proposta vinculada',
      detalhe: 'Há dívida/atendimento ativo, mas nenhuma proposta cadastrada ou extraída.',
      acaoSugerida: 'Criar proposta manual ou importar documento de proposta na aba Negociação.',
    })
  }
  const hoje = new Date().toISOString().slice(0, 10)
  const demandasAtivas = demandaRows.filter((item) => !['concluida', 'cancelada'].includes(item.status))
  for (const demanda of demandasAtivas.filter((item) =>
    (item.prazoAlvo && item.prazoAlvo < hoje) || (item.proximaAcaoEm && item.proximaAcaoEm < hoje),
  ).slice(0, 4)) {
    addPendencia(pendencias, {
      id: `demanda-atrasada-${demanda.id}`,
      area: 'negociacao',
      prioridade: demanda.prioridade === 'urgente' ? 'critica' : 'alta',
      titulo: `Prazo vencido: ${demanda.titulo}`,
      detalhe: `A demanda possui prazo ou próxima ação vencida e permanece no status ${demanda.status}.`,
      acaoSugerida: 'Revisar a demanda, atualizar o prazo e registrar a próxima ação da negociação.',
    })
  }
  for (const demanda of demandasAtivas.filter((item) => !item.responsavel || !item.proximaAcao || !item.proximaAcaoEm).slice(0, 4)) {
    const lacunas = [!demanda.responsavel ? 'responsável' : '', !demanda.proximaAcao ? 'próxima ação' : '', !demanda.proximaAcaoEm ? 'data da ação' : ''].filter(Boolean)
    addPendencia(pendencias, {
      id: `demanda-sem-controle-${demanda.id}`,
      area: 'agenda',
      prioridade: demanda.prioridade === 'urgente' ? 'alta' : 'media',
      titulo: `Demanda sem controle: ${demanda.titulo}`,
      detalhe: `Faltam ${lacunas.join(', ')} para condução rastreável desta demanda.`,
      acaoSugerida: 'Definir responsável, próxima ação e data na demanda.',
    })
  }
  if (!Array.isArray(cliente.grupoFamiliar) || cliente.grupoFamiliar.length === 0) {
    addPendencia(pendencias, {
      id: 'sem-grupo-familiar',
      area: 'cadastro',
      prioridade: 'baixa',
      titulo: 'Grupo familiar ou societário não mapeado',
      detalhe: 'Não há pessoas vinculadas ao cliente principal.',
      acaoSugerida: 'Registrar cônjuge, sócios, avalistas, filhos, arrendadores ou pessoas relevantes.',
    })
  }
  if (core?.metrics.tarefasAtrasadas) {
    addPendencia(pendencias, {
      id: 'tarefas-atrasadas',
      area: 'processo',
      prioridade: core.metrics.tarefasAtrasadas >= 3 ? 'critica' : 'alta',
      titulo: 'Tarefas atrasadas no cliente',
      detalhe: `${core.metrics.tarefasAtrasadas} tarefa(s) vencida(s) no CRM Core.`,
      acaoSugerida: 'Regularizar tarefas atrasadas antes de abrir novas frentes com o cliente.',
    })
  }
  if (gestaoFinanceiraTotal === 0 && ['analise', 'negociacao'].includes(String(cliente.estagio || ''))) {
    addPendencia(pendencias, {
      id: 'sem-gestao-financeira',
      area: 'financeiro',
      prioridade: 'media',
      titulo: 'Gestão financeira ainda não estruturada',
      detalhe: 'Não encontrei grupo de Gestão Financeira vinculado a este cliente.',
      acaoSugerida: 'Criar ou importar a Gestão Financeira para consolidar produção, custos, dívidas e garantias.',
    })
  }

  pendencias.sort((a, b) => priorityWeight(b.prioridade) - priorityWeight(a.prioridade))
  const penalty = Math.min(82, pendencias.reduce((sum, p) => sum + priorityWeight(p.prioridade), 0))
  const bonus = Math.min(12, (rows.length >= 10 ? 4 : 0) + (propostaRows.length ? 4 : 0) + (gestaoFinanceiraTotal ? 4 : 0))
  const score = Math.max(0, Math.min(100, 100 - penalty + bonus))

  const principais = rows
    .map((row) => {
      const cls = classificarDocumentoCliente(row)
      const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, any> : {}
      return {
        id: row.id,
        nome: row.nomeOriginal,
        grupoDocumento: String(meta.grupoDocumento || cls.grupoDocumento),
        categoriaInteligente: String(meta.categoriaInteligente || cls.categoriaInteligente),
        prioridade: String(meta.prioridadeDocumento || cls.prioridade),
        resumoIa: typeof meta.resumoIa === 'string' ? meta.resumoIa : undefined,
        enviadoEm: dateIso(row.enviadoEm),
      }
    })
    .sort((a, b) => (a.prioridade === 'alta' ? -1 : b.prioridade === 'alta' ? 1 : 0))
    .slice(0, 10)

  const proximasAcoes = pendencias.slice(0, 5).map((p) => ({
    titulo: p.acaoSugerida,
    detalhe: p.detalhe,
    area: p.area,
    prioridade: p.prioridade,
  }))
  if (proximasAcoes.length === 0) {
    proximasAcoes.push({
      titulo: 'Preparar resumo executivo para o próximo contato',
      detalhe: 'Dossiê sem pendência crítica automática no momento.',
      area: 'ia',
      prioridade: 'baixa',
    })
  }

  return {
    clienteId,
    atualizadoEm: new Date().toISOString(),
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      estagio: cliente.estagio,
      consultor: cliente.consultor,
      credor: cliente.credor,
      cidade: cliente.cidade,
      uf: cliente.uf,
      valorTotalDivida: numberOf(cliente.valorTotalDivida),
      grupoFamiliarTotal: Array.isArray(cliente.grupoFamiliar) ? cliente.grupoFamiliar.length : 0,
      proximaAcao: cliente.proximaAcao,
    },
    qualidade: {
      score,
      nivel: qualityLevel(score),
      resumo: qualitySummary(score, pendencias),
    },
    documentos: {
      total: rows.length,
      porGrupo,
      dossie,
      faltantes,
      revisao: dossie.documentosRevisao,
      principais,
    },
    propostas: {
      total: propostaRows.length,
      abertas: propostaRows.filter((p: any) => !/aceita|rejeitada|expirada|cancelada/i.test(String(p?.status || ''))).length,
      valorTotal: propostaRows.reduce((sum: number, p: any) => sum + getProposalValue(p), 0),
      itens: propostaItens,
    },
    demandas: {
      total: demandaRows.length,
      ativas: demandasAtivas.length,
      urgentes: demandaRows.filter((item) => item.prioridade === 'urgente' && !['concluida', 'cancelada'].includes(item.status)).length,
      atrasadas: demandasAtivas.filter((item) =>
        Boolean((item.prazoAlvo && item.prazoAlvo < hoje) || (item.proximaAcaoEm && item.proximaAcaoEm < hoje)),
      ).length,
      semResponsavel: demandasAtivas.filter((item) => !item.responsavel).length,
      checklistPendentes: demandaRows.reduce((total, item) => total + item.checklist.filter((check) => !check.concluido).length, 0),
      itens: demandaRows.slice(0, 40).map((item) => ({
        id: item.id,
        codigo: `DEM-${String(item.numero).padStart(3, '0')}`,
        titulo: item.titulo,
        assunto: item.assunto,
        categoria: item.categoria,
        status: item.status,
        prioridade: item.prioridade,
        responsavel: item.responsavel,
        credor: item.credor,
        valorPretendido: item.valorPretendido,
        prazoAlvo: item.prazoAlvo,
        proximaAcao: item.proximaAcao,
        proximaAcaoEm: item.proximaAcaoEm,
        probabilidade: item.probabilidade,
        resultadoEsperado: item.resultadoEsperado,
        propostaPrincipalId: item.propostaPrincipalId,
        checklistPendentes: item.checklist.filter((check) => !check.concluido).length,
        ultimaAtividade: [...item.eventos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0],
        totalPropostas: item.propostaIds.length,
      })),
    },
    core: {
      tarefasPendentes: core?.metrics.tarefasPendentes ?? 0,
      tarefasAtrasadas: core?.metrics.tarefasAtrasadas ?? 0,
      reunioesFuturas: core?.metrics.reunioesFuturas ?? 0,
      contratosAtivos: core?.metrics.contratosAtivos ?? 0,
      eventosTimeline: core?.metrics.eventosTimeline ?? (Array.isArray(cliente.timeline) ? cliente.timeline.length : 0),
    },
    modulos: {
      farms: farmsTotal,
      gestaoFinanceira: gestaoFinanceiraTotal,
    },
    pendencias,
    proximasAcoes,
    instrucoesAlix: [
      'Responder somente com base no CRM, demandas, documentos, propostas e dossiê operacional recebidos.',
      'Organizar qualquer análise do cliente por demanda e tratar as propostas vinculadas como versões do mesmo assunto.',
      'Diferenciar fatos confirmados, inferências e sugestões práticas.',
      'Quando faltar documento, campo ou evidência, tratar como pendência operacional.',
      'Não prometer resultado jurídico, bancário ou financeiro.',
      'Sugerir sempre uma próxima ação curta, executável e rastreável no CRM.',
    ],
  }
}
