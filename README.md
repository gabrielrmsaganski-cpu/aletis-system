# ALETIS — Sistema Operacional para Reestruturacao de Dividas Rurais

Plataforma completa para diagnostico, renegociacao e reestruturacao de credito rural, com integracao de dados oficiais (BCB, CEPEA, INMET, IBGE/SIDRA, CONAB, SICOR, NASA, OpenMeteo) e motor de geracao de propostas fundamentadas em **MCR**, **Sumulas STJ**, **Plano Safra 2025/26** e **precedentes judiciais**.

## Arquitetura

Monorepo pnpm + Turborepo.

```
aletis-system/
├── apps/
│   ├── api/          Fastify v5 + TypeScript (porta 3001)
│   │   ├── routes/   clientes, credito, propostas, mercado, clima, fontes
│   │   ├── services/ DataSourceManager, PropostaGeneratorInteligente, PdfGenerator
│   │   └── lib/      calculadoras-premium, financeiro
│   └── web/          React 18 + Vite + Tailwind (porta 8080)
│       └── pages/    Dashboard, CRM, Credito, CreditoPremium, Propostas, ALIX, ...
└── packages/
    ├── shared-types/     Tipos compartilhados
    ├── financial-calc/   Calculos financeiros puros
    └── knowledge-base/   Sumulas STJ, MCR, Plano Safra 2025/26, Proagro, precedentes
```

## Data Sources (LIVE)

Arquitetura: **TRY REAL API → CACHE (node-cache) → FALLBACK** — nunca quebra.

- **BCB SGS** — Selic (432), IPCA (433), IGP-M (189), CDI (12), Credito Rural (25469)
- **BCB OLINDA** — Dolar PTAX
- **CEPEA/ESALQ** — cotacoes de commodities (soja, milho, boi, cafe, algodao)
- **INMET / OpenMeteo / NASA POWER** — clima e dados agrometeorologicos
- **CONAB** — safra e precos
- **IBGE SIDRA / LSPA** — producao agricola
- **SICOR** — credito rural operacional
- **NASA FIRMS** — focos de calor

`DataSourceManager` e o orquestrador singleton. Todas as respostas incluem `fonteOrigem` (`api | cache | fallback`) e o badge `DataSourceBadge` exibe origem + timestamp + qualidade no frontend.

## Calculadoras de Credito (20 totais)

**6 basicas** (CET, Spread, Amortizacao SAC/PRICE, Renegociacao, Conversor de taxas) +
**14 premium**:

1. CET/TIR real (custo efetivo total com taxas e encargos)
2. Dacao em pagamento (arts. 356-359 CC)
3. Alongamento (Sumula 298 STJ)
4. Capitalizacao de despesas (teste de abusividade)
5. Descaracterizacao de mora (CDC 42)
6. Fluxo plurianual (projecao de 5+ safras)
7. Equivalencia em sacas (commodity-linked)
8. Stress test de preco (quedas de 10-50%)
9. Multi-credor (waterfall + score de prioridade)
10. Enquadramento Pronaf/Pronamp
11. Arrendamento equivalente
12. Parcelamento de safra
13. CPR (Cedula de Produto Rural)
14. Pericia revisional

Endpoint `GET /api/credito/calculadoras` lista todas.

## Gerador de Propostas Inteligentes

`POST /api/propostas/gerar-completa` produz proposta estruturada em **15 secoes**:

1. Sumario Executivo  2. Qualificacao das Partes  3. Historico Operacional
4. Eventos Adversos  5. Diagnostico Economico-Financeiro  6. Memoria de Calculo
7. Fundamentacao Juridica  8. Estrategia de Reestruturacao  9. Proposta Comercial
10. Fluxo de Pagamentos  11. Garantias  12. Stress Test
13. Cronograma  14. Condicoes Suspensivas  15. Conclusao

Cada secao e fundamentada em `@aletis/knowledge-base` (Sumulas STJ, MCR, Plano Safra, Proagro, Res. 4.966/21).

Listar: `GET /api/propostas/inteligentes/list` · Detalhar: `GET /api/propostas/inteligente/:id`

## Desenvolvimento

```bash
pnpm install                              # instala tudo
pnpm -F @aletis/knowledge-base build      # compila knowledge-base (requerido)
pnpm -F @aletis/shared-types build
pnpm -F @aletis/financial-calc build
pnpm --filter ./apps/api dev              # API em :3001
pnpm --filter ./apps/web dev              # Web em :8080
```

Acesso externo: nginx reverse proxy (80 → Vite 8080 + Fastify 3001).

## Stack

- **Backend**: Fastify 5, TypeScript, tsx, node-cache, axios
- **Frontend**: React 18, Vite, Tailwind, Zustand, lucide-react
- **Monorepo**: pnpm workspaces, Turborepo
- **Tema**: Verde / Dourado / Bege (ALETIS brand)

## Filosofia

> Plataforma operacional, nao "dashboard bonito com conteudo leve".
> Cada dado tem que rastrear ate fonte oficial.

---

© ALETIS — Christian Kohler
