// ============================================================
// processo-assessoria — tools ALIX para os 25 documentos do
// Processo de Assessoria ALETIS.
// ============================================================
//   - listar_documentos_processo()           → catálogo
//   - preview_documento_processo()           → ver placeholders resolvidos
//   - gerar_documento_processo()             → renderizar
//   - listar_checklists_cliente()            → estado dos checklists
//   - atualizar_item_checklist()             → marcar/desmarcar/anotar
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import {
  getProcessoAssessoriaService,
  type ProcessoClienteData,
} from '../../processo-assessoria/ProcessoAssessoriaService.js'
import {
  PROCESSO_TEMPLATES,
  CATEGORIA_META,
  getProcessoTemplateBySlug,
} from '../../processo-assessoria/manifest.js'
import { getChecklistRepository } from '../../processo-assessoria/ChecklistRepository.js'
import { alixGetClientes } from '../../AlixService.js'

function parseInputs(value: unknown): Record<string, string> {
  if (!value) return {}
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, String(item ?? '')]))
  } catch {
    return {}
  }
}

function loadCliente(clienteId: string): ProcessoClienteData | null {
  const list = alixGetClientes()
  const c = list.find((x: any) => String(x?.id) === clienteId)
  if (!c) return null
  return {
    id: String(c.id),
    nome: String(c.nome ?? ''),
    cpfCnpj: c.cpfCnpj ?? null,
    cidade: c.cidade ?? null,
    uf: c.uf ?? null,
    endereco: c.endereco ?? null,
    email: c.email ?? null,
    telefone: c.telefone ?? null,
    estagio: c.estagio ?? null,
  }
}

/** Fuzzy resolver simples: aceita slug, código (R.OP.001), ou substring do nome. */
function resolveProcessoSlug(input: string): string | null {
  const norm = input.toLowerCase().trim()
  // exact slug
  const exact = PROCESSO_TEMPLATES.find((t) => t.slug === norm)
  if (exact) return exact.slug
  // exact codigo
  const byCodigo = PROCESSO_TEMPLATES.find((t) => t.codigo.toLowerCase() === norm)
  if (byCodigo) return byCodigo.slug
  // substring nome
  const byNome = PROCESSO_TEMPLATES.find((t) => t.nome.toLowerCase().includes(norm))
  if (byNome) return byNome.slug
  // tokens overlap
  const tokens = norm.split(/\s+/).filter((t) => t.length >= 3)
  let best: { slug: string; score: number } | null = null
  for (const t of PROCESSO_TEMPLATES) {
    const hay = `${t.slug} ${t.codigo} ${t.nome} ${t.descricao} ${t.categoria}`.toLowerCase()
    let score = 0
    for (const tok of tokens) if (hay.includes(tok)) score += 10
    if (best == null || score > best.score) best = { slug: t.slug, score }
  }
  return best && best.score >= 10 ? best.slug : null
}

