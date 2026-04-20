# ALETIS — Sistema Operacional para Reestruturação de Dívidas Rurais

Plataforma completa para diagnóstico, renegociação e reestruturação de crédito rural, com integração de dados oficiais (BCB, CEPEA, INMET, IBGE/SIDRA, CONAB, SICOR, NASA, OpenMeteo) e motor de geração de propostas fundamentadas em **MCR**, **Súmulas STJ**, **Plano Safra 2025/26** e **precedentes judiciais**.

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
    ├── financial-calc/   Cálculos financeiros puros
    └── knowledge-base/   Súmulas STJ, MCR, Plano Safra 2025/26, Proagro, precedentes
```

## Data Sources (LIVE — 32 fontes registradas)

Arquitetura: **TRY REAL API → CACHE (node-cache) → FALLBACK** — nunca quebra.
Cada resposta inclui `fonteOrigem` (`api | cache | fallback`); o badge `DataSourceBadge` no frontend exibe origem + timestamp + qualidade.

**Macroeconomia (BCB)** — 11 fontes, todas públicas sem chave:
`bcb_selic` · `bcb_ipca` · `bcb_igpm` · `bcb_dolar_ptax` · `bcb_cdi` · `bcb_credito_rural` · `bcb_expectativas` (Focus) · `bcb_icbr_agro` · `bcb_icbr_energia` · `bcb_icbr_metal` · `bcb_embi` · `bcb_sicor`

**Commodities (CEPEA/ESALQ via NoticiasAgricolas + fallback AgroLink + CEPEA direto via Cloudflare bypass)** — 5 fontes:
`cepea_soja` · `cepea_milho` · `cepea_boi` · `cepea_cafe` · `cepea_algodao`

**Clima e agrometeorologia** — 4 fontes:
`inmet_estacao` · `cptec_previsao` · `nasa_power` · `openmeteo_forecast`

**IBGE (demografia, produção, fundiária)** — 4 fontes:
`ibge_municipios` · `ibge_producao_agricola` (SIDRA) · `ibge_estrutura_fundiaria` · `ibge_lspa`

**Combustíveis (ANP)** — 2 fontes: `anp_diesel` · `anp_etanol`

**Safra & produção (CONAB)** — 2 fontes: `conab_safra` · `conab_precos`

**Outras** — 4 fontes:
`awesome_cambio` (Awesome API — câmbio turbinado) · `nasa_firms` (focos de calor) · `comexstat_exportacao` (MDIC) · `sicar` (CAR via shapefile local)

### Fontes que exigem bypass
- **CEPEA direto** — site protegido por Cloudflare Managed Challenge. Solução implementada: `apps/api/src/services/captcha/CloudflareBypass.ts` (Puppeteer + stealth) + fallback para **NoticiasAgricolas** (republicador CEPEA sem proteção) como fonte primária. Resultado: 5/5 cotações online em <600ms.
- **SICAR / Receita Federal** — Turnstile/hCaptcha resolvíveis via **2captcha** (`TWOCAPTCHA_API_KEY` em `.env`; custo ~$1.50-$2 por 1000 captchas).

### Observabilidade das fontes
- `POST /api/fontes/probe` — dispara sondagem real de todas as fontes (timeout 4s, concorrência 6)
- `GET /api/fontes/status` — retorna estado (`online | degraded | offline`) + latência + último erro
- Scheduler automático: sonda 15s após boot e a cada 10 minutos. Dashboard `/fontes` consome isso em tempo real.

## Calculadoras de Crédito (20 totais)

**6 básicas** (CET, Spread, Amortização SAC/PRICE, Renegociação, Conversor de taxas) +
**14 premium**:

1. CET/TIR real (custo efetivo total com taxas e encargos)
2. Dação em pagamento (arts. 356-359 CC)
3. Alongamento (Súmula 298 STJ)
4. Capitalização de despesas (teste de abusividade)
5. Descaracterização de mora (CDC 42)
6. Fluxo plurianual (projeção de 5+ safras)
7. Equivalência em sacas (commodity-linked)
8. Stress test de preço (quedas de 10-50%)
9. Multi-credor (waterfall + score de prioridade)
10. Enquadramento Pronaf/Pronamp
11. Arrendamento equivalente
12. Parcelamento de safra
13. CPR (Cédula de Produto Rural)
14. Perícia revisional

Endpoint `GET /api/credito/calculadoras` lista todas.

## Gerador de Propostas Inteligentes

`POST /api/propostas/gerar-completa` produz proposta estruturada em **15 seções**:

1. Sumário Executivo  2. Qualificação das Partes  3. Histórico Operacional
4. Eventos Adversos  5. Diagnóstico Econômico-Financeiro  6. Memória de Cálculo
7. Fundamentação Jurídica  8. Estratégia de Reestruturação  9. Proposta Comercial
10. Fluxo de Pagamentos  11. Garantias  12. Stress Test
13. Cronograma  14. Condições Suspensivas  15. Conclusão

Cada seção é fundamentada em `@aletis/knowledge-base` (Súmulas STJ, MCR, Plano Safra, Proagro, Res. 4.966/21).

Listar: `GET /api/propostas/inteligentes/list` · Detalhar: `GET /api/propostas/inteligente/:id`

## ALIX (assistente IA interna)

Chat persistente no painel web que orquestra 20+ fontes de dados em tempo real + base de conhecimento (Súmulas STJ, MCR, Plano Safra, precedentes). Responde sobre câmbio, Selic/IPCA/IGPM/CDI, commodities, clima, CRM, propostas, jurisprudência.

`POST /api/alix/chat` · `GET /api/alix/sessions` · `GET|DELETE /api/alix/session/:id`

## WhatsApp Business + Voz (opcional)

Atende clientes por WhatsApp com voz feminina neural PT-BR (Azure Speech). Transcreve áudio recebido, responde por voz quando o cliente mandou voz, captura lead estruturado (nome → cidade → credor → valor), detecta urgência (penhora/leilão/execução) e escala para humano.

`POST /api/whatsapp/webhook` · `POST /api/whatsapp/test-brain` · `GET /api/whatsapp/status`

Setup: `.env.example` + `apps/api/src/services/whatsapp/README.md`

## Rodar em outro servidor (passo a passo)

**Pré-requisitos:** Node 20+, pnpm 9+ (`npm i -g pnpm@9.15.4`), git.

```bash
# 1. Clonar
git clone https://github.com/gabrielrmsaganski-cpu/aletis-system.git
cd aletis-system

