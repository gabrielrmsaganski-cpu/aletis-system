// ============================================================
// crm-context — contexto operacional completo do cliente para ALIX
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { alixGetClientes, alixGetPropostas, alixGetPropostasInteligentes } from '../../AlixService.js'
import { getDb } from '../../../db/client.js'
import { portalUpload } from '../../../db/schema.js'
import { and, desc, eq } from 'drizzle-orm'
import { getFarmsService } from '../../farms/FarmsService.js'
import { getGestaoFinanceiraService } from '../../gestao-financeira/GestaoFinanceiraService.js'
import { buildClienteDocumentoDossie, classificarDocumentoCliente } from '../../documentos/ClienteDocumentoIntelligence.js'
import { buildClienteOperationalDossier } from '../../cliente/ClienteOperationalDossierService.js'
import { getClienteDemandaService } from '../../cliente/ClienteDemandaService.js'
import { preparationCrmClients, scopePreparationCrmRegistry } from './crm-preparation-scope.js'
import { fiscalArchiveService } from '../../fiscal-connection/FiscalArchiveService.js'

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function valorDivida(c: any): number {
  return Number(c?.valorTotalDivida ?? c?.valorDivida ?? c?.dividaTotal ?? c?.resumoFinanceiro?.totalDivida ?? 0)
}

async function documentosCliente(clienteId: string) {
  try {
    const rows = await getDb()
      .select()
      .from(portalUpload)
      .where(eq(portalUpload.clienteId, clienteId))
      .orderBy(desc(portalUpload.enviadoEm))
      .limit(200)
    const itens = rows.map((row: any) => {
      const classificacao = classificarDocumentoCliente(row)
      return ({
      id: row.id,
      nome: row.nomeOriginal,
      categoria: row.categoria,
      categoriaInteligente: row.metadata?.categoriaInteligente ?? classificacao.categoriaInteligente,
      grupoDocumento: row.metadata?.grupoDocumento ?? classificacao.grupoDocumento,
      prioridadeDocumento: row.metadata?.prioridadeDocumento ?? classificacao.prioridade,
      precisaRevisao: row.metadata?.precisaRevisao ?? classificacao.precisaRevisao,
      sinais: row.metadata?.sinais ?? classificacao.sinais,
      mime: row.mime,
      tamanho: row.tamanho,
      enviadoPor: row.enviadoPor,
      enviadoEm: row.enviadoEm,
      resumoIa: row.metadata?.resumoIa,
      observacaoConsultor: row.metadata?.observacaoConsultor,
      alixDocumentId: row.metadata?.alixDocumentId,
      downloadUrl: `/api/clientes/${row.clienteId}/documentos/${row.id}/download`,
      })
    })
    return { itens, dossie: buildClienteDocumentoDossie(rows as any) }
  } catch (err) {
    return { itens: [{ error: `Falha lendo documentos: ${(err as Error).message}` }], dossie: null }
  }
}

function findCliente(input: any) {
  const clientes = preparationCrmClients(alixGetClientes())
  const id = input.clienteId ? String(input.clienteId) : input.id ? String(input.id) : null
  const cpf = input.cpfCnpj ? onlyDigits(input.cpfCnpj) : null
  const nome = input.nome ? String(input.nome).toUpperCase() : null
  return clientes.find((c: any) => {
    if (id && c.id === id) return true
    if (cpf && onlyDigits(c.cpfCnpj ?? c.cpfcnpj ?? c.cpf ?? c.cnpj) === cpf) return true
    if (nome && String(c.nome ?? '').toUpperCase().includes(nome)) return true
    return false
  })
}

