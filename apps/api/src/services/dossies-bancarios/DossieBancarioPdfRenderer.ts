import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import puppeteer, { type Browser } from 'puppeteer'
import { nomeBancoDossie, perfilCaso, type BancoDossieId, type ModeloBancarioManifest } from './manifest.js'
import type {
  ArquivoBancarioGerado,
  ClienteDossieInput,
  DadosCanonicosDossieInput,
} from './types.js'

interface ChecklistPdfItem {
  item: string
  origem: string
  etapa: string
  status: 'mapeado' | 'cliente' | 'validar'
}

interface ModeloPdf extends ModeloBancarioManifest {
  disponivel: boolean
}

export interface DossieBancarioPdfInput {
  banco: BancoDossieId
  perfilId: string
  cliente: ClienteDossieInput
  dados: DadosCanonicosDossieInput
  modelos: ModeloPdf[]
  checklist: ChecklistPdfItem[]
  arquivosGerados: ArquivoBancarioGerado[]
}

export interface DossieBancarioPdfResult {
  buffer: Buffer
  filename: string
  paginas: number
}

export interface DossieBancarioHtmlResult {
  html: string
  filename: string
  paginas: number
}

interface ContentPage {
  section: string
  eyebrow: string
  title: string
  description?: string
  body: string
}

let browserInstance: Browser | null = null

function html(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function text(value: unknown, fallback = 'Não informado'): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function safeFilename(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 70) || 'cliente'
}

function brl(value: unknown): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'Não informado'
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function number(value: unknown, decimals = 2): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'Não informado'
  return parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function date(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return 'Não informado'
  const parsed = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleDateString('pt-BR')
}

function sum(items: Array<number | undefined>): number {
  return items.reduce<number>((total, value) => total + (Number.isFinite(value) ? Number(value) : 0), 0)
}

function chunks<T>(items: T[], size: number): T[][] {
  if (!items.length) return [[]]
  const output: T[][] = []
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size))
  return output
}

