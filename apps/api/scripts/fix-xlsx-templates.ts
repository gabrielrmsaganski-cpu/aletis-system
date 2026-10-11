import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

const TEMPLATES_DIR = join(process.cwd(), 'src/services/processo-assessoria/templates')

async function fixXlsx(filename: string) {
  const filePath = join(TEMPLATES_DIR, filename)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  let changed = false
  wb.worksheets.forEach((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        let v = cell.value
        if (v && typeof v === 'string' && /TEX CAPITAL|Tex Capital/i.test(v)) {
          cell.value = v.replace(/TEX CAPITAL/g, 'ALETIS').replace(/Tex Capital/g, 'ALETIS')
          changed = true
        } else if (v && typeof v === 'object' && 'richText' in v && Array.isArray((v as any).richText)) {
          const rt = (v as any).richText as Array<{ text?: string }>
          let rtChanged = false
          for (const r of rt) {
            if (r.text && /TEX CAPITAL|Tex Capital/i.test(r.text)) {
              r.text = r.text.replace(/TEX CAPITAL/g, 'ALETIS').replace(/Tex Capital/g, 'ALETIS')
              rtChanged = true
            }
          }
          if (rtChanged) changed = true
        }
      })
    })
  })
  if (changed) {
    await wb.xlsx.writeFile(filePath)
    console.log(`  ✅ ${filename}`)
  } else {
    console.log(`  ⏭️  Sem mudanças: ${filename}`)
  }
}

async function main() {
  await fixXlsx('R.OP.009_Checklist_Rotina.xlsx')
}

main().catch(console.error)
