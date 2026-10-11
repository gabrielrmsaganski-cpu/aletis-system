import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContratoGerado } from '../../src/services/ContratoGenerator.js'
import { GeneratedContractCatalog, prepareGeneratedContractRecord, type GeneratedContractPersistence, type GeneratedContractRecord } from '../../src/services/contratos/GeneratedContractCatalog.js'
import { formatContractMoney, normalizeContractMoney } from '../../src/lib/contract-money.js'

const generated = (): ContratoGerado => ({
  id: 'ctr-legacy-mesmo-milissegundo', tipo: 'confissao_divida', titulo: 'Contrato sintético',
  dataGeracao: '2026-09-07T00:00:00.000Z', partes: { devedor: 'Pessoa sintética', credor: 'Credor sintético' },
  valorTotal: 100.01, conteudoMarkdown: '# Contrato sintético\nConteúdo preservado.',
  metadados: { clausulas: 1, fundamentoLegal: ['Código Civil'], necessarioRevisao: ['Revisão jurídica'] },
})

function persistence(): GeneratedContractPersistence {
  const records = new Map<string, GeneratedContractRecord>()
  return {
    enabled: vi.fn(() => true),
    insert: vi.fn(async record => { records.set(record.id, structuredClone(record)); return record }),
    list: vi.fn(async () => structuredClone([...records.values()])),
    get: vi.fn(async id => structuredClone(records.get(id) ?? null)),
    delete: vi.fn(async id => records.delete(id)),
  }
}

afterEach(() => vi.restoreAllMocks())

describe('catálogo jurídico com confirmação de persistência', () => {
  it('preparação do acervo legado mantém ID, conteúdo e URLs existentes', () => {
    const original = generated()
    const prepared = prepareGeneratedContractRecord(original)
    expect(prepared.id).toBe(original.id)
    expect(prepared.conteudoMarkdown).toBe(original.conteudoMarkdown)
    expect(prepared.documento.pdfUrl).toBe(`/api/contratos/${original.id}/pdf`)
  })

  it('não confirma origem sem banco capaz de verificar o vínculo', async () => {
    const repository = persistence()
    vi.mocked(repository.enabled).mockReturnValue(false)
    const catalog = new GeneratedContractCatalog(repository)
    await expect(catalog.create(generated(), { clienteId: 'cliente-não-verificado' })).rejects.toThrow('PostgreSQL')
    expect(await catalog.list()).toEqual([])
  })

  it('não publica no cache nem resolve a criação enquanto o banco não confirmou', async () => {
    const repository = persistence()
    let commit!: (record: GeneratedContractRecord) => void
    let pendingRecord!: GeneratedContractRecord
    vi.mocked(repository.insert).mockImplementation(record => {
      pendingRecord = record
      return new Promise(resolve => { commit = resolve })
    })
    const catalog = new GeneratedContractCatalog(repository)
    const creating = catalog.create(generated())
    vi.mocked(repository.enabled).mockReturnValue(false)
    expect(await catalog.list()).toEqual([])
    commit(pendingRecord)
    const created = await creating
    expect(await catalog.get(created.id)).toEqual(created)
  })

  it('falha de inserção não deixa registro fantasma no cache', async () => {
    const repository = persistence()
    vi.mocked(repository.insert).mockRejectedValueOnce(new Error('falha sintética do banco'))
    const catalog = new GeneratedContractCatalog(repository)
    await expect(catalog.create(generated())).rejects.toThrow('falha sintética')
    vi.mocked(repository.enabled).mockReturnValue(false)
    expect(await catalog.list()).toEqual([])
  })

  it('falha de exclusão preserva o cache confirmado e propaga o erro', async () => {
    const repository = persistence()
    const catalog = new GeneratedContractCatalog(repository)
    const created = await catalog.create(generated())
    vi.mocked(repository.delete).mockRejectedValueOnce(new Error('falha sintética do banco'))
    await expect(catalog.delete(created.id)).rejects.toThrow('falha sintética')
    vi.mocked(repository.enabled).mockReturnValue(false)
    expect(await catalog.get(created.id)).toEqual(created)
  })

  it('leitura PG falha explicitamente e não usa cópia antiga para declarar sucesso', async () => {
    const repository = persistence()
    const catalog = new GeneratedContractCatalog(repository)
    const created = await catalog.create(generated())
    vi.mocked(repository.get).mockRejectedValueOnce(new Error('banco indisponível'))
    await expect(catalog.get(created.id)).rejects.toThrow('banco indisponível')
  })

  it('outra instância remove o registro e a primeira descarta a cópia antiga', async () => {
    const repository = persistence()
    const first = new GeneratedContractCatalog(repository)
    const second = new GeneratedContractCatalog(repository)
    const created = await first.create(generated())
    expect(await second.get(created.id)).toEqual(created)
    expect(await second.delete(created.id)).toBe(true)
    expect(await first.get(created.id)).toBeNull()
    vi.mocked(repository.enabled).mockReturnValue(false)
    expect(await first.get(created.id)).toBeNull()
  })

  it('criações no mesmo milissegundo recebem IDs independentes e links estáveis', async () => {
    const repository = persistence()
    const catalog = new GeneratedContractCatalog(repository)
    vi.spyOn(Date, 'now').mockReturnValue(123456789)
    const created = await Promise.all(Array.from({ length: 50 }, () => catalog.create(generated())))
    expect(new Set(created.map(record => record.id)).size).toBe(50)
    for (const record of created) {
      expect(record.documento.pdfUrl).toBe(`/api/contratos/${record.id}/pdf`)
      expect(record.documento.markdownUrl).toBe(`/api/contratos/${record.id}/markdown`)
      expect(record.valorTotal).toBe('100.01')
    }
  })

  it('alterações no retorno não modificam o cache nem o contrato confirmado', async () => {
    const repository = persistence()
    vi.mocked(repository.enabled).mockReturnValue(false)
    const catalog = new GeneratedContractCatalog(repository)
    const created = await catalog.create(generated())
    created.metadados.fundamentoLegal.push('alteração externa')
    expect((await catalog.get(created.id))?.metadados.fundamentoLegal).toEqual(['Código Civil'])
  })
})

describe('fronteira decimal e apresentação do contrato', () => {
  it('mantém centavos além do limite de inteiros seguros', () => {
    expect(normalizeContractMoney('90071992547409.99')).toBe('90071992547409.99')
    expect(formatContractMoney('90071992547409.99')).toBe('R$\u00a090.071.992.547.409,99')
  })
  it('arredonda a saída legada em centavos sem nova conta binária', () => {
    expect(normalizeContractMoney('0.30000000000000004')).toBe('0.30')
    expect(normalizeContractMoney('1.005')).toBe('1.01')
    expect(normalizeContractMoney('1e-7')).toBe('0.00')
    expect(normalizeContractMoney('1e2')).toBe('100.00')
  })
  it.each(['NaN', 'Infinity', '-1', '10000000000000000.00', '<script>'])('rejeita valor inválido %s', raw => {
    expect(() => normalizeContractMoney(raw)).toThrow()
  })
})
