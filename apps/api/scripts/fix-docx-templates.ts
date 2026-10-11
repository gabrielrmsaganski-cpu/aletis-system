import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'

const TEMPLATES_DIR = join(process.cwd(), 'src/services/processo-assessoria/templates')

function fixDocx(filePath: string, replacements: Array<{ from: RegExp | string; to: string }>) {
  const buf = readFileSync(filePath)
  const zip = new PizZip(buf)
  const docFile = zip.file('word/document.xml')
  if (!docFile) {
    console.log(`  ⚠️  word/document.xml não encontrado em ${filePath}`)
    return
  }
  let xml = docFile.asText()
  let changed = false
  for (const { from, to } of replacements) {
    if (typeof from === 'string') {
      if (xml.includes(from)) {
        xml = xml.split(from).join(to)
        changed = true
      }
    } else {
      if (from.test(xml)) {
        xml = xml.replace(from, to)
        changed = true
      }
    }
  }
  if (changed) {
    zip.file('word/document.xml', xml)
    const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
    writeFileSync(filePath, out)
    console.log(`  ✅ ${filePath.split('/').pop()}`)
  } else {
    console.log(`  ⏭️  Sem mudanças: ${filePath.split('/').pop()}`)
  }
}

// R.CM.002 - Contrato
fixDocx(join(TEMPLATES_DIR, 'R.CM.002_Contrato_Disponibilizacao_Credito.docx'), [
  { from: 'TEX CAPITAL', to: 'ALETIS' },
  { from: /\[XXXXXXXXXXXXXXX\]/g, to: '{{cliente_nome}}' },
  { from: /\[PROFISSÃO\]/g, to: '{{cliente_profissao}}' },
  { from: /\[XXXXXXXXXXX\]/g, to: '{{cliente_endereco}}' },
  { from: 'N° [XXX]', to: 'N° {{cliente_numero_endereco}}' },
  { from: '[CIDADE]', to: '{{cliente_cidade}}' },
  { from: '[ESTADO]', to: '{{cliente_uf}}' },
  { from: '[NUMERO]', to: '{{cliente_cep}}' },
  { from: /\[XXXXXXXX\]/g, to: '{{cliente_rg}}' },
  { from: '[ORGÃO EMISSOR]', to: '{{cliente_orgao_emissor}}' },
  { from: /\[XXXXXXXXXX\]/g, to: '{{cliente_cpf}}' },
])

// R.CM.003 - NDA
fixDocx(join(TEMPLATES_DIR, 'R.CM.003_Acordo_Nao_Divulgacao.docx'), [
  { from: 'TEX CAPITAL', to: 'ALETIS' },
  { from: 'Tex Capital', to: 'ALETIS' },
  { from: /\[XXXXXXXXXXXXXXX\]/g, to: '{{cliente_nome}}' },
  { from: /\[PROFISSÃO\]/g, to: '{{cliente_profissao}}' },
  { from: /\[XXXXXXXXXXX\]/g, to: '{{cliente_endereco}}' },
  { from: 'N° [XXX]', to: 'N° {{cliente_numero_endereco}}' },
  { from: 'N° [XXXX]', to: 'N° {{cliente_numero_endereco}}' },
  { from: '[CIDADE]', to: '{{cliente_cidade}}' },
  { from: '[ESTADO]', to: '{{cliente_uf}}' },
  { from: '[NUMERO]', to: '{{cliente_cep}}' },
  { from: '[XXXX]', to: '{{cliente_cep}}' },
  { from: /\[XXXXXXXX\]/g, to: '{{cliente_rg}}' },
  { from: '[ORGÃO EMISSOR]', to: '{{cliente_orgao_emissor}}' },
  { from: /\[XXXXXXXXXX\]/g, to: '{{cliente_cpf}}' },
])

// R.OP.003 - Checklist PF
fixDocx(join(TEMPLATES_DIR, 'R.OP.003_Checklist_Informacoes_Basicas_PF.docx'), [
  { from: 'Tex Capital', to: 'ALETIS' },
  { from: 'TEX CAPITAL', to: 'ALETIS' },
  { from: 'Insira o nome do cliente', to: '{{cliente_nome}}' },
  { from: 'Insira a data', to: '{{data_hoje}}' },
  { from: 'Insira o nome do responsável pelo cliente', to: '{{responsavel}}' },
])

// R.OP.004 - Checklist Documentos
fixDocx(join(TEMPLATES_DIR, 'R.OP.004_Checklist_Documentos_Produtor_Rural.docx'), [
  { from: 'Tex Capital', to: 'ALETIS' },
  { from: 'TEX CAPITAL', to: 'ALETIS' },
  { from: 'Insira o nome do cliente', to: '{{cliente_nome}}' },
  { from: 'Insira a data', to: '{{data_hoje}}' },
  { from: 'Insira o nome do responsável pelo cliente', to: '{{responsavel}}' },
])

// R.OP.005 - Checklist Dados Adicionais
fixDocx(join(TEMPLATES_DIR, 'R.OP.005_Checklist_Dados_Adicionais.docx'), [
  { from: 'Tex Capital', to: 'ALETIS' },
  { from: 'TEX CAPITAL', to: 'ALETIS' },
  { from: 'Insira o nome do cliente', to: '{{cliente_nome}}' },
  { from: 'Insira a data', to: '{{data_hoje}}' },
  { from: 'Insira o nome do responsável pelo cliente', to: '{{responsavel}}' },
])

// POP.OP.001 - Rotina
fixDocx(join(TEMPLATES_DIR, 'POP.OP.001_Rotina_Assessoria.docx'), [
  { from: 'TEX CAPITAL', to: 'ALETIS' },
  { from: 'Tex Capital', to: 'ALETIS' },
])

// IT.OP.001 - Google Drive
fixDocx(join(TEMPLATES_DIR, 'IT.OP.001_Ferramenta_Google_Drive.docx'), [
  { from: 'TEX CAPITAL', to: 'ALETIS' },
  { from: 'Tex Capital', to: 'ALETIS' },
])

// IT.OP.002 - Registro Mensal
fixDocx(join(TEMPLATES_DIR, 'IT.OP.002_Registro_Mensal_Cliente.docx'), [
  { from: 'TEX CAPITAL', to: 'ALETIS' },
  { from: 'Tex Capital', to: 'ALETIS' },
])

console.log('Done.')
