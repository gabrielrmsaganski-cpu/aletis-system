// ============================================================
// contratos-oficiais — tools ALIX para os 10 contratos padronizados
// ============================================================
// Permite a ALIX:
//   - listar_contratos_oficiais()           → catálogo
//   - preview_contrato_oficial(slug, ...)   → mostrar como vai ficar
//   - gerar_contrato_oficial(slug, ...)     → renderizar e devolver URL
//
// Os arquivos preservam 100% da formatação, fontes e logos do original.
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
import {
  getContractTemplateService,
  type RenderClienteData,
  type OutorganteEntry,
} from '../../contratos/ContractTemplateService.js'
import { alixGetClientes } from '../../AlixService.js'
import { cacheRender } from '../../../routes/contratos-templates.js'

function loadCliente(clienteId: string): RenderClienteData | null {
  const list = alixGetClientes()
  const c = list.find((x: any) => String(x?.id) === clienteId)
  if (!c) return null
  const cpfDigits = String(c.cpfCnpj ?? '').replace(/\D/g, '')
  const isCnpj = cpfDigits.length === 14
  return {
    id: String(c.id),
    nome: String(c.nome ?? ''),
    cpf: !isCnpj ? c.cpfCnpj : null,
    cnpj: isCnpj ? c.cpfCnpj : null,
    rg: c.rg ?? null,
    orgaoRg: c.orgaoRg ?? null,
    qualificacao: c.qualificacao ?? c.atividade ?? null,
    endereco: c.endereco ?? c.logradouro ?? null,
    numero: c.numero ?? null,
    bairro: c.bairro ?? null,
    municipio: c.cidade ?? c.municipio ?? null,
    uf: c.uf ?? null,
    cep: c.cep ?? null,
    email: c.email ?? null,
    telefone: c.telefone ?? null,
    genero: c.genero === 'F' ? 'F' : 'M',
  }
}

export function buildContratosOficiaisTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

  // ── listar_contratos_oficiais ───────────────────────────────
  tools.push({
    name: 'listar_contratos_oficiais',
    description:
      'Lista os 10 contratos/anexos oficiais da ALETIS (padronizados, com formatação intocada). ' +
      'Retorna slug, título, categoria e os campos editáveis. ' +
      'Use ANTES de gerar para escolher o template correto e saber quais campos vai precisar.',
    input_schema: { type: 'object', properties: {} },
  })
  registry['listar_contratos_oficiais'] = {
    spec: tools[tools.length - 1],
    handler: async () => {
      const svc = getContractTemplateService()
      return {
        templates: svc.listTemplates().map((t) => ({
          slug: t.slug,
          title: t.title,
          subtitle: t.subtitle,
          category: t.category,
          campos: t.placeholders.map((p) => ({
            name: p.name,
            label: p.label,
            required: p.required,
            sourceKind: p.source.kind,
            hint: p.hint,
          })),
        })),
      }
    },
  }

  // ── preview_contrato_oficial ────────────────────────────────
  tools.push({
    name: 'preview_contrato_oficial',
    description:
      'Pré-visualiza COMO O CONTRATO VAI FICAR antes de gerar — retorna os valores que vão ' +
      'preencher cada campo + lista de campos OBRIGATÓRIOS faltando. Sempre chame isto ' +
      'ANTES de gerar_contrato_oficial para validar que os dados do cliente estão completos.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'ID do cliente no CRM' },
        templateSlug: { type: 'string', description: 'Slug do template (de listar_contratos_oficiais)' },
        inputs: {
          type: 'object',
          description: 'Overrides para campos manuais (ex.: { contrato_numero: "107/2026", contrato_data: "27/04/2026" })',
        },
        outorgantes: {
          type: 'array',
          description: 'Para NDA/Procuração: array de pessoas { nome, qualificacao, endereco, cep, rg, orgaoRg, cpf, genero (M|F) }',
        },
      },
      required: ['clienteId', 'templateSlug'],
    },
  })
  registry['preview_contrato_oficial'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const svc = getContractTemplateService()
      const cliente = loadCliente(String(input.clienteId))
      if (!cliente) return { ok: false, error: `Cliente ${input.clienteId} não encontrado` }
      try {
        const preview = svc.preview({
          templateSlug: String(input.templateSlug),
          cliente,
          inputs: (input.inputs ?? undefined) as Record<string, string> | undefined,
          outorgantes: input.outorgantes as OutorganteEntry[] | undefined,
        })
        return {
          ok: true,
          slug: preview.template.slug,
          title: preview.template.title,
          campos_preenchidos: preview.resolved,
          campos_faltando: preview.missing,
          pronto_para_gerar: preview.missing.length === 0,
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }

  // ── gerar_contrato_oficial ──────────────────────────────────
  tools.push({
    name: 'gerar_contrato_oficial',
    description:
      'Gera o contrato oficial preenchido (.docx) preservando 100% da formatação, fontes e logos. ' +
      'Devolve uma URL de download (TTL 1h). Use APÓS preview_contrato_oficial confirmar pronto_para_gerar=true. ' +
      'IMPORTANTE: SEMPRE confirme com Christian antes de gerar (HITL) o template e os campos.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        templateSlug: { type: 'string' },
        inputs: { type: 'object', description: 'Overrides manuais' },
        outorgantes: { type: 'array', description: 'Para NDA/Procuração' },
      },
      required: ['clienteId', 'templateSlug'],
    },
  })
  registry['gerar_contrato_oficial'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const svc = getContractTemplateService()
      const cliente = loadCliente(String(input.clienteId))
      if (!cliente) return { ok: false, error: `Cliente ${input.clienteId} não encontrado` }
      try {
        const result = svc.render({
          templateSlug: String(input.templateSlug),
          cliente,
          inputs: (input.inputs ?? undefined) as Record<string, string> | undefined,
          outorgantes: input.outorgantes as OutorganteEntry[] | undefined,
        })
        const token = cacheRender(result.buffer, result.filename)
        return {
          ok: true,
          slug: result.template.slug,
          filename: result.filename,
          downloadUrl: `/api/contratos/templates/cache/${token}`,
          expiraEmMin: 60,
          mensagem: `Contrato "${result.template.title}" gerado para ${cliente.nome}. Clique no link para baixar (válido por 1h).`,
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }

  return { tools, registry }
}
