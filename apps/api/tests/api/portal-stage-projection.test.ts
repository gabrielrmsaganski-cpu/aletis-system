import { describe,expect,it } from 'vitest'
import { portalStageProjection } from '../../src/services/portal/PortalStageProjection.js'
describe('etapa pública baseada no estágio realmente registrado',()=>{
  it('análise não vira proposta elaborada ou enviada',()=>{
    const stages=portalStageProjection('analise')
    expect(stages.find(s=>s.current)).toMatchObject({id:'analise',label:'Em análise documental'})
    expect(stages.some(s=>s.done)).toBe(false)
    expect(stages.some(s=>s.label==='Proposta Enviada')).toBe(false)
  })
  it('reconhece estágios reais e mantém desconhecidos como informação a confirmar',()=>{
    for(const [stage,id] of [['lead','cadastro'],['qualificacao','cadastro'],['proposta','proposta'],['negociacao','negociacao'],['acompanhamento','acompanhamento'],['concluido','encerrado']]) expect(portalStageProjection(stage).find(s=>s.current)?.id).toBe(id)
    expect(portalStageProjection('status-novo')).toEqual([{id:'a_confirmar',label:'Etapa a confirmar com a equipe',done:false,current:true}])
    expect(portalStageProjection('encerrado').filter(s=>s.done)).toEqual([])
  })
})
