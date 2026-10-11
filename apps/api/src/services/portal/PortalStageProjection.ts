/** O CRM informa a etapa atual; ela não comprova eventos anteriores nem envio de proposta. */
export function portalStageProjection(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_')
  const aliases: Record<string,string> = {
    lead:'cadastro', prospeccao:'cadastro', qualificacao:'cadastro', cadastro:'cadastro',
    analise:'analise', em_analise:'analise', proposta:'proposta', proposta_enviada:'proposta',
    negociacao:'negociacao', em_negociacao:'negociacao', acordo:'acordo', acompanhamento:'acompanhamento',
    concluido:'encerrado', encerrado:'encerrado', finalizado:'encerrado',
  }
  const current = aliases[raw]
  if (!current) return [{ id:'a_confirmar',label:'Etapa a confirmar com a equipe',done:false,current:true }]
  return [
    {id:'cadastro',label:'Início do atendimento'}, {id:'analise',label:'Em análise documental'},
    {id:'proposta',label:'Preparação da proposta'}, {id:'negociacao',label:'Em negociação'},
    {id:'acordo',label:'Acordo registrado'}, {id:'acompanhamento',label:'Em acompanhamento'},
    {id:'encerrado',label:raw === 'concluido' || raw === 'finalizado' ? 'Atendimento concluído' : 'Atendimento encerrado'},
  ].map(stage => ({ ...stage,done:false,current:stage.id === current }))
}
