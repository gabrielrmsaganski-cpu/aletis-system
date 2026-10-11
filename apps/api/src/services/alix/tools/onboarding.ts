// ============================================================
// onboarding — macro-ação de pipeline completo lead → cliente
// ============================================================
// Esta tool NÃO substitui os sub-agentes — ela expõe ao LLM uma
// receita opinativa que roda o fluxo inteiro em uma única chamada:
//
//   1. enriquece o lead (Prospecção → BrasilAPI + SICAR + PGFN)
//   2. simula Desenrola Rural (se houver dívida PGFN/RFB)
//   3. calcula Funrural (estimativa com base em receita declarada)
//   4. retorna um BLUEPRINT estruturado com:
//      - numero de comando para CRMWriter criar cliente + proposta
//      - numero de comando para DocGenerator gerar parecer + proposta PDF
//      - resumo de análise
//
// O Orchestrator usa esse output como "plano" e delega nos sub-agentes
// apropriados em sequência. Assim evitamos que o LLM perca iterações
// re-descobrindo o pipeline a cada lead.
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js'
import { getDesenrolaRuralService } from '../../desenrola/DesenrolaRuralService.js'
import { getFunruralService } from '../../funrural/FunruralService.js'
import { alixGetClientes } from '../../AlixService.js'

function digits(s: string): string {
  return (s || '').replace(/\D/g, '')
}