export function buildProcessoAssessoriaTools(): {
  tools: LLMTool[]
  registry: LLMToolRegistry
} {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}
  const service = getProcessoAssessoriaService()
  const checklistRepo = getChecklistRepository()

  // ── listar_documentos_processo ──────────────────────────────
  tools.push({
    name: 'listar_documentos_processo',
    description:
      'Lista os 25 documentos oficiais do Processo de Assessoria ALETIS ' +
      '(checklists, contratos, planilhas financeiras, planilhas operacionais, gerenciadores, ' +
      'políticas, POPs, instruções de trabalho, relatórios, registros). ' +
      'Use para escolher qual documento gerar/preencher para um cliente.',
    input_schema: {
      type: 'object',
      properties: {
        categoria: {
          type: 'string',
          description:
            'Filtra por categoria: checklist-cadastro, checklist-rotina, contrato-comercial, ' +
            'planilha-financeira-core, planilha-operacional, gerenciador, politica, pop-rotina, ' +
            'instrucao-trabalho, relatorio-output, apresentacao-comercial, registro-qualidade.',
        },
        formato: { type: 'string', description: 'docx | xlsx | xlsm | pptx | pdf' },
      },
    },
  })
  registry['listar_documentos_processo'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      let list = PROCESSO_TEMPLATES.slice()
      if (input?.categoria) list = list.filter((t) => t.categoria === input.categoria)
      if (input?.formato) list = list.filter((t) => t.formato === input.formato)
      return {
        total: list.length,
        templates: list.map((t) => ({
          slug: t.slug,
          codigo: t.codigo,
          nome: t.nome,
          versao: t.versao,
          descricao: t.descricao,
          categoria: t.categoria,
          formato: t.formato,
          uiTab: t.uiTab,
          hasChecklist: !!t.checklist,
          placeholders: (t.placeholders ?? []).map((p) => ({
            name: p.name,
            label: p.label,
            required: p.required,
          })),
        })),
        categorias: CATEGORIA_META,
      }
    },
  }

  // ── preview_documento_processo ─────────────────────────────
  tools.push({
    name: 'preview_documento_processo',
    description:
      'Pré-visualiza os valores que serão injetados no documento do Processo de Assessoria. ' +
      'Retorna placeholders resolvidos + lista de campos OBRIGATÓRIOS faltando. ' +
      '"templateSlug" aceita slug, código (R.OP.001) ou nome parcial.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'ID do cliente CRM' },
        templateSlug: { type: 'string', description: 'slug, código ou nome do template' },
        inputsJson: { type: 'string', description: 'JSON válido com overrides para campos manuais' },
      },
      required: ['clienteId', 'templateSlug'],
    },
  })
  registry['preview_documento_processo'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const cli = loadCliente(String(input.clienteId))
      if (!cli) return { ok: false, error: `Cliente ${input.clienteId} não encontrado` }
      const slug = resolveProcessoSlug(String(input.templateSlug))
      if (!slug) return { ok: false, error: `Template "${input.templateSlug}" não identificado` }
      const inputs = parseInputs(input?.inputsJson)
      const out = service.preview({ templateSlug: slug, cliente: cli, inputs })
      return {
        ok: true,
        template: {
          slug: out.template.slug,
          codigo: out.template.codigo,
          nome: out.template.nome,
          formato: out.template.formato,
        },
        resolved: out.resolved,
        missing: out.missing,
        cliente: { id: cli.id, nome: cli.nome },
      }
    },
  }

  // ── gerar_documento_processo ───────────────────────────────
  tools.push({
    name: 'gerar_documento_processo',
    description:
      'Gera o documento oficial preenchido com os dados do cliente. ' +
      'Devolve URL relativa ao backend (/api/processo-assessoria/templates/:slug/render via POST) ' +
      'e os metadados do arquivo. Para baixar o arquivo de fato, use a URL retornada.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        templateSlug: { type: 'string', description: 'slug, código ou nome do template' },
        inputsJson: { type: 'string', description: 'JSON válido com overrides para campos manuais' },
      },
      required: ['clienteId', 'templateSlug'],
    },
  })
  registry['gerar_documento_processo'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const cli = loadCliente(String(input.clienteId))
      if (!cli) return { ok: false, error: `Cliente ${input.clienteId} não encontrado` }
      const slug = resolveProcessoSlug(String(input.templateSlug))
      if (!slug) return { ok: false, error: `Template "${input.templateSlug}" não identificado` }
      try {
        const inputs = parseInputs(input?.inputsJson)
        const out = await service.render({
          templateSlug: slug,
          cliente: cli,
          inputs,
        })
        return {
          ok: true,
          downloadUrl: `/api/processo-assessoria/templates/${slug}/render`,
          httpMethod: 'POST',
          httpBody: { clienteId: cli.id, inputs },
          template: {
            slug: out.template.slug,
            codigo: out.template.codigo,
            nome: out.template.nome,
            formato: out.template.formato,
          },
          filename: out.filename,
          contentType: out.contentType,
          bytes: out.buffer.length,
          resolved: out.resolvedData,
        }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'erro ao gerar documento' }
      }
    },
  }

  // ── listar_checklists_cliente ──────────────────────────────
  tools.push({
    name: 'listar_checklists_cliente',
    description:
      'Lista o estado de todos os checklists interativos de um cliente ' +
      '(R.OP.003 PF, R.OP.004 Documentos, R.OP.005 Dados Adicionais, R.OP.009 Rotina). ' +
      'Mostra progresso (N de M itens concluídos).',
    input_schema: {
      type: 'object',
      properties: { clienteId: { type: 'string' } },
      required: ['clienteId'],
    },
  })
  registry['listar_checklists_cliente'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const list = await checklistRepo.listByCliente(String(input.clienteId))
      return {
        clienteId: input.clienteId,
        total: list.length,
        checklists: list.map((s) => {
          const tpl = getProcessoTemplateBySlug(s.templateSlug)
          return {
            templateSlug: s.templateSlug,
            templateNome: tpl?.nome,
            templateCodigo: tpl?.codigo,
            status: s.status,
            totalItens: s.totalItens,
            itensConcluidos: s.itensConcluidos,
            progresso:
              s.totalItens > 0 ? `${Math.round((s.itensConcluidos / s.totalItens) * 100)}%` : '0%',
            atualizadoEm: s.atualizadoEm,
          }
        }),
      }
    },
  }

  // ── atualizar_item_checklist ───────────────────────────────
  tools.push({
    name: 'atualizar_item_checklist',
    description:
      'Marca/desmarca um item de checklist do cliente, com observação opcional. ' +
      'Retorna o estado atualizado com progresso.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        templateSlug: {
          type: 'string',
          description:
            'slug do checklist: checklist-informacoes-basicas-pf, checklist-documentos-produtor-rural, ' +
            'checklist-dados-adicionais, checklist-rotina-assessoria',
        },
        itemId: { type: 'string', description: 'ID do item dentro do checklist' },
        marcado: { type: 'boolean', description: 'true=concluído / false=pendente' },
        observacao: { type: 'string' },
      },
      required: ['clienteId', 'templateSlug', 'itemId'],
    },
  })
  registry['atualizar_item_checklist'] = {
    spec: tools[tools.length - 1],
    handler: async (input: any) => {
      const slug = resolveProcessoSlug(String(input.templateSlug))
      if (!slug) return { ok: false, error: `Checklist "${input.templateSlug}" não identificado` }
      try {
        const state = await checklistRepo.upsertItem(
          String(input.clienteId),
          slug,
          String(input.itemId),
          {
            marcado: typeof input.marcado === 'boolean' ? input.marcado : undefined,
            observacao: input.observacao,
          },
        )
        return {
          ok: true,
          estado: {
            status: state.status,
            totalItens: state.totalItens,
            itensConcluidos: state.itensConcluidos,
            progresso: `${Math.round((state.itensConcluidos / state.totalItens) * 100)}%`,
          },
        }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'erro' }
      }
    },
  }

  return { tools, registry }
}
