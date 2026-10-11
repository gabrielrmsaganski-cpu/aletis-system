// ============================================================
// playbooks — tools de detecção/aplicação de playbook
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { detectPlaybooks, findPlaybook, PLAYBOOKS } from '../playbooks/playbooks.js'
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js'

function digits(s: string): string {
  return (s || '').replace(/\D/g, '')
}

export function buildPlaybooksTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'listar_playbooks',
    description:
      'Lista todos os playbooks cadastrados (receitas opinativas por situação) com título, situação e severidade. Use para conhecer o catálogo.',
    input_schema: { type: 'object', properties: {} },
  })
  registry['listar_playbooks'] = {
    spec: tools[tools.length - 1],
    handler: async () => {
      return {
        total: PLAYBOOKS.length,
        playbooks: PLAYBOOKS.map((p) => ({
          id: p.id,
          titulo: p.titulo,
          situacao: p.situacao,
          severidade: p.severidade,
        })),
      }
    },
  }

  tools.push({
    name: 'detectar_playbooks',
    description:
      'Dado um lead (por CPF/CNPJ), detecta automaticamente quais playbooks se aplicam baseado em triggers: sinais do lead, DOU, score+ajuizamento, CNAE, situação especial. Retorna em ordem de severidade.',
    input_schema: {
      type: 'object',
      properties: {
        leadCpfCnpj: { type: 'string' },
      },
      required: ['leadCpfCnpj'],
    },
  })
  registry['detectar_playbooks'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const clean = digits(String(input.leadCpfCnpj))
      const lead = getProspeccaoService().getLead(clean)
      if (!lead) return { error: `lead não encontrado: ${clean}` }
      const playbooks = detectPlaybooks(lead as any)
      if (playbooks.length === 0) {
        return {
          cpfCnpj: lead.cpfCnpj,
          nome: lead.nome,
          totalDetectados: 0,
          observacao: 'Nenhum playbook com trigger específico casou — seguir abordagem genérica.',
        }
      }
      return {
        cpfCnpj: lead.cpfCnpj,
        nome: lead.nome,
        totalDetectados: playbooks.length,
        playbooksAplicaveis: playbooks.map((p: any) => ({
          id: p.id,
          titulo: p.titulo,
          severidade: p.severidade,
          motivos: p._motivos || [],
          situacao: p.situacao,
        })),
        recomendacao: `Abra o playbook "${playbooks[0].id}" com aplicar_playbook para receber a receita completa.`,
      }
    },
  }

  tools.push({
    name: 'aplicar_playbook',
    description:
      'Retorna o playbook completo (gancho, passos ordenados, argumentos, riscos, precedentes) para execução. Use após detectar_playbooks para pegar a receita aplicável.',
    input_schema: {
      type: 'object',
      properties: {
        playbookId: { type: 'string', description: 'id do playbook (ex.: "parcelamento-rescindido")' },
        leadCpfCnpj: { type: 'string', description: 'opcional — para retornar o playbook já contextualizado com dados do lead' },
      },
      required: ['playbookId'],
    },
  })
  registry['aplicar_playbook'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const pb = findPlaybook(String(input.playbookId))
      if (!pb) return { error: `playbook "${input.playbookId}" não existe` }
      const leadCtx = input.leadCpfCnpj
        ? getProspeccaoService().getLead(digits(String(input.leadCpfCnpj)))
        : null
      return {
        playbook: pb,
        contexto: leadCtx ? { nome: leadCtx.nome, uf: leadCtx.uf, divida: leadCtx.totalDivida, score: leadCtx.score?.total } : null,
        diretriz:
          'Use o gancho de entrada como primeira frase no contato. Execute os passos na ordem — cada "tool" indicada é atalho. Os argumentos comerciais são bullet pra fala/proposta. Os riscos são para preparar contra-argumentação do cliente.',
      }
    },
  }

  return { tools, registry }
}
