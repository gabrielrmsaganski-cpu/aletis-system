import type { AdvisorRule } from '../types.js'

const MS_DIA = 86_400_000

/**
 * Cliente ativo sem contato nos últimos 45 dias — relacionamento esfriando.
 * Regra reforça proximaAcao quando ela está vazia ou atrasada.
 */
export const rule: AdvisorRule = {
  id: 'contato-frio',
  titulo: 'Sem contato recente — retomar relacionamento',
  categoria: 'relacionamento',
  prioridade: 'p3',
  evaluate: ({ cliente }) => {
    const hoje = Date.now()
    const contatos = cliente.timeline
      .filter((t) => t.tipo === 'contato' || t.tipo === 'reuniao')
      .map((t) => new Date(t.data).getTime())
      .filter((t) => Number.isFinite(t))
    const ultimo = contatos.length > 0 ? Math.max(...contatos) : 0
    const diasSemContato = ultimo > 0 ? Math.floor((hoje - ultimo) / MS_DIA) : 365
    if (diasSemContato < 45) return null

    const proxima = cliente.proximaAcao
    const proximaAtrasada = proxima && new Date(proxima.data).getTime() < hoje

    let acao: string
    if (!proxima) {
      acao = 'Agendar contato (ligação ou visita) e registrar próxima ação no CRM'
    } else if (proximaAtrasada) {
      acao = `Próxima ação atrasada (${proxima.data}): ${proxima.descricao}. Executar ou reagendar hoje`
    } else {
      acao = 'Ligar ou agendar visita antes que o vínculo esfrie de vez'
    }

    return {
      id: 'contato-frio',
      titulo: 'Sem contato recente — retomar relacionamento',
      categoria: 'relacionamento',
      prioridade: diasSemContato >= 90 ? 'p2' : 'p3',
      acao,
      justificativa: `Último contato/reunião registrado há ${diasSemContato === 365 ? '> 1 ano' : diasSemContato + ' dias'}.${proximaAtrasada ? ' Próxima ação atrasada.' : ''}`,
    }
  },
}
