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

## ALIX (assistente IA interna)

Chat persistente no painel web que orquestra 20+ fontes de dados em tempo real + base de conhecimento (Sumulas STJ, MCR, Plano Safra, precedentes). Responde sobre cambio, Selic/IPCA/IGPM/CDI, commodities, clima, CRM, propostas, jurisprudencia.

`POST /api/alix/chat` · `GET /api/alix/sessions` · `GET|DELETE /api/alix/session/:id`

## WhatsApp Business + Voz (opcional)

Atende clientes por WhatsApp com voz feminina neural PT-BR (Azure Speech). Transcreve audio recebido, responde por voz quando o cliente mandou voz, captura lead estruturado (nome → cidade → credor → valor), detecta urgencia (penhora/leilao/execucao) e escala para humano.

`POST /api/whatsapp/webhook` · `POST /api/whatsapp/test-brain` · `GET /api/whatsapp/status`

Setup: `.env.example` + `apps/api/src/services/whatsapp/README.md`

## Rodar em outro servidor (passo a passo)

**Pre-requisitos:** Node 20+, pnpm 9+ (`npm i -g pnpm@9.15.4`), git.

```bash
# 1. Clonar
git clone https://github.com/gabrielrmsaganski-cpu/aletis-system.git
cd aletis-system

# 2. Instalar dependencias (workspace inteiro)
pnpm install

# 3. Compilar o knowledge-base (obrigatorio — API importa do dist/)
pnpm -F @aletis/knowledge-base build

# 4a. Subir API (terminal 1) — porta 3001
pnpm --filter ./apps/api dev

# 4b. Subir Web (terminal 2) — porta 5173
pnpm --filter ./apps/web dev
```

Frontend em `http://localhost:5173`, API em `http://localhost:3001/api`.
Vite faz proxy de `/api/*` pra 3001 automaticamente.

**Nao precisa de `.env`.** Todos os servicos externos (BCB, CEPEA, INMET, etc.) sao publicos.
Variaveis opcionais da API: `PORT` (3001), `HOST` (0.0.0.0), `NODE_ENV`, `LOG_LEVEL`.

**Integracoes opcionais** (WhatsApp Business + Azure Speech): copie `.env.example` pra `.env` na raiz
e preencha. Veja `apps/api/src/services/whatsapp/README.md` pra setup passo-a-passo.

**Acesso externo (opcional):** nginx reverse proxy (80 → Vite 5173 + Fastify 3001).

## Build de producao

```bash
pnpm -F @aletis/knowledge-base build
pnpm --filter ./apps/web build          # gera apps/web/dist/
pnpm --filter ./apps/api build          # gera apps/api/dist/
pnpm --filter ./apps/api start          # node dist/server.js
```

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