# 2. Instalar dependências (workspace inteiro)
pnpm install

# 3. Compilar o knowledge-base (obrigatório — API importa do dist/)
pnpm -F @aletis/knowledge-base build

# 4a. Subir API (terminal 1) — porta 3001
pnpm --filter ./apps/api dev

# 4b. Subir Web (terminal 2) — porta 5173
pnpm --filter ./apps/web dev
```

Frontend em `http://localhost:5173`, API em `http://localhost:3001/api`.
Vite faz proxy de `/api/*` pra 3001 automaticamente.

**Não precisa de `.env`.** Todos os serviços externos (BCB, CEPEA, INMET, etc.) são públicos.
Variáveis opcionais da API: `PORT` (3001), `HOST` (0.0.0.0), `NODE_ENV`, `LOG_LEVEL`.

**Integrações opcionais** (WhatsApp Business + Azure Speech): copie `.env.example` pra `.env` na raiz
e preencha. Veja `apps/api/src/services/whatsapp/README.md` pra setup passo-a-passo.

**Acesso externo (opcional):** nginx reverse proxy (80 → Vite 5173 + Fastify 3001).

## Build de produção

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

> Plataforma operacional, não "dashboard bonito com conteúdo leve".
> Cada dado tem que rastrear até fonte oficial.

---

© ALETIS — Christian Kohler
