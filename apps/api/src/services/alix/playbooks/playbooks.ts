// ============================================================
// Playbooks — receitas opinativas por situação
// ============================================================
// Quando a ALIX detecta um padrão conhecido (lead com parcelamento
// rescindido, DOU com recuperação judicial, cluster regional etc),
// em vez do LLM raciocinar do zero, ela puxa o PLAYBOOK e usa como
// guia de abordagem. Playbooks incluem:
//   - gatilhos (triggers) para detecção automática
//   - gancho de entrada (primeira frase/abordagem)
//   - passos em ordem (com ferramentas sugeridas)
//   - argumentos comerciais
//   - risco a mitigar
//   - precedentes
// ============================================================

export type PlaybookTrigger =
  | { kind: 'lead-signal'; signal: string }           // ex.: agroSignals contém "PARCELAMENTO RESCINDIDO"
  | { kind: 'dou-tipo'; tipo: string }                // ex.: DOU:RECUPERACAO-JUDICIAL
  | { kind: 'score-min'; min: number; withAjuizamento?: boolean }
  | { kind: 'divida-faixa'; min: number; max?: number }
  | { kind: 'cnae-prefix'; prefix: string }          // ex.: CNAE agro começa com 01
  | { kind: 'situacao-especial'; termo: string }     // CNPJ em RJ, falência, etc

