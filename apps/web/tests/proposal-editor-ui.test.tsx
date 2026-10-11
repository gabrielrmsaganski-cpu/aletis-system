// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ClientePropostasTab from '../src/components/cliente/ClientePropostasTab'
import { ApiError, apiFetch, apiFetchFull } from '../src/hooks/useApi'

vi.mock('../src/hooks/useApi', async importOriginal => ({ ...await importOriginal<typeof import('../src/hooks/useApi')>(), apiFetch: vi.fn(), apiFetchFull: vi.fn() }))

const original = () => ({ id: 'prop-ui-offline', clienteId: 'client-ui-offline', revision: 4, titulo: 'Proposta sintética', credor: 'Banco Exemplo', tipo: 'renegociacao', status: 'enviada', valorDivida: '1000.00', valorProposta: '850.00', descontoPercentual: 15, itens: [], condicoes: ['Revisão jurídica'], fundamentacao: 'Fundamentação sintética', observacoes: 'Nota inicial', dataCriacao: '2026-09-07', dataValidade: '2026-10-07' })
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  vi.mocked(apiFetch).mockResolvedValue([original()])
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers() })
async function render(onLinksChange = vi.fn()) { await act(async () => root.render(<ClientePropostasTab clienteId="client-ui-offline" onLinksChange={onLinksChange} />)) }
function textarea(value: string): HTMLTextAreaElement { return [...host.querySelectorAll('textarea')].find(input => input.value === value)! }
async function type(input: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(label: string) { const button = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === label)!; expect(button, label).toBeTruthy(); await act(async () => button.click()) }

describe('Editor no CRM: revisão e gravação explícita de aceite', () => {
  it('exige Salvar para confirmar status e bloqueia os termos após aceite', async () => {
    const linked = vi.fn()
    vi.mocked(apiFetchFull).mockResolvedValue({ success: true, data: { ...original(), status: 'aceita', revision: 5 }, meta: { negociacaoId: 'neg-ui', contratoId: 'contract-ui' } })
    await render(linked)
    const status = [...host.querySelectorAll('select')].find(select => select.value === 'enviada')!
    await act(async () => { status.value = 'aceita'; status.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(apiFetchFull).not.toHaveBeenCalled()
    await click('Salvar')
    expect(JSON.parse(vi.mocked(apiFetchFull).mock.calls[0][1]!.body as string)).toEqual({ status: 'aceita', expectedRevision: 4 })
    expect(linked).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('rascunho contratual vinculados')
    expect([...host.querySelectorAll('fieldset')].every(fieldset => fieldset.disabled)).toBe(true)
    expect(textarea('Nota inicial').disabled).toBe(false)
    expect(textarea('Fundamentação sintética').disabled).toBe(true)
  })

  it('uma resposta atrasada mantém a nota digitada depois e o próximo autosave usa nova revisão', async () => {
    let finish!: (response: unknown) => void
    vi.mocked(apiFetchFull).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    vi.mocked(apiFetchFull).mockResolvedValueOnce({ data: { ...original(), observacoes: 'Nota final', revision: 6 } })
    await render()
    await type(textarea('Nota inicial'), 'Nota enviada')
    await act(async () => vi.advanceTimersByTimeAsync(1300))
    expect(apiFetchFull).toHaveBeenCalledTimes(1)
    await type(textarea('Nota enviada'), 'Nota final')
    await act(async () => vi.advanceTimersByTimeAsync(1300))
    expect(apiFetchFull).toHaveBeenCalledTimes(1)
    await act(async () => finish({ data: { ...original(), observacoes: 'Nota enviada', revision: 5 } }))
    expect(textarea('Nota final')).toBeTruthy()
    await act(async () => vi.advanceTimersByTimeAsync(1300))
    expect(JSON.parse(vi.mocked(apiFetchFull).mock.calls[1][1]!.body as string)).toEqual({ observacoes: 'Nota final', expectedRevision: 5 })
  })

  it('409 pausa as tentativas e mantém a edição até comparação e reaplicação explícita', async () => {
    vi.mocked(apiFetchFull).mockRejectedValueOnce(new ApiError('Outra gravação alterou a proposta.', 409, 'REVISION_CONFLICT'))
    await render()
    await type(textarea('Nota inicial'), 'Minha observação')
    await act(async () => vi.advanceTimersByTimeAsync(1300))
    expect(host.textContent).toContain('Sua edição foi preservada')
    expect(textarea('Minha observação')).toBeTruthy()
    await act(async () => vi.advanceTimersByTimeAsync(10000))
    expect(apiFetchFull).toHaveBeenCalledTimes(1)
    vi.mocked(apiFetch).mockResolvedValueOnce({ ...original(), credor: 'Credor atualizado', revision: 5 })
    await click('Comparar com versão atual')
    await click('Reaplicar minhas alterações para revisão')
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(apiFetchFull).toHaveBeenCalledTimes(1)
    vi.mocked(apiFetchFull).mockResolvedValueOnce({ data: { ...original(), credor: 'Credor atualizado', observacoes: 'Minha observação', revision: 6 } })
    await click('Salvar')
    expect(JSON.parse(vi.mocked(apiFetchFull).mock.calls[1][1]!.body as string)).toEqual({ observacoes: 'Minha observação', expectedRevision: 5 })
  })

  it.each(['enviada', 'aceita', 'rejeitada', 'expirada'])('preserva exclusão de proposta com trilha comercial: %s', async status => {
    vi.mocked(apiFetch).mockResolvedValueOnce([{ ...original(), status }])
    await render()
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Remover proposta"]')?.disabled).toBe(true)
  })

  it('exclusão de rascunho envia a revisão carregada', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([{ ...original(), status: 'rascunho' }])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await render()
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remover proposta"]')!.click())
    expect(apiFetch).toHaveBeenCalledWith('/propostas/prop-ui-offline?expectedRevision=4', { method: 'DELETE' })
    confirm.mockRestore()
  })
})
