// ============================================================
// ALETIS — Smoke test Wave 9 MEMORY
// Executa o ciclo de memória + briefing sem subir HTTP.
//
// Rodar de dentro de apps/api:
//   pnpm tsx scripts/smoke-alix-memory.ts
// ============================================================

import { promises as fs } from 'fs'
import { join } from 'path'
import {
  getAlixMemoryService,
} from '../src/services/alix/memory/AlixMemoryService.js'
import { getBriefingService } from '../src/services/alix/memory/BriefingService.js'

const CLIENTE_ID = 'paulo-luciano'
const CLIENTE_NOME = 'Paulo Luciano (Fertiflora)'

function banner(title: string): void {
  console.log('\n' + '='.repeat(60))
  console.log(' ' + title)
  console.log('='.repeat(60))
}

async function main(): Promise<void> {
  const memory = getAlixMemoryService()
  const briefing = getBriefingService()

  // Limpa estado prévio pra ter teste reprodutível
  await memory.delete(CLIENTE_ID)

  // 1. PUT memória inicial — perfil + 2 dívidas + 1 próxima ação
  banner('1. PUT memória inicial')
  const m1 = await memory.upsert(CLIENTE_ID, {
    clienteNome: CLIENTE_NOME,
    perfil: [
      'Produtor de soja/milho em Maracaju-MS',
      'Dono da Fertiflora; área total 480 ha',
    ],
    dividasAtivas: [
      'Sicoob — contrato 23110-0 — R$ 587k (atraso 1042d)',
      'Sicoob — contrato 24821-2 — R$ 779k (atraso 976d)',
    ],
    proximasAcoes: [
      'Preparar proposta de alongamento para apresentar no Sicoob até sexta',
    ],
  })
  console.log('Upsert resultante:')
  console.log(JSON.stringify(m1, null, 2))

  // 2. POST nota — adiciona entrada no histórico
  banner('2. appendNota no histórico')
  await memory.appendNota(
    CLIENTE_ID,
    'historico',
    'Reunião telefônica: cliente topa alongar 50% com migração ao AB+S.',
  )
  await memory.appendNota(
    CLIENTE_ID,
    'alertas',
    'Safra não cobre dívidas — capacidade pagamento 344%.',
  )

  // 3. GET memória + render
  banner('3. GET memória + render Markdown')
  const memoria = await memory.get(CLIENTE_ID)
  console.log('Memória parseada:')
  console.log(JSON.stringify(memoria, null, 2))
  console.log('\n--- render() ---')
  const md = await memory.render(CLIENTE_ID)
  console.log(md)

  // 4. GET briefing
  banner('4. GET briefing')
  const br = await briefing.gerar(CLIENTE_ID)
  console.log('Briefing JSON:')
  console.log(
    JSON.stringify(
      {
        clienteId: br.clienteId,
        clienteNome: br.clienteNome,
        geradoEm: br.geradoEm,
        resumoExecutivo: br.resumoExecutivo,
        destaques: br.destaques,
        proximasAcoes: br.proximasAcoes,
        kpisBscResumo: br.kpisBscResumo,
        dividasAtivas: br.dividasAtivas,
        sugestaoPrimeiraAcao: br.sugestaoPrimeiraAcao,
      },
      null,
      2,
    ),
  )
  console.log('\n--- briefing.markdown ---')
  console.log(br.markdown)

  // 5. Confere que o arquivo MD existe em disco
  banner('5. Verificar arquivo em disco')
  const fp = join(
    process.cwd(),
    'storage',
    'alix-memory',
    `${CLIENTE_ID}.md`,
  )
  const stat = await fs.stat(fp)
  console.log(`OK — arquivo existe em ${fp} (${stat.size} bytes)`)
  const raw = await fs.readFile(fp, 'utf-8')
  if (!raw.includes(CLIENTE_NOME)) {
    throw new Error('Arquivo não contém clienteNome esperado')
  }
  if (!raw.includes('## Perfil')) {
    throw new Error('Arquivo não contém seção Perfil')
  }
  if (!raw.includes('## Histórico de interações relevantes')) {
    throw new Error('Arquivo não contém seção Histórico')
  }
  console.log('Conteúdo validado: headings principais presentes.')

  // Asserts mínimos no briefing
  if (br.clienteId !== CLIENTE_ID) {
    throw new Error(`Briefing clienteId divergente: ${br.clienteId}`)
  }
  if (!br.markdown || br.markdown.length < 50) {
    throw new Error('Briefing markdown vazio/curto')
  }
  if (!br.sugestaoPrimeiraAcao) {
    throw new Error('Briefing sem sugestaoPrimeiraAcao')
  }

  banner('SUCESSO')
  console.log('Todos os asserts passaram.')
}

main().catch((err) => {
  console.error('SMOKE FALHOU:', err)
  process.exit(1)
})
