// ============================================================
// Inventário patrimonial — types
// ============================================================
// Modelo rico de patrimônio do cliente agro. Cobre:
//   - maquinário (trator, colheitadeira, pulverizador)
//   - veículos (caminhão, camioneta, carro)
//   - imóveis rurais (fazendas, sítios, glebas)
//   - benfeitorias (armazém, galpão, silo, curral)
//   - implementos (grade, arado, plantadeira, distribuidor)
//   - animais (cabeças de gado, plantel, semoventes)
//   - estoque (grão armazenado, insumos, sementes)
//
// Cada tipo tem campos base (id, aquisicaoEm, valorAtual, ativo, obs)
// + campos específicos. Tudo serializável em JSON simples.
// ============================================================

export type TipoPatrimonio =
  | 'maquinario'
  | 'veiculo'
  | 'imovel_rural'
  | 'benfeitoria'
  | 'implemento'
  | 'animal'
  | 'estoque'

export interface PatrimonioBase {
  id: string
  clienteId: string
  tipo: TipoPatrimonio
  nome: string
  descricao?: string
  aquisicaoEm?: string          // YYYY-MM-DD
  valorAquisicao?: number
  valorAtual?: number           // valor de mercado atualizado (ou depreciado)
  status: 'ativo' | 'vendido' | 'baixado' | 'manutencao'
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
  /** Documentos vinculados (ids do DocumentIntakeService). */
  documentos?: string[]
  /** Se pode ser dado em garantia (penhor, alienação fiduciária, hipoteca). */
  garantiaDisponivel?: boolean
  /** Valor típico de avaliação para garantia bancária (70-80% do valor atual). */
  valorGarantia?: number
}

export interface Maquinario extends PatrimonioBase {
  tipo: 'maquinario'
  categoria: 'trator' | 'colheitadeira' | 'pulverizador' | 'semeadora' | 'bagger' | 'carregadeira' | 'outro'
  marca: string
  modelo: string
  ano?: number
  numeroSerie?: string
  chassi?: string
  horimetro?: number            // horas de uso
  potenciaCv?: number           // cavalos
  combustivel?: 'diesel' | 'gasolina' | 'eletrico'
  licenciamento?: string        // quando aplicável (trator licenciado)
  fornecedorManutencao?: string
}

export interface Veiculo extends PatrimonioBase {
  tipo: 'veiculo'
  categoria: 'caminhao' | 'camioneta' | 'carro' | 'moto' | 'outro'
  marca: string
  modelo: string
  ano: number
  placa: string
  renavam?: string
  chassi?: string
  cor?: string
  kilometragem?: number
  combustivel: 'diesel' | 'flex' | 'gasolina' | 'eletrico'
  uso?: 'operacional' | 'administrativo' | 'particular'
}

export interface ImovelRural extends PatrimonioBase {
  tipo: 'imovel_rural'
  denominacao: string
  matricula?: string            // matrícula no cartório
  municipio: string
  uf: string
  areaTotalHa: number
  areaProdutivaHa?: number
  codigoCar?: string            // código SICAR (UF-XXXXXX-HASH)
  codigoCcir?: string           // CCIR (INCRA)
  codigoItr?: string            // ITR (Receita)
  codigoNirf?: string
  titularidade?: 'propria' | 'arrendada' | 'comodato' | 'parceria'
  culturasPrincipais?: string[] // ["soja","milho","pastagem"]
  coordenadas?: { lat: number; lon: number }
}

export interface Benfeitoria extends PatrimonioBase {
  tipo: 'benfeitoria'
  categoria: 'armazem' | 'galpao' | 'silo' | 'curral' | 'casa_sede' | 'poco' | 'cerca' | 'estrada' | 'outro'
  areaM2?: number
  capacidade?: string           // "8000 sacas", "500 cabeças"
  imovelRuralId?: string        // vinculado a qual imóvel
  estadoConservacao?: 'novo' | 'bom' | 'regular' | 'ruim'
}

export interface Implemento extends PatrimonioBase {
  tipo: 'implemento'
  categoria: 'grade' | 'arado' | 'plantadeira' | 'cultivador' | 'distribuidor_adubo' | 'roçadeira' | 'reboque' | 'outro'
  marca?: string
  modelo?: string
  ano?: number
  numeroSerie?: string
  larguraOperacionalM?: number
}

export interface Animal extends PatrimonioBase {
  tipo: 'animal'
  especie: 'bovino' | 'suino' | 'ovino' | 'aves' | 'equino' | 'outro'
  categoria?: string            // "matriz", "bezerro", "garrote", "touro"
  rebanho?: string              // nome do plantel
  quantidade: number
  idadeMedia?: string           // "2 anos"
  pesoMedioKg?: number
  valorPorCabeca?: number
  raca?: string
}

export interface Estoque extends PatrimonioBase {
  tipo: 'estoque'
  categoria: 'grao' | 'semente' | 'fertilizante' | 'defensivo' | 'combustivel' | 'racao' | 'outro'
  produto: string               // "soja", "milho em grão", "NPK 10-10-10"
  quantidade: number
  unidade: 'sacas' | 'ton' | 'kg' | 'l' | 'm3' | 'un'
  localArmazenamento?: string
  dataColheita?: string
  valorUnitario?: number
  cprVinculadaId?: string       // CPR emitida sobre este estoque
}

export type Patrimonio =
  | Maquinario
  | Veiculo
  | ImovelRural
  | Benfeitoria
  | Implemento
  | Animal
  | Estoque

export interface InventarioCliente {
  clienteId: string
  atualizadoEm: string
  ativos: Patrimonio[]
  /** Métricas derivadas — calculadas ao salvar. */
  resumo: {
    totalAtivos: number
    valorTotalAtual: number
    valorGarantiaTotal: number
    porTipo: Record<TipoPatrimonio, { count: number; valor: number }>
  }
}
