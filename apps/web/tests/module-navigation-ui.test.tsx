import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchField from '../src/components/ui/SearchField'
import ViewSwitch from '../src/components/ui/ViewSwitch'
import Contratos from '../src/pages/Contratos'

const { mutation } = vi.hoisted(() => ({ mutation: vi.fn() }))
vi.mock('../src/hooks/useApi', () => ({
  apiFetch: mutation,
  useApi: (path: string) => ({ loading: false, refetch: vi.fn(), data: path === '/contratos/tipos'
    ? [{tipo:'cpr_financeira',titulo:'CPR Financeira',quando:'Crédito rural',fundamento:['Base do modelo']},{tipo:'cpr_fisica',titulo:'CPR Física',quando:'Produção rural',fundamento:['Base do modelo']}]
    : [{id:'a',tipo:'cpr_financeira',titulo:'Operação Alfa',partes:{devedor:'Maria',credor:'Banco A'},valorTotal:'1234.56',dataGeracao:'2026-10-01'}, {id:'b',tipo:'cpr_fisica',titulo:'Operação Beta',partes:{devedor:'João',credor:'Banco B'},valorTotal:'2000.00',dataGeracao:'2026-10-02'}] })
}))

let host: HTMLDivElement, root: Root
beforeEach(() => { (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true; mutation.mockClear(); host=document.createElement('div');document.body.append(host);root=createRoot(host) })
afterEach(async()=>{await act(async()=>root.unmount());host.remove()})
async function input(el: HTMLInputElement, value: string) { await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))}) }
async function select(el: HTMLSelectElement, value: string) {await act(async()=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))})}
function button(text: string) {return [...host.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.textContent?.includes(text))!}

describe('Busca e navegação dos módulos',()=>{
  it('associa label, permite limpar a busca e devolve o foco ao campo',async()=>{
    function Demo(){const [value,setValue]=useState('Maria');return <SearchField label="Buscar contratos" value={value} onChange={setValue} />}
    await act(async()=>root.render(<Demo />));const field=host.querySelector('input')!;
    expect(host.querySelector('label')?.htmlFor).toBe(field.id);
    await act(async()=>host.querySelector('button')!.click());
    expect(field.value).toBe('');expect(document.activeElement).toBe(field);
    expect(host.querySelector('button')).toBeNull();
  });
  it('anuncia a visualização ativa e mantém os valores originais do consumidor',async()=>{
    const change=vi.fn();await act(async()=>root.render(<ViewSwitch label="Visualização" value="table" onChange={change} options={[{value:'table',label:'Lista'},{value:'card',label:'Cartões'}]} />));
    expect(host.querySelector('[aria-pressed=true]')?.textContent).toBe('Lista');
    await act(async()=>button('Cartões').click());expect(change).toHaveBeenCalledWith('card');
  });
  it('abre contratos gerados primeiro, sem esconder a ação de criação',async()=>{
    await act(async()=>root.render(<Contratos />));
    expect(host.querySelector('[aria-current=page]')?.textContent).toContain('Contratos gerados');
    expect(button('Novo Contrato')).toBeTruthy();expect(host.textContent).toContain('Operação Alfa');expect(host.textContent).toContain('Operação Beta');
    expect(mutation).not.toHaveBeenCalled();
  });
  it('filtra por partes e tipo, limpa todos os filtros e preserva os registros',async()=>{
    await act(async()=>root.render(<Contratos />));
    await input(host.querySelector('input')!,'Maria');expect(host.textContent).toContain('Operação Alfa');expect(host.textContent).not.toContain('Operação Beta');
    await select(host.querySelector('select')!,'cpr_fisica');expect(host.textContent).toContain('Nenhum contrato para estes filtros');
    await act(async()=>button('Limpar filtros').click());expect(host.textContent).toContain('Operação Alfa');expect(host.textContent).toContain('Operação Beta');expect(mutation).not.toHaveBeenCalled();
  });
  it('mantém os filtros ao consultar modelos e voltar à lista',async()=>{
    await act(async()=>root.render(<Contratos />));await input(host.querySelector('input')!,'Banco B');
    await act(async()=>button('Modelos disponíveis').click());expect(host.textContent).toContain('Tipos de contrato suportados');expect(host.textContent).toContain('Base do modelo');
    await act(async()=>button('Contratos gerados').click());expect(host.querySelector('input')!.value).toBe('Banco B');expect(host.textContent).toContain('Operação Beta');expect(host.textContent).not.toContain('Operação Alfa');expect(mutation).not.toHaveBeenCalled();
  });
})