export interface Playbook {
  id: string
  titulo: string
  situacao: string                                   // quando este playbook se aplica
  ganchoEntrada: string                              // frase inicial p/ abordagem comercial
  passos: Array<{ ordem: number; titulo: string; tool?: string; detalhe: string }>
  argumentosComerciais: string[]
  riscosAMitigar: string[]
  precedentes?: string[]                             // casos que funcionaram (se houver)
  severidade: 'alta' | 'media' | 'baixa'
  triggers: PlaybookTrigger[]
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'parcelamento-rescindido',
    titulo: 'Parcelamento PGFN rescindido — janela de urgência',
    situacao:
      'Dívida PGFN com histórico de parcelamento rescindido. Alta probabilidade de ajuizamento imediato e penhora; o produtor já tentou e não conseguiu honrar — ele precisa de uma estrutura FINANCEIRA viável, não só de um desconto legal.',
    ganchoEntrada:
      'Identifiquei que um dos seus parcelamentos foi rescindido em [data]. Isso significa que, em até 30-60 dias, a PGFN pode bloquear seus bens. Antes de conversar sobre desconto, precisamos falar sobre fluxo de caixa.',
    passos: [
      { ordem: 1, titulo: 'Mapear ajuizamentos ativos', tool: 'enriquecer_lead', detalhe: 'Ver quais inscrições já foram ao Judiciário e o risco real de penhora.' },
      { ordem: 2, titulo: 'Checar elegibilidade Desenrola', tool: 'simular_desenrola_rural', detalhe: 'Se dívida pré-2024, simular descontos. Se pós-2024, ir para Transação Individual.' },
      { ordem: 3, titulo: 'Levantar fluxo de caixa real', detalhe: 'Perguntar ao produtor: receita mensal, custo fixo, folha, insumos. Sem isso não há proposta viável.' },
      { ordem: 4, titulo: 'Desenhar proposta com entrada realista', tool: 'gerar_proposta_reestruturacao', detalhe: 'Entrada mínima possível + parcelas que caibam no fluxo. Melhor 120 parcelas que honrar do que 84 que quebra.' },
      { ordem: 5, titulo: 'Criar cliente e anexar dossiê', tool: 'promover_lead_para_cliente', detalhe: 'Já com urgência comercial ativa, registrar no CRM para rastrear cada contato.' },
    ],
    argumentosComerciais: [
      'Já tentou parcelamento e quebrou — precisa de uma estrutura com fluxo defensável, não de desconto teórico.',
      'ALETIS faz a conta primeiro, promete depois. Vocês entram juntos na PGFN com número sustentável.',
      'Honorário atrelado à economia real entregue, não ao valor da dívida.',
    ],
    riscosAMitigar: [
      'Bloqueio judicial de ativos em 30-60 dias pode paralisar operação antes de acordo fechar.',
      'Se parcelar de novo e rescindir novamente, fica impedido de novos parcelamentos por 2 anos.',
      'Multa de rescisão vira multa ativa ajuizada rapidamente.',
    ],
    severidade: 'alta',
    triggers: [
      { kind: 'lead-signal', signal: 'PARCELAMENTO RESCINDIDO' },
      { kind: 'lead-signal', signal: 'RESCINDIDO' },
    ],
  },
  {
    id: 'dou-recuperacao-judicial',
    titulo: 'Empresa em recuperação judicial no DOU',
    situacao:
      'Empresa agro mencionada em ato de recuperação judicial publicado no DOU. Credores concorrendo, prazos curtos, plano precisa ser construído com urgência e apresentado ao juízo.',
    ganchoEntrada:
      'Vi que sua empresa está em recuperação judicial. A ALETIS trabalha com produtores nessa situação — o desafio aqui não é negociar dívida avulsa, é construir o plano que o juiz vai aprovar. Podemos conversar em 15 min?',
    passos: [
      { ordem: 1, titulo: 'Mapear processo via WebResearcher', tool: 'delegate_web_researcher', detalhe: 'Número do processo, juízo competente, administrador judicial, prazo da AGC.' },
      { ordem: 2, titulo: 'Levantar massa de credores', detalhe: 'Classes I-IV: trabalhista, garantia real, quirografário, ME/EPP. Entender qual concentra o valor.' },
      { ordem: 3, titulo: 'Parecer técnico de viabilidade', tool: 'gerar_parecer_tecnico', detalhe: 'Projeção de caixa 5 anos com e sem o plano atual. Identificar deságio máximo suportável.' },
      { ordem: 4, titulo: 'Propor participação no plano', detalhe: 'Não é proposta de reestruturação típica — é consultoria para o processo. Honorário por hora ou %.' },
    ],
    argumentosComerciais: [
      'Na RJ não adianta negociar caso a caso — o plano precisa ser matemático e defensável perante o juiz.',
      'ALETIS tem expertise em fluxo agro sazonal para justificar prazos estendidos no plano.',
      'Argumentar consignação de safra como garantia do plano (precedente em TJs de MT/GO).',
    ],
    riscosAMitigar: [
      'Prazo da AGC (assembleia de credores) é peremptório — não chegamos atrasados.',
      'Se 2/3 dos credores rejeitarem o plano, é falência automática.',
      'Consultoria paralela ao administrador judicial pode ser questionada — alinhar.',
    ],
    severidade: 'alta',
    triggers: [
      { kind: 'dou-tipo', tipo: 'DOU:RECUPERACAO-JUDICIAL' },
      { kind: 'dou-tipo', tipo: 'DOU:RECUPERACAO' },
      { kind: 'situacao-especial', termo: 'RECUPERACAO JUDICIAL' },
    ],
  },
  {
    id: 'lead-score-alto-ajuizada',
    titulo: 'Lead quente (score ≥85) com ações ajuizadas',
    situacao:
      'Top do funil: dívida PGFN significativa + ajuizamento confirmado + score de fit ALETIS alto. Precisa de contato em 30 dias antes da penhora avançar.',
    ganchoEntrada:
      'Vi que sua empresa tem R$ [X] mi em dívida ativa PGFN, com ações já ajuizadas. O que pouca gente fala é que tem uma janela de 60-90 dias entre o ajuizamento e a penhora efetiva — e é aí que o desconto é maior. Topa 15 min?',
    passos: [
      { ordem: 1, titulo: 'Enriquecer completamente', tool: 'enriquecer_lead', detalhe: 'BrasilAPI (CNPJ, sócios, CNAE, porte, endereço) + SICAR.' },
      { ordem: 2, titulo: 'Simular Desenrola + alternativas', tool: 'onboarding_lead_blueprint', detalhe: 'Gera blueprint automático com números.' },
      { ordem: 3, titulo: 'Calendário safra para timing', tool: 'calendario_safra', detalhe: 'Abordar quando o caixa está cheio (pós-colheita) tem 3x mais conversão.' },
      { ordem: 4, titulo: 'Gerar proposta + parecer', tool: 'delegate_doc_generator', detalhe: 'Entregar materiais no primeiro contato — demonstra seriedade.' },
      { ordem: 5, titulo: 'Registrar no CRM + tarefa D+3', tool: 'delegate_crm_writer', detalhe: 'Follow-up em 3 dias se não houver retorno.' },
    ],
    argumentosComerciais: [
      'Penhora corta crédito rural, trava CPR, bloqueia venda de safra. Quanto antes resolver, mais barato.',
      'ALETIS já estruturou 40+ casos similares em [UF] — leveness, não um escritório de advogados.',
      'Honorário só sobre economia líquida entregue, não sobre a dívida nominal.',
    ],
    riscosAMitigar: [
      'Se já teve penhora parcial, diluir garantia fica mais difícil.',
      'Produtor pode estar desiludido por já ter tentado com escritório tradicional.',
    ],
    severidade: 'alta',
    triggers: [
      { kind: 'score-min', min: 85, withAjuizamento: true },
    ],
  },
  {
    id: 'agro-timing-colheita',
    titulo: 'Produtor em janela de colheita — caixa disponível',
    situacao:
      'Lead em UF × cultura com safra sendo colhida agora. Produtor tem liquidez momentânea e está mais receptivo a discutir entrada em acordo.',
    ganchoEntrada:
      'Aproveitando que a safra de [cultura] em [UF] está saindo agora, quis antecipar uma conversa: identifiquei R$ [X] em dívida ativa que pode ser reestruturada com entrada pequena. Com o caixa que entra na venda, dá pra travar algo bom agora.',
    passos: [
      { ordem: 1, titulo: 'Confirmar calendário safra', tool: 'calendario_safra', detalhe: 'Validar janela plantio/colheita/venda para UF × cultura principal.' },
      { ordem: 2, titulo: 'Simular cenários', tool: 'simular_desenrola_rural', detalhe: 'Monte opção com entrada pesada (10-15%) para aproveitar caixa + parcelamento longo.' },
      { ordem: 3, titulo: 'Gerar proposta comercial', tool: 'gerar_proposta_reestruturacao', detalhe: 'Destacar entrada aproveitando safra + parcelas que caibam na entressafra.' },
    ],
    argumentosComerciais: [
      'Entrada maior agora reduz saldo e juros — cada 1% de entrada economiza ~R$ [cálculo].',
      'Parcelas podem caber na entressafra (jun-nov) em vez de pressionar durante plantio.',
    ],
    riscosAMitigar: [
      'Produtor pode querer usar caixa para custeio da próxima safra, não para dívida.',
      'Se houver CPR antecipada vendida, caixa já pode estar comprometido.',
    ],
    severidade: 'media',
    triggers: [
      // Trigger é composto — o detector usa data + UF + cultura.
      { kind: 'lead-signal', signal: 'SOJA' },
      { kind: 'lead-signal', signal: 'MILHO' },
      { kind: 'lead-signal', signal: 'CAFE' },
    ],
  },
  {
    id: 'cluster-regional-pr',
    titulo: 'Cluster regional: múltiplos leads quentes na mesma UF',
    situacao:
      'Mais de 3 leads quentes (score ≥80) na mesma UF. Vale uma rodada de visitas concentrada em vez de abordagens remotas individuais.',
    ganchoEntrada:
      'Tô planejando uma agenda em [UF] nas próximas duas semanas para visitar produtores agro com dívida. Posso incluir a sua empresa? Uma reunião presencial de 1h resolve o que 5 calls não resolveriam.',
    passos: [
      { ordem: 1, titulo: 'Listar leads quentes da UF', tool: 'listar_leads_filtrados', detalhe: 'Filtrar por UF + score ≥80.' },
      { ordem: 2, titulo: 'Mapear proximidade geográfica', detalhe: 'Agrupar por cidade ou microrregião — otimizar rota.' },
      { ordem: 3, titulo: 'Preparar materiais base', tool: 'delegate_doc_generator', detalhe: 'Um parecer genérico por UF + propostas individualizadas.' },
      { ordem: 4, titulo: 'Criar todos no CRM em batch', tool: 'delegate_crm_writer', detalhe: 'Consultor=Christian, estágio=visita-agendada, tag=cluster-[UF].' },
    ],
    argumentosComerciais: [
      'Visita presencial tem 4x mais conversão que call remoto.',
      'Concentrar 5-6 visitas em 2 dias otimiza deslocamento.',
    ],
    riscosAMitigar: [
      'Logística de agenda — bloquear dias antecipadamente.',
      'Pode virar "parecendo escritório grande" se não for intimista.',
    ],
    severidade: 'baixa',
    triggers: [
      // Trigger composto — detector precisa rodar agregação.
    ],
  },
]

