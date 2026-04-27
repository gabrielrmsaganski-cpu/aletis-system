/**
 * build-contract-templates.ts — Wave Documentos
 * ==============================================
 * Lê os 10 .docx oficiais em ./documentos/ e gera versões
 * "tagueadas" em apps/api/src/services/contratos/templates/ com
 * placeholders {nome_cliente}, {cliente_cpf}, etc. — preservando
 * 100% da formatação, fontes, logos e estrutura.
 *
 * Os originais NÃO são modificados.
 *
 * Uso: pnpm --filter @aletis/api exec tsx scripts/build-contract-templates.ts
 */
import PizZip from 'pizzip'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Diretórios ────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '../../..')
const DOCS_DIR = join(ROOT, 'documentos')
const OUT_DIR = resolve(__dirname, '../src/services/contratos/templates')
mkdirSync(OUT_DIR, { recursive: true })

// ── Tipo das substituições ────────────────────────────────────
interface Replacement {
  /** Padrão exato (string) ou regex global. */
  find: string | RegExp
  /** String de saída (pode conter tokens docxtemplater). */
  replace: string
  /** Quantas vezes esperamos encontrar (0 = qualquer). Falha se diferir. */
  expected?: number
  /** Descrição opcional para log. */
  desc?: string
}

interface TemplateRecipe {
  slug: string
  source: string
  out: string
  replacements: Replacement[]
}

