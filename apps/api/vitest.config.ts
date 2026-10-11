import { defineConfig } from 'vitest/config'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Carrega .env do monorepo (../../.env) — Vitest não faz isso por padrão.
// Permite que tests/db/* leiam DATABASE_URL e ALETIS_PG_ENABLED quando setados.
const envPath = resolve(__dirname, '../../.env')
const envFile: Record<string, string> = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/)
    if (m) envFile[m[1]] = m[2]
  }
}

export default defineConfig({
  test: {
    include: [
      'tests/api/**/*.test.ts',
      'tests/lib/**/*.test.ts',
      'tests/db/**/*.test.ts',
      'tests/alix/**/*.test.ts',
      'tests/whatsapp/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    // As suítes existentes exercitam rotas unitariamente sem sessão. O guard
    // global fica desligado nos testes; auth.test.ts cobre o fluxo real.
    env: { ...envFile, ALETIS_INTERNAL_AUTH_ENABLED: '0' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/types.ts',
        'src/server.ts',
      ],
    },
  },
})