function logoDataUrl(variant: 'dark' | 'cream'): string {
  const filename = variant === 'cream' ? 'principal-04.png' : 'principal-03.png'
  const candidates = [
    process.env.ALETIS_PDF_LOGO_DIR ? resolve(process.env.ALETIS_PDF_LOGO_DIR, filename) : '',
    resolve(process.cwd(), '../web/public/brand/logos', filename),
    resolve(process.cwd(), 'apps/web/public/brand/logos', filename),
    resolve(process.cwd(), '../../apps/web/public/brand/logos', filename),
    resolve('/root/ALETIS/aletis-system/apps/web/public/brand/logos', filename),
  ].filter(Boolean)
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) return ''
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`
}

function table(headers: string[], rows: Array<Array<string | number>>, options: {
  compact?: boolean
  rightColumns?: number[]
} = {}): string {
  if (!rows.length) return '<div class="empty">Nenhuma informação cadastrada neste bloco.</div>'
  const right = new Set(options.rightColumns ?? [])
  return `
    <table class="${options.compact ? 'compact' : ''}">
      <thead><tr>${headers.map((header, index) => `<th class="${right.has(index) ? 'right' : ''}">${html(header)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${right.has(index) ? 'right' : ''}">${html(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `
}

function keyValueGrid(items: Array<[string, unknown]>): string {
  return `<div class="key-grid">${items.map(([label, value]) => `
    <div class="key-item">
      <span>${html(label)}</span>
      <strong>${html(text(value))}</strong>
    </div>
  `).join('')}</div>`
}

function statusLabel(status: ChecklistPdfItem['status']): string {
  if (status === 'cliente') return 'Solicitar ao cliente'
  if (status === 'validar') return 'Validar'
  return 'Mapeado'
}

function statusClass(status: ChecklistPdfItem['status']): string {
  if (status === 'cliente') return 'status waiting'
  if (status === 'validar') return 'status review'
  return 'status ready'
}

function calculateCompleteness(input: DossieBancarioPdfInput) {
  const { cliente, dados } = input
  const checks: Array<[string, boolean]> = [
    ['Nome ou razão social', Boolean(cliente.nome)],
    ['CPF/CNPJ', Boolean(cliente.cpfCnpj)],
    ['Cidade e UF', Boolean(cliente.cidade && cliente.uf)],
    ['Telefone ou e-mail', Boolean(cliente.telefone || cliente.email)],
    ['Atividade principal', Boolean(cliente.atividade || dados.atividades?.length)],
    ['Objeto da operação', Boolean(dados.operacao?.cultura || dados.operacao?.finalidade)],
    ['Limite solicitado', Number.isFinite(Number(dados.operacao?.limiteSolicitado))],
    ['Prazo', Boolean(dados.operacao?.prazo)],
    ['Produção por safra', Boolean(dados.producoes?.length)],
    ['Imóveis ou arrendamentos', Boolean(dados.propriedades?.length || dados.arrendamentos?.length)],
    ['Endividamento', Boolean(dados.dividas?.length)],
  ]
  const completed = checks.filter(([, ok]) => ok).length
  return {
    percent: Math.round((completed / checks.length) * 100),
    completed,
    total: checks.length,
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
  }
}

function buildContentPages(input: DossieBancarioPdfInput): ContentPage[] {
  const pages: ContentPage[] = []
  const { cliente, dados } = input

  const groupRows = dados.grupoEconomico ?? []
  const companyRows = dados.empresas ?? []
  const groupChunks = chunks(groupRows, 12)
  groupChunks.forEach((group, index) => {
    const companies = index === 0 ? companyRows.slice(0, 8) : []
    pages.push({
      section: 'cadastro',
      eyebrow: '01. Cadastro',
      title: index ? 'Grupo econômico - continuação' : 'Identificação e grupo econômico',
      description: index ? undefined : 'Dados centrais reutilizados nos modelos bancários e documentos legais.',
      body: index === 0
        ? `
          ${keyValueGrid([
            ['Nome / Razão social', cliente.nome],
            ['CPF / CNPJ', cliente.cpfCnpj],
            ['Perfil', perfilCaso(input.perfilId).titulo],
            ['Atividade', cliente.atividade],
            ['Localidade', [cliente.cidade, cliente.uf].filter(Boolean).join('/')],
            ['Endereço', cliente.endereco],
            ['Telefone', cliente.telefone],
            ['E-mail', cliente.email],
          ])}
          <h3>Participantes do grupo</h3>
          ${table(
            ['Nome', 'CPF/CNPJ', 'Vínculo', 'Participação', 'Atua'],
            group.map((member) => [
              text(member.nome),
              text(member.cpfCnpj),
              text(member.parentesco),
              member.participacaoPct == null ? 'Não informado' : `${number(member.participacaoPct)}%`,
              member.atuaAtividade == null ? 'Não informado' : member.atuaAtividade ? 'Sim' : 'Não',
            ]),
            { compact: true, rightColumns: [3] },
          )}
          <h3>Empresas do grupo</h3>
          ${table(
            ['Razão social', 'CNPJ', 'Atividade', 'Faturamento anual'],
            companies.map((company) => [
              text(company.razaoSocial),
              text(company.cnpj),
              text(company.atividade),
              brl(company.faturamentoAnual),
            ]),
            { compact: true, rightColumns: [3] },
          )}
        `
        : table(
          ['Nome', 'CPF/CNPJ', 'Vínculo', 'Participação', 'Atua'],
          group.map((member) => [
            text(member.nome),
            text(member.cpfCnpj),
            text(member.parentesco),
            member.participacaoPct == null ? 'Não informado' : `${number(member.participacaoPct)}%`,
            member.atuaAtividade == null ? 'Não informado' : member.atuaAtividade ? 'Sim' : 'Não',
          ]),
          { rightColumns: [3] },
        ),
    })
  })

  const activities = dados.atividades ?? []
  pages.push({
    section: 'operacao',
    eyebrow: '02. Operação',
    title: 'Demanda de crédito e atividade',
    description: 'Síntese da solicitação apresentada ao banco e base econômica declarada.',
    body: `
      <div class="operation-band">
        <div><span>Limite solicitado</span><strong>${html(brl(dados.operacao?.limiteSolicitado))}</strong></div>
        <div><span>Cultura / objeto</span><strong>${html(text(dados.operacao?.cultura || dados.operacao?.finalidade))}</strong></div>
        <div><span>Prazo</span><strong>${html(text(dados.operacao?.prazo))}</strong></div>
      </div>
      ${keyValueGrid([
        ['Finalidade', dados.operacao?.finalidade],
        ['Garantias propostas', dados.operacao?.garantias],
        ['Data-base', date(dados.dataBase)],
        ['Responsável ALETIS', cliente.responsavel],
      ])}
      <h3>Atividades econômicas</h3>
      ${table(
        ['Atividade', 'Receita estimada'],
        activities.map((activity) => [text(activity.tipo), brl(activity.receitaEstimada)]),
        { rightColumns: [1] },
      )}
      <h3>Comentários da operação</h3>
      <div class="narrative">${html(text(dados.operacao?.comentarios || cliente.observacoes, 'Nenhum comentário registrado.'))}</div>
    `,
  })

  const properties = dados.propriedades ?? []
  const leases = dados.arrendamentos ?? []
  const propertyChunks = chunks(properties, 8)
  propertyChunks.forEach((propertyChunk, index) => {
    const leaseChunk = index === 0 ? leases.slice(0, 7) : []
    pages.push({
      section: 'patrimonio',
      eyebrow: '03. Patrimônio rural',
      title: index ? 'Imóveis rurais - continuação' : 'Imóveis, áreas e arrendamentos',
      description: index ? undefined : 'Estrutura territorial que sustenta a capacidade produtiva e as garantias.',
      body: `
        <h3>Áreas próprias</h3>
        ${table(
          ['Fazenda', 'Município/UF', 'Matrícula/CAR', 'Área total', 'Plantio', 'Avaliação'],
          propertyChunk.map((property) => [
            text(property.fazenda),
            text([property.municipio, property.uf].filter(Boolean).join('/')),
            text([property.matricula, property.car].filter(Boolean).join(' | ')),
            `${number(property.areaTotalHa)} ha`,
            `${number(property.areaPlantioHa)} ha`,
            brl(property.avaliacao),
          ]),
          { compact: true, rightColumns: [3, 4, 5] },
        )}
        ${index === 0 ? `
          <h3>Áreas arrendadas</h3>
          ${table(
            ['Fazenda', 'Município/UF', 'Área arrendada', 'Custo', 'Vencimento'],
            leaseChunk.map((lease) => [
              text(lease.fazenda),
              text([lease.municipio, lease.uf].filter(Boolean).join('/')),
              `${number(lease.areaArrendadaHa)} ha`,
              lease.custoScHa == null ? brl(lease.custoMensal) : `${number(lease.custoScHa)} sc/ha`,
              date(lease.vencimento),
            ]),
            { compact: true, rightColumns: [2, 3] },
          )}
        ` : ''}
      `,
    })
  })
  if (leases.length > 7) {
    chunks(leases.slice(7), 12).forEach((leaseChunk) => {
      pages.push({
        section: 'patrimonio',
        eyebrow: '03. Patrimônio rural',
        title: 'Arrendamentos - continuação',
        body: table(
          ['Fazenda', 'Proprietário', 'Município/UF', 'Área', 'Custo', 'Vencimento'],
          leaseChunk.map((lease) => [
            text(lease.fazenda),
            text(lease.proprietario),
            text([lease.municipio, lease.uf].filter(Boolean).join('/')),
            `${number(lease.areaArrendadaHa)} ha`,
            lease.custoScHa == null ? brl(lease.custoMensal) : `${number(lease.custoScHa)} sc/ha`,
            date(lease.vencimento),
          ]),
          { rightColumns: [3, 4] },
        ),
      })
    })
  }

  const productions = dados.producoes ?? []
  const livestock = dados.pecuaria ?? []
  chunks(productions, 10).forEach((productionChunk, index) => {
    pages.push({
      section: 'producao',
      eyebrow: '04. Produção',
      title: index ? 'Produção agrícola - continuação' : 'Produção agrícola e pecuária',
      description: index ? undefined : 'Histórico, safra atual e planejamento produtivo consolidados.',
      body: `
        <h3>Quadro agrícola</h3>
        ${table(
          ['Cultura', 'Período/Safra', 'Área própria', 'Área arrendada', 'Produtividade', 'Preço', 'Custo/ha'],
          productionChunk.map((production) => [
            text(production.cultura),
            `${text(production.periodo)} / ${text(production.safra)}`,
            `${number(production.areaPropriaHa)} ha`,
            `${number(production.areaArrendadaHa)} ha`,
            number(production.produtividade),
            brl(production.precoUnitario),
            brl(production.custoHa),
          ]),
          { compact: true, rightColumns: [2, 3, 4, 5, 6] },
        )}
        ${index === 0 ? `
          <h3>Pecuária</h3>
          ${table(
            ['Animal', 'Período', 'Ciclo', 'Quantidade', 'Comercializada', 'Preço/@', 'Área'],
            livestock.slice(0, 7).map((item) => [
              text(item.tipoAnimal),
              text(item.periodo),
              text(item.ciclo || item.sistemaCriacao),
              number(item.quantidadeTotal, 0),
              number(item.quantidadeComercializada, 0),
              brl(item.precoArroba),
              `${number(item.areaHa)} ha`,
            ]),
            { compact: true, rightColumns: [3, 4, 5, 6] },
          )}
        ` : ''}
      `,
    })
  })

  const debts = dados.dividas ?? []
  chunks(debts, 12).forEach((debtChunk, index) => {
    pages.push({
      section: 'endividamento',
      eyebrow: '05. Endividamento',
      title: index ? 'Dívidas bancárias - continuação' : 'Passivos e cronograma',
      description: index ? undefined : 'Posição declarada das obrigações financeiras do grupo.',
      body: `
        ${table(
          ['Tomador', 'Instituição', 'Contrato/Tipo', 'Vencimento', 'Moeda', 'Taxa', 'Saldo devedor'],
          debtChunk.map((debt) => [
            text(debt.tomador || cliente.nome),
            text(debt.instituicao),
            text([debt.contrato, debt.tipoCredito].filter(Boolean).join(' / ')),
            date(debt.vencimento),
            text(debt.moeda, 'BRL'),
            debt.taxaJuros == null ? 'Não informado' : `${number(debt.taxaJuros)}%`,
            brl(debt.saldoDevedor),
          ]),
          { compact: true, rightColumns: [5, 6] },
        )}
        ${index === 0 ? `
          <div class="total-band"><span>Saldo devedor informado</span><strong>${html(brl(sum(debts.map((debt) => debt.saldoDevedor))))}</strong></div>
          <h3>Dívidas com terras e fornecedores</h3>
          ${table(
            ['Origem', 'Descrição', 'Valor', 'Vencimento'],
            [
              ...(dados.dividasTerras ?? []).map((item) => ['Terras', text(item.descricao), brl(item.valorTotal), date(item.vencimentoFinal)]),
              ...(dados.fornecedores ?? []).map((item) => ['Fornecedor', text(item.nome), brl(item.valor), date(item.vencimento)]),
            ],
            { compact: true, rightColumns: [2] },
          )}
        ` : ''}
      `,
    })
  })

  const investments = dados.investimentos ?? []
  const buyers = dados.compradores ?? []
  const machines = dados.maquinas ?? []
  pages.push({
    section: 'comercial',
    eyebrow: '06. Comercial e investimento',
    title: 'Compradores, máquinas e expansão',
    description: 'Contratos de comercialização, ativos móveis e investimentos projetados.',
    body: `
      <h3>Principais compradores</h3>
      ${table(
        ['Comprador', 'Safra', 'Cultura', 'Volume', 'Preço unitário', 'Valor estimado'],
        buyers.slice(0, 8).map((buyer) => [
          text(buyer.nome),
          text(buyer.safra),
          text(buyer.cultura),
          number(buyer.volume),
          brl(buyer.precoUnitario),
          brl((buyer.volume ?? 0) * (buyer.precoUnitario ?? 0)),
        ]),
        { compact: true, rightColumns: [3, 4, 5] },
      )}
      <h3>Máquinas e equipamentos</h3>
      ${table(
        ['Tipo', 'Descrição', 'Marca/Ano', 'Valor', 'Ônus'],
        machines.slice(0, 8).map((machine) => [
          text(machine.tipo),
          text(machine.descricao),
          text([machine.marca, machine.ano].filter(Boolean).join(' / ')),
          brl(machine.valor),
          text(machine.onus),
        ]),
        { compact: true, rightColumns: [3] },
      )}
      <h3>Investimentos pretendidos</h3>
      ${table(
        ['Descrição', 'Data prevista', 'Área', 'Unidade', 'Valor total'],
        investments.slice(0, 7).map((investment) => [
          text(investment.descricao),
          date(investment.dataPrevista),
          `${number(investment.areaTotalHa)} ha`,
          text(investment.unidadePagamento, 'R$'),
          brl(investment.valorTotal),
        ]),
        { compact: true, rightColumns: [2, 4] },
      )}
    `,
  })

  chunks(input.checklist, 17).forEach((checklistChunk, index) => {
    pages.push({
      section: 'checklist',
      eyebrow: '07. Checklist',
      title: index ? 'Pendências documentais - continuação' : 'Checklist bancário inteligente',
      description: index ? undefined : 'Itens deduplicados conforme banco, perfil do caso e modelos aplicáveis.',
      body: `
        <div class="checklist">
          ${checklistChunk.map((item) => `
            <div class="check-row">
              <div>
                <strong>${html(item.item)}</strong>
                <span>${html(item.origem)} · ${html(item.etapa)}</span>
              </div>
              <em class="${statusClass(item.status)}">${html(statusLabel(item.status))}</em>
            </div>
          `).join('')}
        </div>
      `,
    })
  })

  pages.push({
    section: 'pacote',
    eyebrow: '08. Pacote técnico',
    title: 'Modelos e arquivos gerados',
    description: 'Rastreabilidade dos documentos incluídos no pacote bancário.',
    body: `
      <h3>Modelos aplicáveis</h3>
      ${table(
        ['Modelo', 'Formato', 'Categoria', 'Status', 'Disponível'],
        input.modelos.map((model) => [
          text(model.titulo),
          model.formato.toUpperCase(),
          text(model.categoria),
          text(model.status),
          model.disponivel ? 'Sim' : 'Não',
        ]),
        { compact: true },
      )}
      <h3>Arquivos preenchidos</h3>
      ${table(
        ['Arquivo', 'Modelo', 'Gravações', 'Higienizações', 'Fórmulas'],
        input.arquivosGerados.map((file) => [
          file.filename,
          file.modeloId,
          file.celulasGravadas,
          file.celulasHigienizadas,
          file.formulasAjustadas,
        ]),
        { compact: true, rightColumns: [2, 3, 4] },
      )}
      <div class="notice">
        Os arquivos originais permanecem separados para rastreabilidade. Antes do envio externo, utilizar somente versões revisadas da pasta <strong>04_ARQUIVOS_PREENCHIDOS</strong>.
      </div>
    `,
  })

  return pages
}

function styles(): string {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #17251b; font-family: Verdana, Arial, sans-serif; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pdf-page {
      width: 210mm;
      height: 297mm;
      padding: 14mm 14mm 17mm;
      position: relative;
      overflow: hidden;
      page-break-after: always;
      background: #fff;
    }
    .pdf-page:last-child { page-break-after: auto; }
    .cover { padding: 0; background: #17251b; color: #f5f2e7; }
    .cover-inner { height: 297mm; padding: 18mm 17mm 16mm; display: flex; flex-direction: column; position: relative; }
    .cover-logo { width: 118mm; height: auto; object-fit: contain; object-position: left center; }
    .cover-rule { width: 28mm; height: 1.5mm; background: #cb9d52; margin-top: 30mm; }
    .cover-kicker { margin-top: 8mm; color: #e3bd80; font-size: 9pt; font-weight: 700; text-transform: uppercase; }
    .cover h1 { margin: 4mm 0 0; max-width: 160mm; font-size: 31pt; line-height: 1.08; }
    .cover-client { margin-top: 8mm; font-size: 18pt; line-height: 1.25; color: #fff; }
    .cover-bank { margin-top: 3mm; font-size: 12pt; color: #cdd5c0; }
    .cover-meta {
      margin-top: auto;
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr;
      gap: 6mm;
      border-top: 0.4mm solid rgba(245,242,231,.22);
      padding-top: 7mm;
    }
    .cover-meta span { display: block; color: #b2bda1; font-size: 7pt; text-transform: uppercase; margin-bottom: 2mm; }
    .cover-meta strong { display: block; color: #fff; font-size: 9.5pt; line-height: 1.35; }
    .cover-confidential { margin-top: 7mm; font-size: 7pt; color: #b2bda1; text-transform: uppercase; }
    .cover-accent { position: absolute; left: 0; bottom: 0; width: 100%; height: 3mm; background: #cb9d52; }
    .page-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 0.35mm solid #d9d3bc; padding-bottom: 4mm; }
    .page-logo { width: 47mm; height: 11mm; object-fit: contain; object-position: left center; }
    .doc-meta { text-align: right; color: #6b7d6f; font-size: 6.5pt; line-height: 1.4; }
    .page-title { margin: 7mm 0 4mm; }
    .page-title .eyebrow { color: #a87f3d; font-size: 7pt; text-transform: uppercase; font-weight: 700; }
    .page-title h2 { font-size: 20pt; line-height: 1.15; margin: 2mm 0 0; }
    .page-title p { color: #465b4a; font-size: 8.5pt; line-height: 1.5; margin: 2mm 0 0; max-width: 165mm; }
    h3 { color: #17251b; font-size: 9pt; margin: 5mm 0 2.2mm; padding-bottom: 1.5mm; border-bottom: 0.35mm solid #e3bd80; }
    .page-footer {
      position: absolute;
      bottom: 7mm;
      left: 14mm;
      right: 14mm;
      border-top: 0.25mm solid #e9e3d2;
      padding-top: 2.5mm;
      display: flex;
      justify-content: space-between;
      color: #6b7d6f;
      font-size: 6.2pt;
    }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
    .summary-kpi { min-height: 26mm; border: 0.3mm solid #d9d3bc; border-top: 1.3mm solid #17251b; padding: 4mm; background: #fbf9f0; }
    .summary-kpi span { display: block; color: #6b7d6f; font-size: 6.5pt; text-transform: uppercase; font-weight: 700; line-height: 1.3; }
    .summary-kpi strong { display: block; margin-top: 2.5mm; font-size: 15pt; line-height: 1.15; }
    .summary-kpi small { display: block; color: #6b7d6f; font-size: 6.3pt; margin-top: 1.5mm; line-height: 1.3; }
    .executive { margin-top: 5mm; padding: 5mm; border-left: 1.2mm solid #cb9d52; background: #f5f2e7; font-size: 8.5pt; line-height: 1.6; }
    .index { margin-top: 5mm; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 8mm; }
    .index-row { display: flex; align-items: baseline; gap: 2mm; padding: 1.7mm 0; border-bottom: 0.25mm dotted #b2bda1; font-size: 7.5pt; }
    .index-row span:first-child { font-weight: 700; }
    .index-row i { flex: 1; }
    .index-row strong { color: #a87f3d; }
    .missing { margin-top: 5mm; padding: 4mm; border: 0.3mm solid #e3bd80; background: #fbf9f0; }
    .missing strong { display: block; font-size: 7.5pt; margin-bottom: 2mm; }
    .missing span { display: inline-block; margin: 0 1.5mm 1.5mm 0; padding: 1.2mm 2mm; border: 0.25mm solid #d9d3bc; font-size: 6.5pt; }
    .key-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 0.3mm solid #d9d3bc; }
    .key-item { min-height: 17mm; padding: 3.5mm 4mm; border-bottom: 0.25mm solid #e9e3d2; }
    .key-item:nth-child(odd) { border-right: 0.25mm solid #e9e3d2; }
    .key-item span { display: block; color: #6b7d6f; font-size: 6.2pt; text-transform: uppercase; font-weight: 700; margin-bottom: 1.5mm; }
    .key-item strong { display: block; font-size: 8.2pt; line-height: 1.35; overflow-wrap: anywhere; }
    .operation-band { display: grid; grid-template-columns: 1.25fr 1fr .8fr; border: 0.3mm solid #d9d3bc; border-top: 1.4mm solid #cb9d52; background: #fbf9f0; margin-bottom: 4mm; }
    .operation-band div { padding: 5mm; border-right: 0.25mm solid #d9d3bc; }
    .operation-band div:last-child { border-right: 0; }
    .operation-band span { display: block; color: #6b7d6f; font-size: 6.5pt; text-transform: uppercase; font-weight: 700; }
    .operation-band strong { display: block; margin-top: 2mm; font-size: 12pt; line-height: 1.25; }
    .narrative, .notice, .empty { padding: 4mm; background: #f5f2e7; border-left: 1mm solid #cb9d52; font-size: 7.7pt; line-height: 1.55; }
    .empty { color: #6b7d6f; border-left-color: #b2bda1; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7pt; line-height: 1.3; }
    thead { display: table-header-group; }
    th { padding: 2.4mm 2mm; background: #17251b; color: #fff; text-align: left; font-size: 6.2pt; text-transform: uppercase; overflow-wrap: anywhere; }
    td { padding: 2.5mm 2mm; border-bottom: 0.25mm solid #e9e3d2; vertical-align: top; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #fbf9f0; }
    table.compact { font-size: 6.6pt; }
    table.compact th { padding: 2mm 1.6mm; font-size: 5.8pt; }
    table.compact td { padding: 2mm 1.6mm; }
    th.right, td.right { text-align: right; }
    .total-band { margin-top: 4mm; padding: 4mm 5mm; display: flex; justify-content: space-between; align-items: center; background: #17251b; color: #fff; }
    .total-band span { font-size: 7pt; text-transform: uppercase; }
    .total-band strong { color: #e3bd80; font-size: 14pt; }
    .checklist { border-top: 0.3mm solid #d9d3bc; }
    .check-row { min-height: 12mm; padding: 2.4mm 1mm; border-bottom: 0.25mm solid #e9e3d2; display: grid; grid-template-columns: 1fr 35mm; gap: 4mm; align-items: center; }
    .check-row strong { display: block; font-size: 7pt; line-height: 1.35; }
    .check-row span { display: block; color: #6b7d6f; font-size: 6pt; margin-top: 1mm; }
    .status { display: inline-block; text-align: center; padding: 1.5mm 2mm; border: 0.25mm solid; font-size: 5.8pt; font-style: normal; font-weight: 700; }
    .status.ready { color: #2f7b55; border-color: #2f7b55; background: #eef8f2; }
    .status.waiting { color: #a87f3d; border-color: #cb9d52; background: #fbf6e8; }
    .status.review { color: #3f6476; border-color: #3f6476; background: #eef5f7; }
    .document-actions { position: fixed; z-index: 10; right: 20px; bottom: 20px; display: flex; gap: 10px; padding: 10px; border: 1px solid #d9d3bc; border-radius: 12px; background: rgba(255,255,255,.96); box-shadow: 0 12px 32px rgba(23,37,27,.18); }
    .document-actions button { cursor: pointer; border: 0; border-radius: 8px; padding: 10px 13px; background: #17251b; color: #fff; font: 700 12px Verdana, Arial, sans-serif; }
    .document-actions button:last-child { background: #cb9d52; color: #17251b; }
    @media screen and (max-width: 860px) { .pdf-page { width: 100%; height: auto; min-height: 297mm; } .cover-inner { height: 297mm; } .document-actions { right: 12px; bottom: 12px; } }
    @media print { .document-actions { display: none; } }
  `
}

function pageTemplate(page: ContentPage, pageNumber: number, totalPages: number, input: DossieBancarioPdfInput, darkLogo: string): string {
  return `
    <section class="pdf-page">
      <header class="page-header">
        ${darkLogo ? `<img class="page-logo" src="${darkLogo}" alt="ALETIS">` : '<strong>ALETIS</strong>'}
        <div class="doc-meta">
          ${html(nomeBancoDossie(input.banco))}<br>
          ${html(text(input.cliente.nome))} · ${html(date(input.dados.dataBase || new Date().toISOString()))}
        </div>
      </header>
      <div class="page-title">
        <div class="eyebrow">${html(page.eyebrow)}</div>
        <h2>${html(page.title)}</h2>
        ${page.description ? `<p>${html(page.description)}</p>` : ''}
      </div>
      ${page.body}
      <footer class="page-footer">
        <span>Documento confidencial · Uso restrito ao processo de crédito</span>
        <span>${pageNumber} / ${totalPages}</span>
      </footer>
    </section>
  `
}

function buildHtml(input: DossieBancarioPdfInput): { html: string; pages: number } {
  const contentPages = buildContentPages(input)
  const totalPages = contentPages.length + 2
  const creamLogo = logoDataUrl('cream')
  const darkLogo = logoDataUrl('dark')
  const completeness = calculateCompleteness(input)
  const totalDebt = sum((input.dados.dividas ?? []).map((debt) => debt.saldoDevedor))
  const totalArea = sum((input.dados.propriedades ?? []).map((property) => property.areaTotalHa))
    + sum((input.dados.arrendamentos ?? []).map((lease) => lease.areaArrendadaHa))
  const totalAssets = sum((input.dados.propriedades ?? []).map((property) => property.avaliacao))
    + sum((input.dados.maquinas ?? []).map((machine) => machine.valor))
  const pending = input.checklist.filter((item) => item.status === 'cliente').length

  const firstPageBySection = new Map<string, number>()
  contentPages.forEach((page, index) => {
    if (!firstPageBySection.has(page.section)) firstPageBySection.set(page.section, index + 3)
  })
  const indexLabels: Record<string, string> = {
    cadastro: 'Cadastro e grupo econômico',
    operacao: 'Operação de crédito',
    patrimonio: 'Patrimônio rural',
    producao: 'Produção e safra',
    endividamento: 'Endividamento',
    comercial: 'Comercial e investimentos',
    checklist: 'Checklist bancário',
    pacote: 'Pacote técnico',
  }
  const isBaseAletis = input.banco === 'geral'
  const documentTitle = isBaseAletis ? 'Base ALETIS do Produtor Rural' : 'Dossiê Bancário'
  const documentKicker = isBaseAletis ? 'Cadastro único · Inteligência ALETIS' : 'Central de Dossiês Bancários'

  const executiveText = [
    `Dossiê preparado para ${nomeBancoDossie(input.banco)} no perfil ${perfilCaso(input.perfilId).titulo.toLowerCase()}.`,
    `${input.modelos.filter((model) => model.disponivel).length} modelos foram localizados e ${input.arquivosGerados.length} arquivos técnicos foram gerados antes deste PDF.`,
    totalDebt > 0 ? `O saldo devedor informado soma ${brl(totalDebt)}.` : 'O endividamento ainda não foi informado.',
    completeness.percent < 100
      ? `A base cadastral está ${completeness.percent}% completa e requer complementação antes do protocolo final.`
      : 'A base cadastral contém todos os blocos essenciais avaliados pelo sistema.',
  ].join(' ')

  const cover = `
    <section class="pdf-page cover">
      <div class="cover-inner">
        ${creamLogo ? `<img class="cover-logo" src="${creamLogo}" alt="ALETIS">` : '<strong>ALETIS</strong>'}
        <div class="cover-rule"></div>
        <div class="cover-kicker">${documentKicker}</div>
        <h1>${documentTitle}</h1>
        <div class="cover-client">${html(text(input.cliente.nome))}</div>
        <div class="cover-bank">${html(nomeBancoDossie(input.banco))} · ${html(perfilCaso(input.perfilId).titulo)}</div>
        <div class="cover-meta">
          <div><span>CPF / CNPJ</span><strong>${html(text(input.cliente.cpfCnpj))}</strong></div>
          <div><span>Data-base</span><strong>${html(date(input.dados.dataBase || new Date().toISOString()))}</strong></div>
          <div><span>Responsável</span><strong>${html(text(input.cliente.responsavel, 'ALETIS'))}</strong></div>
        </div>
        <div class="cover-confidential">Documento confidencial · Preparado exclusivamente para análise de crédito</div>
        <div class="cover-accent"></div>
      </div>
    </section>
  `

  const summary: ContentPage = {
    section: 'resumo',
    eyebrow: 'Visão executiva',
    title: 'Resumo do dossiê',
    description: 'Leitura inicial da operação, exposição financeira e qualidade da base cadastral.',
    body: `
      <div class="summary-grid">
        <div class="summary-kpi"><span>Completude cadastral</span><strong>${completeness.percent}%</strong><small>${completeness.completed} de ${completeness.total} blocos essenciais</small></div>
        <div class="summary-kpi"><span>Limite solicitado</span><strong>${html(brl(input.dados.operacao?.limiteSolicitado))}</strong><small>${html(text(input.dados.operacao?.prazo))}</small></div>
        <div class="summary-kpi"><span>Saldo devedor</span><strong>${html(brl(totalDebt))}</strong><small>${input.dados.dividas?.length ?? 0} contratos informados</small></div>
        <div class="summary-kpi"><span>Área operacional</span><strong>${html(number(totalArea))} ha</strong><small>Patrimônio declarado: ${html(brl(totalAssets))}</small></div>
      </div>
      <div class="executive">${html(executiveText)}</div>
      <h3>Índice do documento</h3>
      <div class="index">
        ${Array.from(firstPageBySection.entries()).map(([section, page]) => `
          <div class="index-row"><span>${html(indexLabels[section] ?? section)}</span><i></i><strong>${page}</strong></div>
        `).join('')}
      </div>
      <div class="missing">
        <strong>${completeness.missing.length ? `Informações essenciais ausentes (${completeness.missing.length})` : 'Informações essenciais completas'}</strong>
        ${completeness.missing.length
          ? completeness.missing.map((item) => `<span>${html(item)}</span>`).join('')
          : '<span>Nenhuma pendência cadastral essencial detectada.</span>'}
        <span>${pending} documentos dependem do cliente</span>
      </div>
    `,
  }

  const documentHtml = [
    cover,
    pageTemplate(summary, 2, totalPages, input, darkLogo),
    ...contentPages.map((page, index) => pageTemplate(page, index + 3, totalPages, input, darkLogo)),
  ].join('')

  return {
    pages: totalPages,
    html: `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <title>${html(documentTitle)} - ${html(text(input.cliente.nome))}</title>
          <style>${styles()}</style>
        </head>
        <body>
          ${documentHtml}
          <div class="document-actions" aria-label="Ações do documento">
            <button type="button" onclick="window.print()">Imprimir / Salvar PDF</button>
            <button type="button" onclick="window.close()">Fechar</button>
          </div>
        </body>
      </html>`,
  }
}

export function renderDossieBancarioHtml(input: DossieBancarioPdfInput): DossieBancarioHtmlResult {
  const rendered = buildHtml(input)
  return {
    html: rendered.html,
    paginas: rendered.pages,
    filename: `Base_ALETIS_${safeFilename(text(input.cliente.nome))}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.html`,
  }
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) return browserInstance
  browserInstance = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  return browserInstance
}

export async function renderDossieBancarioPdf(input: DossieBancarioPdfInput): Promise<DossieBancarioPdfResult> {
  const rendered = buildHtml(input)
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(rendered.html, { waitUntil: 'networkidle0' })
    const raw = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    const document = await PDFDocument.load(raw)
    document.setTitle(`Dossiê Bancário - ${text(input.cliente.nome)}`)
    document.setAuthor('ALETIS Finanças Estratégicas & Agrobusiness')
    document.setSubject(`Dossiê para ${nomeBancoDossie(input.banco)}`)
    document.setCreator('Sistema ALETIS')
    document.setProducer('Sistema ALETIS')
    document.setCreationDate(new Date())
    document.setModificationDate(new Date())
    const saved = await document.save({ useObjectStreams: true })
    return {
      buffer: Buffer.from(saved),
      filename: `00_Dossie_Executivo_${safeFilename(text(input.cliente.nome))}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.pdf`,
      paginas: document.getPageCount(),
    }
  } finally {
    await page.close()
  }
}

export async function closeDossieBancarioPdfBrowser(): Promise<void> {
  if (!browserInstance) return
  await browserInstance.close()
  browserInstance = null
}