/**
 * Detecta quais playbooks se aplicam a um lead baseado nos triggers.
 * Retorna array em ordem de severidade (alta primeiro).
 */
export function detectPlaybooks(lead: {
  agroSignals?: string[]
  totalDivida?: number
  temAjuizada?: boolean
  score?: { total?: number }
  cnpj?: { cnaeFiscal?: string; situacaoEspecial?: string }
}): Playbook[] {
  const match: Array<{ pb: Playbook; motivos: string[] }> = []

  for (const pb of PLAYBOOKS) {
    const motivos: string[] = []
    for (const t of pb.triggers) {
      switch (t.kind) {
        case 'lead-signal':
          if ((lead.agroSignals ?? []).some((s) => s.toUpperCase().includes(t.signal.toUpperCase()))) {
            motivos.push(`sinal "${t.signal}" presente`)
          }
          break
        case 'dou-tipo':
          if ((lead.agroSignals ?? []).some((s) => s.toUpperCase().includes(t.tipo.toUpperCase()))) {
            motivos.push(`DOU ${t.tipo}`)
          }
          break
        case 'score-min':
          if (lead.score?.total != null && lead.score.total >= t.min) {
            if (!t.withAjuizamento || lead.temAjuizada) {
              motivos.push(`score ≥${t.min}${t.withAjuizamento ? ' com ajuizamento' : ''}`)
            }
          }
          break
        case 'divida-faixa':
          if (lead.totalDivida != null && lead.totalDivida >= t.min && (t.max == null || lead.totalDivida <= t.max)) {
            motivos.push(`dívida na faixa [${t.min}..${t.max ?? '∞'}]`)
          }
          break
        case 'cnae-prefix':
          if (lead.cnpj?.cnaeFiscal && String(lead.cnpj.cnaeFiscal).startsWith(t.prefix)) {
            motivos.push(`CNAE prefix ${t.prefix}`)
          }
          break
        case 'situacao-especial':
          if (lead.cnpj?.situacaoEspecial && lead.cnpj.situacaoEspecial.toUpperCase().includes(t.termo.toUpperCase())) {
            motivos.push(`situação especial: ${t.termo}`)
          }
          break
      }
    }
    if (motivos.length > 0) match.push({ pb, motivos })
  }

  return match
    .sort((a, b) => {
      const sev = { alta: 3, media: 2, baixa: 1 } as const
      return sev[b.pb.severidade] - sev[a.pb.severidade]
    })
    .map((m) => ({ ...m.pb, _motivos: m.motivos } as Playbook & { _motivos: string[] }))
}

export function findPlaybook(id: string): Playbook | null {
  return PLAYBOOKS.find((p) => p.id === id) ?? null
}
