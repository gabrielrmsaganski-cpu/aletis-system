/**
 * Bootstrap dos templates do Processo de Assessoria TEX CAPITAL.
 *
 * Lê os 25 originais em /documentos/processo-assessoria/originais/
 * (mais a versão v2.0 em /documentos2/) e copia para
 * apps/api/src/services/processo-assessoria/templates/ com:
 *   - nome canônico (slug do manifest)
 *   - PRESERVAÇÃO TOTAL do conteúdo binário (zero reescrita)
 *
 * Para docx com placeholders, NÃO injetamos {tags} aqui — usamos a
 * estratégia de "substituição de literais" no XlsmCellRenderer e
 * docxtemplater no DocxRenderer (que é tolerante a docs sem tags).
 *
 * Idempotente: rodar várias vezes apenas reescreve os arquivos.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROCESSO_TEMPLATES } from '../src/services/processo-assessoria/manifest.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '../../..')
const ORIGINAIS_DIR = join(REPO_ROOT, 'documentos/processo-assessoria/originais')
const TEMPLATES_DIR = join(__dirname, '../src/services/processo-assessoria/templates')

if (!existsSync(TEMPLATES_DIR)) {
  mkdirSync(TEMPLATES_DIR, { recursive: true })
}

let ok = 0
let skipped = 0
const failures: Array<{ slug: string; reason: string }> = []

for (const tpl of PROCESSO_TEMPLATES) {
  // resolveOriginal: aceita tanto path relativo a originais/ quanto path absoluto a partir de documentos/
  const candidates = [
    join(ORIGINAIS_DIR, tpl.originalFile),
    resolve(ORIGINAIS_DIR, tpl.originalFile),
  ]
  const src = candidates.find((p) => existsSync(p))
  if (!src) {
    failures.push({ slug: tpl.slug, reason: `original não encontrado: ${tpl.originalFile}` })
    continue
  }
  const dest = join(TEMPLATES_DIR, tpl.templateFile)
  try {
    const buf = readFileSync(src)
    writeFileSync(dest, buf)
    console.log(`✓ ${tpl.slug.padEnd(45)} ← ${tpl.originalFile}`)
    ok += 1
  } catch (e: any) {
    failures.push({ slug: tpl.slug, reason: e?.message ?? String(e) })
  }
}

console.log(`\n────────────────────────────────────────────────`)
console.log(`✓ Templates copiados: ${ok}/${PROCESSO_TEMPLATES.length}`)
if (skipped) console.log(`⏭  Pulados: ${skipped}`)
if (failures.length) {
  console.log(`✗ Falhas:`)
  for (const f of failures) console.log(`   ${f.slug}: ${f.reason}`)
  process.exit(1)
}
process.exit(0)
