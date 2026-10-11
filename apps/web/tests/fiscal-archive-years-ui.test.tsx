// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FiscalDocumentSearch } from '@aletis/shared-types'
import { FiscalArchive } from '../src/pages/portal/FiscalArchive'

const emptyArchive: FiscalDocumentSearch = {
  documentos: [], pagina: 1, limite: 25, total: 0, paginas: 0,
  resumo: {
    registros: 0, completas: 0, resumos: 0, eventos: 0, notasUnicas: 0,
    semXml: 0, canceladas: 0, pendentesCrm: 0, falhasCrm: 0,
    emitidas: 0, recebidas: 0, valorEmitidas: '0.00', valorRecebidas: '0.00',
    meses: [], contrapartes: [],
  },
}

describe('seleção de anos do acervo fiscal', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })

  it('abre o Paulo preparado de 2021 até o ano atual e envia o recorte ao servidor', async () => {
    const call = vi.fn(async () => emptyArchive)
    await act(async () => root.render(<FiscalArchive call={call} base="/api/clientes/cli-002/portal/fiscal/conexao" staff revision="r1" defaultFromYear={2021}/>))
    const expected = Array.from({ length: new Date().getFullYear() - 2021 + 1 }, (_, index) => String(2021 + index)).join('%2C')
    expect(call.mock.calls[0][0]).toContain(`anos=${expected}`)
    expect(host.textContent).toContain('Paulo abre preparado de 2021 até hoje')
    expect([...host.querySelectorAll('fieldset input[type=checkbox]')]).toHaveLength(new Date().getFullYear() - 2021 + 1)
  })

  it('permite combinar anos não consecutivos e usa a mesma seleção na pesquisa', async () => {
    const call = vi.fn(async () => emptyArchive)
    await act(async () => root.render(<FiscalArchive call={call} base="/api/portal/fiscal/conexao" staff={false} revision="r1"/>))
    const labels = [...host.querySelectorAll('fieldset label')]
    const year2024 = labels.find(label => label.textContent === '2024')!.querySelector('input')!
    const currentYear = String(new Date().getFullYear())
    const yearCurrent = labels.find(label => label.textContent === currentYear)!.querySelector('input')!
    await act(async () => { year2024.click(); yearCurrent.click() })
    const apply = [...host.querySelectorAll('button')].find(item => item.textContent === 'Aplicar filtros')!
    await act(async () => apply.click())
    expect(call.mock.calls.at(-1)?.[0]).toContain(`anos=2024%2C${currentYear}`)
  })
})
