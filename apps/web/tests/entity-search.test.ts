import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { clientSearchEntities, proposalSearchEntities, filterSearchEntities } from '../src/navigation/entitySearch'

test('busca clientes por termos em campos diferentes, ignorando acentos', () => {
  const entities = clientSearchEntities([{ id: 'cli-1', nome: 'João da Silva', cidade: 'Canarana', uf: 'MT', credor: 'Banco do Brasil' }])
  assert.equal(filterSearchEntities(entities, 'joao brasil').items[0]?.route, '/clientes/cli-1')
  assert.equal(filterSearchEntities(entities, 'canarana').total, 1)
  assert.equal(filterSearchEntities(entities, 'cliente inexistente').total, 0)
})

test('a busca não inventa entidades quando faltam dados ou identificador', () => {
  assert.deepEqual(clientSearchEntities([null, { nome: 'Sem identificador' }]), [])
  assert.deepEqual(proposalSearchEntities([]), [])
  assert.throws(() => clientSearchEntities({ data: 'inválida' }))
})

test('propostas são localizadas pelo identificador e abrem o registro correto', () => {
  const entities = proposalSearchEntities([{ id: 'PROP 42/2026', titulo: 'Liquidação rural', clienteNome: 'Maria', credor: 'Sicredi', status: 'em_analise' }])
  const result = filterSearchEntities(entities, '42/2026').items[0]
  assert.equal(result?.route, '/propostas?proposta=PROP%2042%2F2026')
  assert.equal(result?.status, 'em analise')
  assert.equal(filterSearchEntities(entities, 'maria sicredi').total, 1)
})

test('limita resultados preservando a contagem e a ordem estável', () => {
  const entities = clientSearchEntities(Array.from({ length: 10 }, (_, index) => ({ id: `cli-${index}`, nome: `Cliente ${index}` })))
  const result = filterSearchEntities(entities, 'cliente')
  assert.equal(result.items.length, 6)
  assert.equal(result.total, 10)
  assert.deepEqual(filterSearchEntities(entities, 'cliente'), result)
  assert.equal(filterSearchEntities(entities, 'cliente', 2).items.length, 2)
})

test('prioriza o início do nome e não retorna registros para consulta vazia', () => {
  const entities = clientSearchEntities([{ id: '1', nome: 'Carlos', cidade: 'São Paulo' }, { id: '2', nome: 'Paulo Andrade' }])
  assert.equal(filterSearchEntities(entities, 'paulo').items[0]?.id, 'cliente:2')
  assert.deepEqual(filterSearchEntities(entities, '  '), { items: [], total: 0 })
})
