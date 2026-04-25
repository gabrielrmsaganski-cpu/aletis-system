/**
 * P1-08 — DOU regex menos agressiva: aceita execução fiscal/judicial e
 * agro keywords ampliados (frigorífico, silo, armazém, laticínio).
 */
import { describe, it, expect } from 'vitest'
import { atoToLeads } from '../../src/services/prospeccao/sources/DOUSource.js'

function ato(titulo: string, texto: string) {
  return {
    titulo,
    texto,
    dataPublicacao: '2026-04-25',
    url: 'http://test',
    secao: 'Diário Oficial',
  } as any
}

describe('DOU regex — atoToLeads', () => {
  it('captura leilão judicial agro com CNPJ', () => {
    const r = atoToLeads(ato(
      'EDITAL DE LEILAO - FAZENDA SAO JOAQUIM',
      'Leilão judicial da Fazenda São Joaquim, soja 1500ha, CNPJ 12.345.678/0001-99',
    ))
    expect(r.leads.length).toBeGreaterThan(0)
    expect(r.detection.crisis).toContain('leilão')
  })

  it('captura execução fiscal com agro keyword (P1-08)', () => {
    const r = atoToLeads(ato(
      'EXECUCAO FISCAL N. 1234/2025',
      'Execução fiscal contra produtor rural pessoa jurídica AGRO PEC LTDA, soja, CNPJ 11.222.333/0001-44',
    ))
    expect(r.leads.length).toBeGreaterThan(0)
  })

  it('captura RJ com frigorífico (agro keyword ampliado P1-08)', () => {
    const r = atoToLeads(ato(
      'INTIMACAO PARA RECUPERACAO JUDICIAL',
      'Frigorífico XYZ Ltda, processo de recuperação judicial. CNPJ 55.444.333/0001-55',
    ))
    expect(r.leads.length).toBeGreaterThan(0)
    expect(r.detection.crisis).toContain('recuperação judicial')
  })

  it('descarta título administrativo (PORTARIA)', () => {
    const r = atoToLeads(ato('PORTARIA INTERNA', 'Nomeação de servidor'))
    expect(r.leads).toHaveLength(0)
    expect(r.discardReason).toBe('titulo_administrativo')
  })

  it('descarta sem documento mesmo com agro+crise', () => {
    const r = atoToLeads(ato(
      'EDITAL DE LEILAO PUBLICO',
      'Leilão de bens da fazenda XYZ, soja, sem CPF/CNPJ no texto',
    ))
    expect(r.leads).toHaveLength(0)
    expect(r.discardReason).toBe('sem_documento')
  })
})