// ── Receitas por arquivo ──────────────────────────────────────
// Mantém a formatação porque substitui só a string interna ao
// elemento <w:t>...</w:t>, sem tocar nos atributos de estilo (<w:r>, <w:rPr>).
const RECIPES: TemplateRecipe[] = [
  // ────────── 0_1 — RESUMIDO ──────────
  {
    slug: 'contrato-base-resumido',
    source: 'ALETIS_ANEXO_0_1_CONTRATO_BASE_CLIENTES_RESUMIDO_PADRONIZADO_FINAL.docx',
    out: 'contrato-base-resumido.docx',
    replacements: [
      { find: 'Nome completo do Cliente', replace: '{cliente_nome}', expected: 1, desc: 'nome' },
      { find: 'XXX.XXX.XXX-XX', replace: '{cliente_cpf}', expected: 1, desc: 'cpf' },
      { find: 'Endereço do Cliente', replace: '{cliente_endereco_completo}', expected: 1, desc: 'endereço' },
      { find: 'XXXXX-XXX', replace: '{cliente_cep}', expected: 1, desc: 'cep' },
    ],
  },

  // ────────── 0 — COMPLETO ──────────
  {
    slug: 'contrato-base-completo',
    source: 'ALETIS_ANEXO_0_CONTRATO_BASE_COMPLETO_PADRONIZADO_FINAL.docx',
    out: 'contrato-base-completo.docx',
    replacements: [
      // Número do contrato (Nº. 101 → Nº. {contrato_numero})
      { find: 'Nº. 101', replace: 'Nº. {contrato_numero}', expected: 1, desc: 'contrato nº' },
      // Bloco completo do CONTRATANTE OSVALDO → tokens
      // Nome
      { find: 'OSVALDO LAERCIO PASCOTTO', replace: '{cliente_nome}', expected: 1, desc: 'nome contratante' },
      // Qualificação + endereço inteiro
      {
        find: 'agricultor, residente na Rua Presidente Ranieri Mazzili, 446 -Jardim Pancera - TOLEDO/PR - 85902-370',
        replace: '{cliente_qualificacao}, residente na {cliente_endereco_completo}',
        expected: 1,
        desc: 'qualificação + endereço',
      },
      // CPF (formato com erro proposital no original — OSVALDO sem ponto)
      { find: '903.839909-04', replace: '{cliente_cpf}', expected: 1, desc: 'cpf contratante' },
    ],
  },

  // ────────── ANEXO I — CONSULTORIA ──────────
  {
    slug: 'anexo-i-consultoria',
    source: 'ALETIS_ANEXO_I_CONSULTORIA_PADRONIZADO_FINAL.docx',
    out: 'anexo-i-consultoria.docx',
    replacements: [
      { find: /Nº XX\/2025/g, replace: 'Nº {contrato_numero}', expected: 2, desc: 'contrato nº (2×)' },
      { find: 'XX/XX/2025', replace: '{contrato_data}', expected: 1, desc: 'data' },
      { find: 'NOME COMPLETO DO CLIENTE', replace: '{cliente_nome}', expected: 1, desc: 'nome' },
    ],
  },

  // ────────── ANEXO II — DIAGNÓSTICO ──────────
  {
    slug: 'anexo-ii-diagnostico',
    source: 'ALETIS_ANEXO_II_DIAGNOSTICO_PADRONIZADO_FINAL.docx',
    out: 'anexo-ii-diagnostico.docx',
    replacements: [
      { find: /Nº XX\/2025/g, replace: 'Nº {contrato_numero}', expected: 2, desc: 'contrato nº (2×)' },
      { find: 'XX/XX/2025', replace: '{contrato_data}', expected: 1, desc: 'data' },
      { find: 'NOME COMPLETO DO CLIENTE', replace: '{cliente_nome}', expected: 1, desc: 'nome' },
    ],
  },

  // ────────── ANEXO III — ASSESSORIA GERENCIAL ──────────
  {
    slug: 'anexo-iii-assessoria-gerencial',
    source: 'ALETIS_ANEXO_III_ASSESSORIA_GERENCIAL_PADRONIZADO_FINAL.docx',
    out: 'anexo-iii-assessoria-gerencial.docx',
    replacements: [
      { find: 'Nº XX/2025', replace: 'Nº {contrato_numero}', expected: 1, desc: 'contrato nº' },
      { find: 'XXXXXXXXXXXXXXXXXXXXXX', replace: '{cliente_nome}', expected: 1, desc: 'nome' },
    ],
  },

  // ────────── ANEXO IV — ASSESSORIA + ERP ──────────
  {
    slug: 'anexo-iv-assessoria-erp',
    source: 'ALETIS_ANEXO_IV_ASSESSORIA_GERENCIAL_ERP_PADRONIZADO_FINAL.docx',
    out: 'anexo-iv-assessoria-erp.docx',
    replacements: [
      { find: /Nº XX\/2025/g, replace: 'Nº {contrato_numero}', expected: 2, desc: 'contrato nº (2×)' },
      { find: 'XX/XX/2025', replace: '{contrato_data}', expected: 1, desc: 'data' },
      { find: 'NOME COMPLETO DO CLIENTE', replace: '{cliente_nome}', expected: 1, desc: 'nome' },
    ],
  },

  // ────────── ANEXO V — OUTROS SERVIÇOS ──────────
  {
    slug: 'anexo-v-outros-servicos',
    source: 'ALETIS_ANEXO_V_OUTROS_SERVICOS_PADRONIZADO_FINAL.docx',
    out: 'anexo-v-outros-servicos.docx',
    replacements: [
      { find: /Nº 112\/2025/g, replace: 'Nº {contrato_numero}', expected: 2, desc: 'contrato nº (2×)' },
      { find: 'firmado em 03/11/2025', replace: 'firmado em {contrato_data}', expected: 1, desc: 'data' },
      // Nome do cliente está como linha em branco "______________________________"
      // Substitui só a primeira ocorrência (depois do "doravante denominada CONTRATADA, e ")
      {
        find: 'denominada CONTRATADA, e ______________________________, doravante',
        replace: 'denominada CONTRATADA, e {cliente_nome}, doravante',
        expected: 1,
        desc: 'nome (em linha em branco)',
      },
    ],
  },

  // ────────── ANEXO VI — NDA ──────────
  {
    slug: 'anexo-vi-nda',
    source: 'ALETIS_ANEXO_VI_NDA_PADRONIZADO_FINAL.docx',
    out: 'anexo-vi-nda.docx',
    replacements: [
      // Bloco completo dos 3 outorgantes (PARTE DIVULGADORA) — substituído
      // por placeholder único {outorgantes_bloco} que o serviço monta a partir
      // do array [{nome, qualificacao, endereco, rg, cpf}].
      {
        find: 'ARI DO PRADO, agricultor, residente na Estrada Rural - S/N - Zona Rural - Gaúcha do Norte/MT - CEP 78875-000, portador do RG nº 4.032.219 SSP/PR, inscrito no CPF sob nº 801.824.029-91; MAURA TEREZINHA FERREIRA PRADO, agricultora, residente na Estrada Rural - S/N - Zona Rural - Gaúcha do Norte/MT - CEP 78875-000, portadora do RG nº 6.168.765-3 SSP/PR, inscrita no CPF sob nº 989.925.389-57; e LEONARDO FERREIRA PRADO, agricultor, residente na Rua Florença - 2 Quadra B - Jardim Itália - Gaúcha do Norte/MT - CEP 78875-000, portador do RG nº 2.965.477-7 SSP/MT, inscrito no CPF sob nº 077.125.309-55',
        replace: '{outorgantes_bloco}',
        expected: 1,
        desc: 'bloco outorgantes (3 pessoas)',
      },
      // Número do contrato principal: "contrato principal nº ________"
      { find: 'contrato principal nº ________', replace: 'contrato principal nº {contrato_numero}', expected: 1, desc: 'contrato principal nº' },
    ],
  },

  // ────────── ANEXO VII — PROCURAÇÃO ──────────
  {
    slug: 'anexo-vii-procuracao',
    source: 'ALETIS_ANEXO_VII_MINUTA_PROCURACAO_PADRONIZADO_FINAL.docx',
    out: 'anexo-vii-procuracao.docx',
    replacements: [
      // Bloco dos OUTORGANTES (3 pessoas reais)
      {
        find: 'ARI DO PRADO, agricultor, residente na Estrada Rural - S/N - Zona Rural - Gaúcha do Norte/MT - CEP 78875-000, portador do RG nº 4.032.219 SSP/PR, inscrito no CPF sob nº 801.824.029-91; MAURA TEREZINHA FERREIRA PRADO, agricultora, residente na Estrada Rural - S/N - Zona Rural - Gaúcha do Norte/MT - CEP 78875-000, portadora do RG nº 6.168.765-3 SSP/PR, inscrita no CPF sob nº 989.925.389-57; e LEONARDO FERREIRA PRADO, agricultor, residente na Rua Florença - 2 Quadra B - Jardim Itália - Gaúcha do Norte/MT - CEP 78875-000, portador do RG nº 2.965.477-7 SSP/MT, inscrito no CPF sob nº 077.125.309-55',
        replace: '{outorgantes_bloco}',
        expected: 1,
        desc: 'bloco outorgantes',
      },
      // Os "XXX.XXX.XXX-XX" (3x) ficam para edição manual no doc se forem
      // dos OUTORGADOS sócios — manter inalterados (são placeholders dos
      // sócios ALETIS, dependentes da operação interna).
      // Os "______________________________" (3x) são linhas de assinatura.
    ],
  },

  // ────────── ANEXO VIII — TERMO DE ACEITE ──────────
  {
    slug: 'anexo-viii-termo-aceite',
    source: 'ALETIS_ANEXO_VIII_TERMO_DE_ACEITE_PADRONIZADO_FINAL.docx',
    out: 'anexo-viii-termo-aceite.docx',
    replacements: [
      { find: 'Crédito nº XX', replace: 'Crédito nº {contrato_numero}', expected: 1, desc: 'contrato nº' },
      { find: 'percentual XX%', replace: 'percentual {taxa_percentual}', expected: 1, desc: 'taxa %' },
      // Valor de desistência: "R$ ____________ (____________________)"
      {
        find: 'pagará à CONTRATADA o valor de R$ ____________ (____________________)',
        replace: 'pagará à CONTRATADA o valor de R$ {valor_desistencia} ({valor_desistencia_extenso})',
        expected: 1,
        desc: 'valor desistência',
      },
    ],
  },
]