export function buildOnboardingTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'onboarding_lead_blueprint',
    description:
      'Macro-receita de onboarding completo a partir de um lead da Prospecção: enriquece, simula Desenrola, calcula Funrural e devolve BLUEPRINT com ações sugeridas para CRMWriter e DocGenerator. Use quando o Christian pedir "estrutura tudo desse lead" ou "prepara o caso completo".',
    input_schema: {
      type: 'object',
      properties: {
        leadCpfCnpj: { type: 'string', description: 'CPF/CNPJ do lead alvo (apenas dígitos ou com máscara)' },
        perfilEstimado: {
          type: 'object',
          description: 'Estimativa do perfil para simuladores — opcional; valores default conservadores serão usados se ausentes',
          properties: {
            receitaBrutaAnual: { type: 'number' },
            ativosDeclarados: { type: 'number' },
            folhaPagamentoAnual: { type: 'number' },
            ratMultiplicador: { type: 'number', enum: [1, 2, 3] },
            capacidadePagamento: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          },
        },
      },
      required: ['leadCpfCnpj'],
    },
  })
  registry['onboarding_lead_blueprint'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const cpfCnpjClean = digits(String(input.leadCpfCnpj))
      if (!cpfCnpjClean) return { error: 'leadCpfCnpj inválido' }

      const prospec = getProspeccaoService()

      // 1. Enriquece lead — se ainda pendente, vira completo
      let lead
      try {
        lead = await prospec.enrichLead(cpfCnpjClean)
        if (!lead) lead = prospec.getLead(cpfCnpjClean)
      } catch (err) {
        return { error: `enriquecimento falhou: ${(err as Error).message}` }
      }
      if (!lead) return { error: `lead não encontrado: ${cpfCnpjClean}` }

      // 2. Verifica duplicata no CRM
      const clientesExistentes = alixGetClientes()
      const clienteExistente = clientesExistentes.find(
        (c: any) => digits(String(c.cpfCnpj || c.cpfcnpj || '')) === cpfCnpjClean,
      )

      // 3. Perfil estimado (defaults conservadores)
      const perfil = (input.perfilEstimado as Record<string, number> | undefined) ?? {}
      const receitaBruta = Number(perfil.receitaBrutaAnual ?? Math.max(lead.totalDivida * 1.5, 2_000_000))
      const ativosDeclarados = Number(perfil.ativosDeclarados ?? lead.totalDivida * 2)
      const capacidade = (perfil.capacidadePagamento as any) ?? 'B'
      const folha = Number(perfil.folhaPagamentoAnual ?? receitaBruta * 0.04)
      const rat = (perfil.ratMultiplicador as 1 | 2 | 3) ?? 2

      // 4. Simula Desenrola se tem dívida significativa
      let desenrola: any = null
      if (lead.totalDivida > 50_000 && lead.ultimaInscricao) {
        try {
          const svc = getDesenrolaRuralService()
          desenrola = svc.simular(
            {
              origem: 'PGFN',
              dataInscricao: lead.ultimaInscricao,
              modalidade: 'rural',
              valorInscrito: lead.totalDivida,
              valorAtualizado: lead.totalDivida,
            } as any,
            {
              receitaBrutaAnual: receitaBruta,
              ativosDeclarados,
              dividasTotal: lead.totalDivida,
              capacidadePagamento: capacidade,
            } as any,
          )
        } catch (err) {
          desenrola = { erro: (err as Error).message }
        }
      }

      // 5. Calcula Funrural (assumindo PJ empregador rural ou PF)
      let funrural: any = null
      try {
        const svc = getFunruralService()
        funrural = svc.calcular({
          tipo: lead.tipoPessoa === 'PF' ? 'PF' : 'PJ_empregador_rural',
          receitaBrutaAnual: receitaBruta,
          folhaPagamentoAnual: folha,
          ratMultiplicador: rat,
        } as any)
      } catch (err) {
        funrural = { erro: (err as Error).message }
      }

      // 6. Monta blueprint de ações recomendadas
      const blueprint = {
        lead: {
          cpfCnpj: lead.cpfCnpj,
          nome: lead.nome,
          uf: lead.uf,
          tipoPessoa: lead.tipoPessoa,
          totalDivida: lead.totalDivida,
          qtdInscricoes: lead.qtdInscricoes,
          score: lead.score?.total ?? null,
          temAjuizada: lead.temAjuizada,
          agroSignals: lead.agroSignals?.slice(0, 5) ?? [],
        },
        statusCRM: clienteExistente
          ? { existeNoCRM: true, clienteId: clienteExistente.id, estagio: clienteExistente.estagio }
          : { existeNoCRM: false },
        simulacoes: {
          desenrola,
          funrural,
        },
        acoesRecomendadas: [
          ...(!clienteExistente
            ? [{
                sub_agente: 'CRMWriter',
                intent: 'promover_lead_para_cliente',
                motivo: 'Lead ainda não cadastrado; criar cliente e trazer dívidas do lead para o dossiê',
                payload: { cpfCnpj: lead.cpfCnpj, estagioInicial: 'prospeccao' },
              }]
            : []),
          ...(desenrola && !desenrola.erro ? [{
              sub_agente: 'DocGenerator',
              intent: 'gerar_proposta_reestruturacao',
              motivo: `Desenrola mostra economia R$ ${(desenrola.economia ?? 0).toLocaleString('pt-BR')} — vale propor`,
              payload: {
                clienteId: clienteExistente?.id || 'a-definir-apos-criar',
                valorOriginal: lead.totalDivida,
                valorFinal: desenrola.valorAPagar,
                parcelas: desenrola.parcelamentoMaximoMeses,
                entrada: desenrola.entradaMinima,
              },
            }] : []),
          {
            sub_agente: 'DocGenerator',
            intent: 'gerar_parecer_tecnico',
            motivo: 'Parecer técnico sobre a situação completa (dívida + reforma + funrural)',
            payload: {
              clienteId: clienteExistente?.id || 'a-definir-apos-criar',
              contexto: 'onboarding-completo',
            },
          },
          {
            sub_agente: 'CRMWriter',
            intent: 'atualizar_dossie_dividas',
            motivo: 'Registrar inscrições PGFN na estrutura de dossiê',
            payload: {
              clienteId: clienteExistente?.id || 'a-definir-apos-criar',
              inscricoes: lead.qtdInscricoes,
              totalDivida: lead.totalDivida,
              fonte: 'PGFN',
            },
          },
        ],
        proximoPasso:
          'Apresente o BLUEPRINT ao Christian com 3 linhas de resumo. Se ele confirmar ("executar tudo" ou similar), delegue cada ação ao sub-agente correspondente (CRMWriter/DocGenerator) em UMA ÚNICA mensagem — o sistema agrupa em batch HITL unificado.',
      }

      return blueprint
    },
  }

  return { tools, registry }
}
