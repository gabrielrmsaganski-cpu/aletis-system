import { test } from 'node:test';
import assert from 'node:assert';
import { classifyAgroDoc } from '../../src/services/alix/intake/AgroDocClassifier.ts';

test('classifica CCIR corretamente', () => {
  const text = `CERTIFICADO DE CADASTRO DE IMÓVEL RURAL - CCIR
    INCRA - Instituto Nacional de Colonização e Reforma Agrária
    Código do Imóvel Rural: 123.456.789-0
    Área Total: 2.345,50 ha
    Módulos Fiscais: 15,5
    Município: PRIMAVERA DO LESTE
    UF: MT
    Proprietário: FRANCISCO SILVA FAZENDA`;
  const c = classifyAgroDoc(text);
  assert.strictEqual(c.tipo, 'CCIR');
  assert.ok(c.confianca > 0.5);
  assert.strictEqual((c.camposExtraidos as any).codigoImovel, '123.456.789-0');
  assert.strictEqual((c.camposExtraidos as any).areaTotalHa, 2345.5);
  assert.strictEqual((c.camposExtraidos as any).uf, 'MT');
});

test('classifica CAR com código válido', () => {
  const text = `DEMONSTRATIVO DO IMÓVEL - CADASTRO AMBIENTAL RURAL
    Código CAR: MT-5107602-4D4AA999BB4E4F17BC8E3A4D5B0C6F2A3D
    Área do Imóvel: 1.500,00 ha
    Reserva Legal: 300,00 ha
    Área de Preservação Permanente: 120,50 ha`;
  const c = classifyAgroDoc(text);
  assert.strictEqual(c.tipo, 'CAR');
  assert.ok(String((c.camposExtraidos as any).codigoCar).startsWith('MT-'));
  assert.strictEqual((c.camposExtraidos as any).areaImovelHa, 1500);
});

test('classifica contrato crédito rural (Pronaf)', () => {
  const text = `CÉDULA DE CRÉDITO RURAL
    Linha: Pronaf Custeio
    Valor do contrato: R$ 85.000,00
    Taxa de juros: 4,5% a.a.
    Prazo total: 12 meses
    Safra: 2025/26
    Custeio agrícola`;
  const c = classifyAgroDoc(text);
  assert.strictEqual(c.tipo, 'CONTRATO_CREDITO_RURAL');
  assert.strictEqual((c.camposExtraidos as any).linhaCredito, 'PRONAF');
  assert.strictEqual((c.camposExtraidos as any).valorContrato, 85000);
  assert.strictEqual((c.camposExtraidos as any).taxaPctAnual, 4.5);
});

test('classifica matrícula com ônus', () => {
  const text = `CERTIDÃO DA MATRÍCULA Nº 45.678
    CARTÓRIO DE REGISTRO DE IMÓVEIS - MT
    Livro: 2
    R-5 HIPOTECA em favor do BANCO DO BRASIL
    R-8 PENHORA nos autos do processo nº ...`;
  const c = classifyAgroDoc(text);
  assert.strictEqual(c.tipo, 'MATRICULA');
  assert.strictEqual((c.camposExtraidos as any).numeroMatricula, '45678');
  assert.strictEqual((c.camposExtraidos as any).temOnus, true);
  assert.strictEqual((c.camposExtraidos as any).hipotecasCount, 1);
});

test('documento sem relação agro retorna OUTRO', () => {
  const text = 'Fatura de energia elétrica CEMIG valor 450 reais vencimento.';
  const c = classifyAgroDoc(text);
  assert.strictEqual(c.tipo, 'OUTRO');
  assert.strictEqual(c.confianca, 0);
});