// ── Aplica receitas ───────────────────────────────────────────
function processTemplate(recipe: TemplateRecipe): {
  ok: boolean
  applied: number
  warnings: string[]
} {
  const sourcePath = join(DOCS_DIR, recipe.source)
  if (!existsSync(sourcePath)) {
    return { ok: false, applied: 0, warnings: [`source não existe: ${sourcePath}`] }
  }
  const buf = readFileSync(sourcePath)
  const zip = new PizZip(buf)

  // .docx tem múltiplos XMLs — aplicamos em document.xml e
  // (se existir) header*.xml, footer*.xml também
  const xmlFiles = Object.keys(zip.files).filter(
    (n) =>
      n === 'word/document.xml' ||
      n.match(/^word\/(header|footer)\d*\.xml$/) ||
      n === 'word/footnotes.xml' ||
      n === 'word/endnotes.xml',
  )

  const warnings: string[] = []
  let totalApplied = 0

  for (const r of recipe.replacements) {
    let appliedThisRule = 0
    for (const xmlFile of xmlFiles) {
      const file = zip.file(xmlFile)
      if (!file) continue
      let xml = file.asText()
      // O texto literal pode estar dividido em múltiplos <w:t>; tentamos
      // primeiro substituição direta; se falhar e for string literal,
      // tentamos uma versão "fuzzy" ignorando tags entre caracteres.
      let foundCount = 0
      if (typeof r.find === 'string') {
        // count occurrences
        let idx = -1
        while ((idx = xml.indexOf(r.find, idx + 1)) !== -1) foundCount++
        if (foundCount > 0) {
          xml = xml.split(r.find).join(r.replace)
        } else {
          // Fuzzy: o texto pode estar dividido em múltiplos <w:t>.
          // Para cada char do "find" original, geramos um átomo regex
          // (escapado) e juntamos com pattern de "tag-boundary opcional".
          const SPECIALS = '.*+?^${}()|[]\\'
          const atoms = Array.from(r.find).map((ch) => {
            if (ch === ' ') return '\\s+'
            return SPECIALS.includes(ch) ? `\\${ch}` : ch
          })
          const sep = '(?:</w:t>(?:[^<]|<(?!/?w:t))*<w:t[^>]*>)?'
          const fuzzyPattern = atoms.join(sep)
          let fuzzy: RegExp
          try {
            fuzzy = new RegExp(fuzzyPattern, 'g')
          } catch {
            continue
          }
          const matches = xml.match(fuzzy)
          if (matches) {
            foundCount = matches.length
            xml = xml.replace(fuzzy, r.replace)
          }
        }
      } else {
        const matches = xml.match(r.find)
        if (matches) {
          foundCount = matches.length
          xml = xml.replace(r.find, r.replace)
        }
      }
      if (foundCount > 0) {
        zip.file(xmlFile, xml)
        appliedThisRule += foundCount
      }
    }
    totalApplied += appliedThisRule
    if (r.expected != null && appliedThisRule !== r.expected) {
      warnings.push(
        `${recipe.slug}: regra "${r.desc}" esperava ${r.expected}, encontrou ${appliedThisRule}`,
      )
    } else if (appliedThisRule === 0) {
      warnings.push(`${recipe.slug}: regra "${r.desc}" não encontrou nada`)
    }
  }

  // Salva
  const outPath = join(OUT_DIR, recipe.out)
  const outBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  writeFileSync(outPath, outBuf)

  return { ok: warnings.length === 0, applied: totalApplied, warnings }
}

// ── Main ──────────────────────────────────────────────────────
function main(): void {
  console.log('🛠  Build contract templates')
  console.log(`    src: ${DOCS_DIR}`)
  console.log(`    out: ${OUT_DIR}`)
  console.log()

  let totalOk = 0
  let totalWarn = 0
  for (const recipe of RECIPES) {
    const result = processTemplate(recipe)
    if (result.ok) {
      console.log(`  ✓ ${recipe.slug.padEnd(40)} ${result.applied} substituições`)
      totalOk++
    } else {
      console.log(`  ⚠ ${recipe.slug.padEnd(40)} ${result.applied} substituições`)
      for (const w of result.warnings) console.log(`      ${w}`)
      totalWarn++
    }
  }
  console.log()
  console.log(`✅ ${totalOk}/${RECIPES.length} OK${totalWarn ? ` · ${totalWarn} com warnings` : ''}`)
  if (totalWarn > 0) process.exit(1)
}

main()