export function buildCrmContextTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'contexto_cliente_operacional',
    description:
      'Monta contexto completo do cliente para a ALIX: cadastro CRM, dívidas, propostas, documentos carregados, planos FARMS e grupos de Gestão Financeira. Use antes de recomendar diagnóstico, simulador, FARMS ou preenchimento de CRM.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        id: { type: 'string' },
        nome: { type: 'string' },
        cpfCnpj: { type: 'string' },
      },
    },
  })
  registry['contexto_cliente_operacional'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const cliente = findCliente(input)
      if (!cliente) return { ok: false, error: 'Cliente nao encontrado no CRM' }
      const clienteId = String(cliente.id)
      const docs = await documentosCliente(clienteId)
      const dossieOperacional = await buildClienteOperationalDossier(clienteId)
      const farms = getFarmsService().listarPorCliente(clienteId)
      const gf = await getGestaoFinanceiraService().listarGruposPorCliente(clienteId)
      const propostas = alixGetPropostas().filter((p: any) => p.clienteId === clienteId)
      const propostasInteligentes = alixGetPropostasInteligentes().filter((p: any) => p.clienteId === clienteId)
      const demandas = await getClienteDemandaService().list(clienteId)
      const fiscal=await fiscalArchiveService.search(clienteId,{limite:10}).then(result=>({
        status:'disponivel',fonte:'XML e resumos recebidos do Ambiente Nacional NF-e',resumo:result.resumo,documentos:result.documentos,
        abrirNoCrm:`/clientes/${encodeURIComponent(clienteId)}?area=fiscal`,
        interpretacao:'Valores documentais por chave única. Cancelamentos excluídos dos valores. Não representam pagamentos, faturamento contábil, dívida ou certidão de regularidade. Nunca tratar resumo como XML completo.',
      })).catch(()=>({status:'indisponivel',interpretacao:'Acervo fiscal não consultado nesta execução; não inferir ausência de notas ou pendências.'}))
      return {
        ok: true,
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          cpfCnpj: cliente.cpfCnpj || cliente.cpfcnpj,
          cidade: cliente.cidade,
          uf: cliente.uf,
          estagio: cliente.estagio,
          consultor: cliente.consultor,
          credor: cliente.credor,
          valorDivida: valorDivida(cliente),
          culturas: cliente.culturas,
          areaTotalHa: cliente.areaTotalHa,
          saudeFinanceira: cliente.saudeFinanceira,
          observacoes: cliente.observacoes,
          dividas: Array.isArray(cliente.dividas) ? cliente.dividas.slice(0, 30) : [],
          grupoFamiliar: Array.isArray(cliente.grupoFamiliar) ? cliente.grupoFamiliar.slice(0, 40) : [],
          proximaAcao: cliente.proximaAcao ?? null,
        },
        documentos: { total: docs.itens.length, itens: docs.itens, dossie: docs.dossie },
        fiscal,
        demandas: {
          total: demandas.length,
          itens: demandas.map((demanda) => ({
            id: demanda.id,
            codigo: `DEM-${String(demanda.numero).padStart(3, '0')}`,
            titulo: demanda.titulo,
            assunto: demanda.assunto,
            categoria: demanda.categoria,
            status: demanda.status,
            prioridade: demanda.prioridade,
            responsavel: demanda.responsavel,
            credor: demanda.credor,
            valorPretendido: demanda.valorPretendido,
            prazoAlvo: demanda.prazoAlvo,
            proximaAcao: demanda.proximaAcao,
            proximaAcaoEm: demanda.proximaAcaoEm,
            probabilidade: demanda.probabilidade,
            resultadoEsperado: demanda.resultadoEsperado,
            propostaPrincipalId: demanda.propostaPrincipalId,
            checklist: demanda.checklist,
            atividadesRecentes: [...demanda.eventos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 10),
            propostaIds: demanda.propostaIds,
          })),
        },
        dossieOperacional,
        farms: {
          total: farms.length,
          planos: farms.map((p: any) => ({
            id: p.id,
            nome: p.nome,
            cultura: p.cultura,
            safra: p.safra,
            desembolsoTotal: p.resultado.desembolsoTotal,
            margemNormalPct: p.resultado.cenarios.find((c: any) => c.id === 'normal')?.margemPct,
            pdfUrl: `/api/farms/${p.id}/pdf`,
          })),
        },
        gestaoFinanceira: {
          total: gf.length,
          grupos: gf.map((g: any) => ({ id: g.id, nome: g.nomeGrupo, dataBase: g.dataBase, atualizadoEm: g.atualizadoEm })),
        },
        propostas: {
          total: propostas.length + propostasInteligentes.length,
          padrao: propostas.slice(0, 20),
          inteligentes: propostasInteligentes.slice(0, 20),
        },
        sugestoesAlix: [
          'Se faltam documentos essenciais, pedir upload no CRM ou anexar via chat.',
          'Se nao existe Gestao Financeira, oferecer autoimport_grupo_gf.',
          'Se existe cultura/area/preco, oferecer criar_plano_farms_cliente.',
          'Se ha proposta de banco ou contrato, oferecer simular_operacao_v16.',
        ],
      }
    },
  }

  tools.push({
    name: 'listar_documentos_cliente_crm',
    description:
      'Lista documentos carregados diretamente dentro do CRM do cliente, com resumo da IA, categoria, observação do consultor e URL de download.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        categoria: { type: 'string' },
      },
      required: ['clienteId'],
    },
  })
  registry['listar_documentos_cliente_crm'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      try {
        let query = getDb()
          .select()
          .from(portalUpload)
          .where(eq(portalUpload.clienteId, String(input.clienteId)))
          .orderBy(desc(portalUpload.enviadoEm))
          .limit(200)
        if (input.categoria) {
          query = getDb()
            .select()
            .from(portalUpload)
            .where(and(eq(portalUpload.clienteId, String(input.clienteId)), eq(portalUpload.categoria, String(input.categoria))))
            .orderBy(desc(portalUpload.enviadoEm))
            .limit(200) as any
        }
        const rows = await query
        const docs = await documentosCliente(String(input.clienteId))
        return { ok: true, total: rows.length, documentos: docs.itens, dossie: docs.dossie }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }

  return { tools, registry: scopePreparationCrmRegistry(registry, alixGetClientes) }
}
