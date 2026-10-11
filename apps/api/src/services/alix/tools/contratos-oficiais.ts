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

import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import {
  getContractTemplateService,
  type RenderClienteData,
  type OutorganteEntry,
} from '../../contratos/ContractTemplateService.js'
import { resolveTemplateSlug } from '../../contratos/templateResolver.js'
import { alixGetClientes } from '../../AlixService.js'
import { cacheRender } from '../../../routes/contratos-templates.js'

function parseInputs(value: unknown): Record<string, string> | undefined {
  if (!value) return undefined
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, String(item ?? '')]))
  } catch {
    return undefined
  }
}

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

export function buildContratosOficiaisTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

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
          nome: t.title,                 // ← nome amigável
          arquivo_original: t.originalFile, // ← nome do .docx oficial
          subtitle: t.subtitle,
          categoria: t.category,
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
      'ANTES de gerar_contrato_oficial para validar que os dados do cliente estão completos. ' +
      'O parâmetro "templateSlug" aceita NOMES naturais ("anexo I consultoria", "NDA", ' +
      '"procuração", "termo de aceite", "contrato base completo") além do slug exato.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'ID do cliente no CRM' },
        templateSlug: { type: 'string', description: 'Slug OU nome natural do template (consultoria, NDA, procuração, termo de aceite, etc.)' },
        inputsJson: {
          type: 'string',
          description: 'JSON válido de overrides (ex.: {"contrato_numero":"107/2026"})',
        },
        outorgantes: {
          type: 'array',
          description: 'Para NDA/Procuração: array de pessoas',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string' },
              qualificacao: { type: 'string' },
              endereco: { type: 'string' },
              cep: { type: 'string' },
              rg: { type: 'string' },
              orgaoRg: { type: 'string' },
              cpf: { type: 'string' },
              genero: { type: 'string', enum: ['M', 'F'] },
            },
          },
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
      const resolved = resolveTemplateSlug(String(input.templateSlug))
      if (!resolved.ok) return resolved
      try {
        const preview = svc.preview({
          templateSlug: resolved.slug,
          cliente,
          inputs: parseInputs(input.inputsJson),
          outorgantes: input.outorgantes as OutorganteEntry[] | undefined,
        })
        return {
          ok: true,
          slug: preview.template.slug,
          nome: preview.template.title,
          arquivo_original: preview.template.originalFile,
          cliente_nome: cliente.nome,
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
      'O parâmetro "templateSlug" aceita NOMES naturais ("anexo I consultoria", "NDA", ' +
      '"procuração", "termo de aceite", "contrato base completo") além do slug exato. ' +
      'IMPORTANTE: SEMPRE confirme com Christian antes de gerar (HITL) o template e os campos. ' +
      'Apresente o resultado com markdown clicável: [⬇ Baixar .docx](URL).',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string' },
        templateSlug: { type: 'string', description: 'Slug OU nome natural do template' },
        inputsJson: { type: 'string', description: 'JSON válido com overrides manuais' },
        outorgantes: {
          type: 'array',
          description: 'Para NDA/Procuração: array de pessoas',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string' },
              qualificacao: { type: 'string' },
              endereco: { type: 'string' },
              cep: { type: 'string' },
              rg: { type: 'string' },
              orgaoRg: { type: 'string' },
              cpf: { type: 'string' },
              genero: { type: 'string', enum: ['M', 'F'] },
            },
          },
        },
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
      const resolved = resolveTemplateSlug(String(input.templateSlug))
      if (!resolved.ok) return resolved
      try {
        const result = svc.render({
          templateSlug: resolved.slug,
          cliente,
          inputs: parseInputs(input.inputsJson),
          outorgantes: input.outorgantes as OutorganteEntry[] | undefined,
        })
        const token = cacheRender(result.buffer, result.filename)
        const downloadUrl = `/api/contratos/templates/cache/${token}`
        return {
          ok: true,
          slug: result.template.slug,
          nome: result.template.title,
          arquivo_original: result.template.originalFile,
          arquivo_gerado: result.filename,
          cliente_nome: cliente.nome,
          downloadUrl,
          markdownLink: `[⬇ Baixar ${result.template.title}](${downloadUrl})`,
          expiraEmMin: 60,
          mensagem:
            `**${result.template.title}** gerado para **${cliente.nome}** ` +
            `(arquivo original: ${result.template.originalFile}). ` +
            `Clique para baixar — link válido por 1 hora.`,
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  }

  return { tools, registry }
}
