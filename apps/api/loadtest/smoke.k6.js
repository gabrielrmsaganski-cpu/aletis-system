/**
 * k6 smoke prod-like — valida que API aguenta 50-100 RPS por 1-3 min
 * sem erros >1% nem p99 > 500ms em endpoints chave.
 *
 * Cenário: 4 stages
 *   1. ramp-up 30s → 50 VUs
 *   2. plateau 60s @ 50 VUs
 *   3. spike 30s → 100 VUs (testa rate-limit + axios-retry)
 *   4. ramp-down 20s → 0
 *
 * Endpoints testados (mix realista):
 *   - GET /api/health                         (rotina baixa carga)
 *   - GET /api/clientes                       (Map RAM + dual-write PG)
 *   - GET /api/fontes/status                  (snapshot 36 fontes)
 *   - GET /api/credito/converter-taxa?...     (cálculo puro)
 *   - GET /api/prospeccao/leads/sql?uf=PR     (query indexada PG)
 *   - GET /api/financeiro/dashboard           (agregado em RAM)
 *
 * Uso:
 *   API rodando em :3011 com ALETIS_PG_ENABLED=1
 *   k6 run apps/api/loadtest/smoke.k6.js
 *
 * Threshold de pass:
 *   - http_req_failed < 5% (rate-limit pode bater no spike)
 *   - http_req_duration p99 < 800ms (aceita 1 retry exp)
 */
import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

const BASE = __ENV.BASE_URL || 'http://localhost:3011'

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // ramp-up
    { duration: '60s', target: 50 },   // plateau
    { duration: '30s', target: 100 },  // spike
    { duration: '20s', target: 0 },    // ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],    // <5% errors
    http_req_duration: ['p(95)<400', 'p(99)<800'],
    errors: ['rate<0.05'],
  },
}

export default function () {
  group('health', () => {
    const r = http.get(`${BASE}/api/health`, { tags: { ep: 'health' } })
    check(r, { 'health 200': (res) => res.status === 200 }) || errorRate.add(1)
  })

  group('clientes', () => {
    const r = http.get(`${BASE}/api/clientes`, { tags: { ep: 'clientes' } })
    check(r, { 'clientes 200': (res) => res.status === 200 }) || errorRate.add(1)
  })

  group('fontes', () => {
    const r = http.get(`${BASE}/api/fontes/status`, { tags: { ep: 'fontes' } })
    check(r, { 'fontes 200': (res) => res.status === 200 }) || errorRate.add(1)
  })

  group('credito.converter-taxa', () => {
    const r = http.get(`${BASE}/api/credito/converter-taxa?taxa=1.5&de=mensal&para=anual`, {
      tags: { ep: 'converter-taxa' },
    })
    check(r, { 'converter-taxa 200': (res) => res.status === 200 }) || errorRate.add(1)
  })

  group('prospeccao.leads.sql', () => {
    const r = http.get(`${BASE}/api/prospeccao/leads/sql?uf=PR&limit=10`, {
      tags: { ep: 'leads-sql' },
    })
    check(r, { 'leads-sql 200': (res) => res.status === 200 }) || errorRate.add(1)
  })

  group('financeiro.dashboard', () => {
    const r = http.get(`${BASE}/api/financeiro/dashboard`, { tags: { ep: 'financeiro' } })
    check(r, { 'financeiro 200': (res) => res.status === 200 }) || errorRate.add(1)
  })

  sleep(0.5)
}

export function handleSummary(data) {
  // Resumo enxuto pro CI/console (default JSON é grande demais)
  const m = data.metrics
  const summary = {
    duration_ms: data.state.testRunDurationMs,
    iterations: m.iterations?.values?.count,
    http_reqs: m.http_reqs?.values?.count,
    http_req_failed_rate: m.http_req_failed?.values?.rate,
    http_req_duration: {
      avg: m.http_req_duration?.values?.avg,
      med: m.http_req_duration?.values?.med,
      p95: m.http_req_duration?.values?.['p(95)'],
      p99: m.http_req_duration?.values?.['p(99)'],
      max: m.http_req_duration?.values?.max,
    },
    thresholds_passed: Object.entries(m).every(([_k, v]) =>
      !v.thresholds || Object.values(v.thresholds).every((t) => !t.fails),
    ),
  }
  return {
    stdout: JSON.stringify(summary, null, 2) + '\n',
    'apps/api/loadtest/last-run.json': JSON.stringify({ ...summary, full: data }, null, 2),
  }
}
