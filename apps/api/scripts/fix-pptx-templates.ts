import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'

const TEMPLATES_DIR = join(process.cwd(), 'src/services/processo-assessoria/templates')

const files = [
  'IT.OP.003_Download_Drive_AnyDesk.pptx',
  'R.CM.001_Apresentacao_Comercial.pptx',
  'R.OP.006_Relatorio_Diagnostico_Financeiro.pptx',
]

for (const fn of files) {
  const filePath = join(TEMPLATES_DIR, fn)
  const buf = readFileSync(filePath)
  const zip = new PizZip(buf)
  const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
  let changed = false
  for (const sf of slideFiles) {
    const file = zip.file(sf)
    if (!file) continue
    let xml = file.asText()
    const newXml = xml.replace(/TEX CAPITAL/g, 'ALETIS').replace(/Tex Capital/g, 'ALETIS')
    if (newXml !== xml) {
      zip.file(sf, newXml)
      changed = true
    }
  }
  if (changed) {
    const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
    writeFileSync(filePath, out)
    console.log(`  ✅ ${fn}`)
  } else {
    console.log(`  ⏭️  Sem mudanças: ${fn}`)
  }
}
console.log('Done.')
