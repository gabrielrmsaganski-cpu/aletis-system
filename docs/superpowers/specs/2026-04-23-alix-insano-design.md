# ALIX Insano — Design Spec

**Data:** 2026-04-23
**Status:** Aprovado (brainstorm)
**Onda:** única (pacote completo)
**Escopo:** transforma o Alix em orquestrador multi-agente com acesso total à prospecção, web search, escrita no CRM e raciocínio profundo (Opus 4.7 + extended thinking)

---

## 0 · Contexto e Motivação

**Estado atual do Alix** (commit `21be9cd`, Wave 10+11):
- 79 tools num blob único dentro de `AlixService.ts` (4846 linhas)
- Modelo fixo `claude-sonnet-4-6` · `maxTokens=2048` · `maxIterations=6`
- System prompt reativo ("responda com dados, use tools")
- Zero acesso à aba **Prospecção** (leads PGFN, scoring, enriquecimento)
- Zero capacidade de **web search / due-diligence externa**
- A maioria das ações CRM são "intent" (rascunho), não escrevem de fato no sistema
- Sem roteamento de modelo — pergunta "oi" usa mesmo budget de uma análise pesada

**Validação que motivou este spec:** Christian pediu ao Alix "pega um cliente qualquer na aba prospecção e faz um estudo de caso com estruturação financeira". Alix não teve como responder — não tem tool de prospecção, não tem web, não tem cabeça estratégica no prompt, e o loop de 6 iterações × 2k tokens não comporta análise multi-passo.

**Objetivo:** transformar Alix no consultor sênior que Christian precisa como braço direito — capaz de observar dados internos + externos, orientar com contexto agro/jurídico/macro, decidir estratégia com números, e agir no sistema com confirmação humana para ações de alto impacto. OODA loop explícito. "Insano" no sentido de profundidade e autonomia, não no sentido de alucinado.

---

## 1 · Decisões do Brainstorm

| Decisão | Escolha | Alternativas descartadas |
|---|---|---|
| Escopo | 1 onda cobrindo tudo | Onda por capacidade (prospecção primeiro) |
| Golden path | Pipeline completo lead → cliente → proposta → dossiê | Só resposta no chat · só PDF · só proposta |
| Web search | Nativa Claude (fallback Tavily) | Só Tavily · só Playwright · híbrido scraping |
| HITL | Só em ações de alto impacto | HITL total · auto-pilot · modo-dependente |
| Modelo | Roteamento: Opus análise / Sonnet chat | Tudo Opus · tudo Sonnet · user escolhe |
| Arquitetura | **Multi-agente** (Orchestrator + 4 sub-agentes) | Agente livre (loop expandido) · Alix Planner |

---

## 2 · Arquitetura Geral

**Alix vira um Orquestrador** com 4 sub-agentes especializados, cada um com seu próprio system prompt, conjunto de tools e modelo. O usuário continua conversando com **um único Alix** — a multi-agência é interna, invisível no chat.

```
┌─────────────────────────────────────────────────────────────┐
│                      ALIX ORCHESTRATOR                      │
│   (Sonnet 4.6 · roteador · pergunta de clareza · HITL)      │
│                                                             │
│   Tools próprias:                                           │
│   • delegate_deal_analyzer(goal, clienteId, leadId?)        │
│   • delegate_web_researcher(query, sources?)                │
│   • delegate_crm_writer(intent, payload) [HITL alto-imp.]   │
│   • delegate_doc_generator(tipo, input)                     │
│   • buscar_cliente, buscar_lead, buscar_dossie, memória     │
└────────────┬──────────────┬──────────────┬──────────────────┘
             │              │              │
    ┌────────▼──────┐ ┌─────▼──────┐ ┌────▼──────┐ ┌──────────────┐
    │ DealAnalyzer  │ │ WebResearch│ │CRMWriter  │ │DocGenerator  │
    │  Opus 4.7     │ │ Sonnet 4.6 │ │Sonnet 4.6 │ │ Sonnet 4.6   │
    │  + thinking   │ │            │ │           │ │              │
    │               │ │            │ │           │ │              │
    │ • prospecção  │ │• web_search│ │• criar    │ │• proposta    │
    │ • dossiê      │ │  nativa    │ │  cliente* │ │• parecer     │
    │ • KB jurídica │ │• scraping  │ │• criar    │ │• BSC relat.  │
    │ • simuladores │ │  dirigido  │ │  proposta*│ │• fluxo caixa │
    │ • BSC/SICOR   │ │• CVM/CNAE  │ │• promover │ │• memória     │
    │ • RAG docs    │ │• Jusbrasil │ │  lead*    │ │• dossiê full │
    │               │ │            │ │• criar    │ │              │
    │               │ │            │ │  tarefa   │ │              │
    │               │ │            │ │  evento   │ │              │
    │               │ │            │ │  nota     │ │              │
    │               │ │            │ │ (*)=HITL  │ │              │
    └───────────────┘ └────────────┘ └───────────┘ └──────────────┘
          ↓                ↓               ↓              ↓
      ┌─────────────────────────────────────────────────────┐
      │  DataSourceManager · LeadsRepository · KB · Foundry │
      └─────────────────────────────────────────────────────┘
```

**Data flow principal:**

1. Usuário chat → `POST /api/alix/chat`
2. `OrchestratorService.chat()` roda em Sonnet 4.6 com tools `delegate_*` + tools leves
3. Orchestrator decide delegar (ex.: "estudo de caso" → DealAnalyzer)
4. Sub-agente roda `runClaude(...)` próprio com suas tools, pode delegar a outros sub-agentes (ex.: DealAnalyzer chama WebResearcher em paralelo)
5. Sub-agente retorna `SubAgentResult` para Orchestrator
6. Orchestrator consolida, decide próximo passo, ou entrega ao usuário
7. Ações de alto impacto criam **pending confirmation** via `AlixConfirmationStore` → UI → user aplica

**Estado**: cada sub-agente tem contexto temporário (não persiste). Só o Orchestrator tem `ChatSession` persistida em disco. Sub-agentes são invocações puras.

**Backward compat**: as 79 tools atuais ficam mapeadas nos sub-agentes. Endpoint `/api/alix/chat` continua idêntico. UI Wave 10 não precisa mudança para funcionar; Seção 7 adiciona componentes extras para a experiência plena.

---

## 3 · Interface Comum dos Sub-Agentes

```ts
// apps/api/src/services/alix/agents/types.ts
export interface SubAgent {
  name: string;
  model: string;                  // claude-opus-4-7 | claude-sonnet-4-6
  buildSystemPrompt(ctx: SubAgentContext): string;
  buildTools(ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry };
  run(goal: string, ctx: SubAgentContext): Promise<SubAgentResult>;
}

export interface SubAgentContext {
  sessionId: string;
  clienteId?: string;
  leadCpfCnpj?: string;
  orchestratorHistory: ChatMessage[];   // últimas 10 msgs
  parentToolCalls: string[];            // evita recursão
  hitl: boolean;
}

export interface SubAgentResult {
  agent: string;
  summary: string;                      // markdown para Orchestrator
  artifacts?: Array<{ type: 'pdf'|'docx'|'xlsx'|'markdown'|'json'; url?: string; data?: unknown }>;
  toolCalls: string[];
  pendingConfirmations?: string[];      // IDs criados
  usage: { inputTokens: number; outputTokens: number; iterations: number; thinkingTokens?: number };
}
```

---

## 4 · Catálogo dos 4 Sub-Agentes

### 4.1 · DealAnalyzer (cérebro estratégico)

| Item | Valor |
|---|---|
| Arquivo | `apps/api/src/services/alix/agents/DealAnalyzerAgent.ts` |
| Modelo | `claude-opus-4-7` |
| Extended thinking | `enabled`, `budget_tokens: 8000` |
| maxTokens | 16000 |
| maxIterations | 25 |
| Quando é chamado | "analisa", "estruture", "vale a pena", "quanto daria", "estudo de caso", "recomenda" |

**Tools (~30):**
- **Prospecção** (✚ novas no Alix): `buscar_lead`, `listar_leads_filtrados`, `enriquecer_lead`, `scoring_lead`, `sicar_lead`, `top_leads_by_score`
- **CRM**: `buscar_cliente`, `buscar_dossie`, `dossie_producao`, `dossie_dividas`, `memoria_cliente_ler`
- **Jurídico**: `sumula_stj`, `mcr_secao`, `precedentes_busca`, `proagro_regras`, `busca_conhecimento`
- **Financeiro**: `simular_amortizacao`, `simular_reforma_tributaria`, `calcular_funrural`, `simular_desenrola_rural`, `taxa_efetiva`, `dias_uteis_entre`
- **BSC/SICOR**: `listar_kpis_bsc`, `calcular_bsc`, `consultar_sicor_resumo_uf`, `consultar_sicor_contratos`
- **Contextual**: `cambio_atual`, `commodity_preco`, `clima_previsao`, `sazonalidade`, `market_brief`
- **Delegação lateral**: `delegate_web_researcher(query)` — pede due-diligence externa sem voltar ao Orchestrator

**System prompt (essência)**: consultor sênior ALETIS, OODA loop explícito, produz estudo de caso em markdown estruturado (Observação/Orientação/Decisão/Ação), cita fontes, chama web researcher quando faltar contexto externo.

### 4.2 · WebResearcher (due-diligence externa)

| Item | Valor |
|---|---|
| Arquivo | `apps/api/src/services/alix/agents/WebResearcherAgent.ts` |
| Modelo | `claude-sonnet-4-6` |
| maxTokens | 8000 |
| maxIterations | 15 |
| Quando é chamado | "procura", "no Google", "no CVM", "no Jusbrasil", "notícias sobre" |

**Tools (✚ novas):**
- `web_search` (nativa Claude via Anthropic SDK) — **ou** `web_search_tavily` como fallback
- `fetch_url(url)` — GET + readability → markdown limpo
- `consultar_cvm(cnpj)` — scraper CVM/B3 (RJ, RE, fatos relevantes)
- `consultar_jusbrasil(nome_ou_cpf)` — processos públicos
- `consultar_cnpj_detalhado(cnpj)` — BrasilAPI + Receita
- `consultar_google_noticias(query)` — RSS/Tavily filtrado `site:*.br`
- `consultar_receita_publica(cnpj|cpf)` — situação fiscal sumária

**System prompt (essência)**: priorize fontes oficiais antes de notícias, sempre retorne URLs, nunca invente — se não achou, diga "não encontrado".

### 4.3 · CRMWriter (agente executor)

| Item | Valor |
|---|---|
| Arquivo | `apps/api/src/services/alix/agents/CRMWriterAgent.ts` |
| Modelo | `claude-sonnet-4-6` |
| maxTokens | 4000 |
| maxIterations | 10 |
| Quando é chamado | "cria", "promove", "atualiza", "envia", "agenda" |

**Tools — divisão por impacto:**

**Direto (sem HITL):**
- `criar_tarefa` · `criar_evento_cliente` · `memoria_cliente_adicionar_nota` · `memoria_cliente_atualizar` · `anexar_documento_cliente` (✚) · `atualizar_plano_custeio` (rascunho)

**HITL obrigatório (✚ todas novas ou upgrade):**
- `criar_cliente` · `promover_lead_para_cliente` · `criar_proposta_inteligente` · `atualizar_proposta` · `atualizar_dossie_dividas` · `enviar_whatsapp_real` · `agendar_reuniao_real` · `criar_plano_custeio_oficial`

**Mecânica HITL unificada:**

```ts
async function callHITL(toolName, payload, ctx) {
  const confirmationId = await AlixConfirmationStore.createPending({
    sessionId: ctx.sessionId,
    tool: toolName,
    payload,
    summary: renderSummary(toolName, payload),
    impact: 'high',
  });
  return { status: 'pending_confirmation', confirmationId, summary };
}
```

**System prompt (essência)**: valide payload contra estado atual antes de chamar tool HITL. Nunca chame 2 HITL sem retornar entre elas. Payloads incompletos → pergunte ao orquestrador.

### 4.4 · DocGenerator (artefatos)

| Item | Valor |
|---|---|
| Arquivo | `apps/api/src/services/alix/agents/DocGeneratorAgent.ts` |
| Modelo | `claude-sonnet-4-6` |
| maxTokens | 6000 |
| maxIterations | 8 |
| Quando é chamado | "gera PDF", "monta dossiê", "exporta XLSX", "gera parecer" |

**Tools (reaproveita Wave 9):**
- `gerar_proposta_reestruturacao` · `gerar_parecer_tecnico` · `gerar_relatorio_bsc` · `gerar_fluxo_caixa_xlsx` · `gerar_memoria_calculo_docx` · `gerar_plano_custeio_pdf`
- `gerar_dossie_completo` (✚) — consolida proposta + parecer + BSC + fluxo em 1 PDF mestre com capa, TOC

---

## 5 · Custo Estimado por Pipeline

Ref: "analisa lead X e cria proposta"

| Componente | Iterações | Modelo | Custo (USD) |
|---|---|---|---|
| Orchestrator | 3 | Sonnet 4.6 | ~0,02 |
| DealAnalyzer | 15 | Opus 4.7 + thinking | ~0,40 |
| WebResearcher (paralelo) | 8 | Sonnet 4.6 | ~0,04 |
| CRMWriter | 4 | Sonnet 4.6 | ~0,01 |
| DocGenerator | 3 | Sonnet 4.6 | ~0,01 |
| **Total** | ~33 | — | **~0,48 USD** |

---

## 6 · Tools Novas — Catálogo Detalhado

### 6.1 · Prospecção (6 tools ✚, todas no DealAnalyzer + Orchestrator tools leves)

| Tool | Input | Output | Handler |
|---|---|---|---|
| `listar_leads_filtrados` | `{ uf?, ufs?, minHa?, maxHa?, minDivida?, maxDivida?, temAjuizada?, cnaeAgro?, page?, limit?, sortBy? }` | `{ items: LeadEnriched[], total, stats }` | `ProspeccaoService.buscar()` |
| `buscar_lead` | `{ cpfCnpj }` | `LeadEnriched` | `ProspeccaoService.getLead()` |
| `enriquecer_lead` | `{ cpfCnpj, sources?: ['cnpj','viacep','ibge','sicar','nasa'] }` | `LeadEnriched` | `EnrichmentQueue.enqueue()` + poll |
| `stats_prospeccao` | `{ uf? }` | agregados | `ProspeccaoService.stats()` |
| `top_leads_by_score` | `{ n: 10, criterio: 'score'\|'divida'\|'hectares' }` | top N | `ScoringEngine.rank()` |
| `registrar_contato_lead` | `{ cpfCnpj, tipo, canal, observacao }` | `{ ok, outcomeId }` | `LeadsRepository.addOutcome()` (novo método) |

### 6.2 · Web / Due-Diligence (7 tools ✚, todas no WebResearcher)

Ver 4.2 para lista. `WebSearchProviderFactory` escolhe entre `ClaudeNativeWebSearch` e `TavilyWebSearch` no boot.

### 6.3 · Escrita CRM (10 tools ✚ ou upgrade)

Ver 4.3 para lista + mecânica HITL.

### 6.4 · Geração (1 tool ✚: `gerar_dossie_completo`)

Todas as outras já existem.

### 6.5 · Delegações do Orchestrator

```ts
{ name: 'delegate_deal_analyzer',
  description: 'Delega análise estratégica profunda (estudo de caso, estruturação, recomendação).',
  input_schema: { goal: string, clienteId?: string, leadCpfCnpj?: string,
                  focus?: ['divida','producao','fiscal','credito','tudo'] } }

{ name: 'delegate_web_researcher',
  description: 'Delega due-diligence externa (web, CVM, Jusbrasil, Receita, notícias).',
  input_schema: { query: string,
                  entidade?: { tipo: 'cpf'|'cnpj'|'nome'|'tema', valor: string },
                  sources?: string[] } }

{ name: 'delegate_crm_writer',
  description: 'Delega ações de escrita no CRM. Alto impacto gera confirmação HITL.',
  input_schema: { intent: string, payload: object,
                  clienteId?: string, leadCpfCnpj?: string } }

{ name: 'delegate_doc_generator',
  description: 'Delega geração de artefato (PDF/DOCX/XLSX).',
  input_schema: { tipo: string, input: object } }
```

Orchestrator também tem ~10 **tools leves** (`buscar_cliente`, `listar_clientes`, `buscar_lead`, `cambio_atual`, `commodity_preco`, `memoria_cliente_ler`, `briefing_cliente`, `status_fontes`, `dias_uteis_entre`, `taxa_efetiva`) para responder perguntas factuais sem delegar.

### 6.6 · Totalização

| Categoria | Hoje | Depois | Delta |
|---|---|---|---|
| Tools expostas ao LLM | 79 (blob único) | 14 no Orchestrator + 95 distribuídas entre 4 sub-agentes | +30 tools ✚ |

---

## 7 · HITL Flow + ConfirmationBatch

### 7.1 · Problema

`AlixConfirmationStore` atual trata **1 confirmação por vez**. Pipeline multi-agente pode emitir até 5 confirmações juntas. Precisa evoluir.

### 7.2 · Solução: ConfirmationBatch

```ts
// services/alix/AlixConfirmationStore.ts — upgrade
export interface ConfirmationBatch {
  batchId: string;
  sessionId: string;
  createdAt: number;
  title: string;
  pendings: PendingConfirmation[];
  status: 'pending' | 'partial_applied' | 'all_applied' | 'cancelled';
  summary: string;
}

createBatch(sessionId, title, pendings[]): ConfirmationBatch
applyBatch(batchId, { only?: string[] }): { applied: string[], failed: string[], skipped: string[] }
cancelBatch(batchId, { only?: string[] }): { cancelled: string[] }
```

**Novos endpoints:**
- `POST /api/alix/confirmations/batch/:batchId/apply` (body `{ only?: string[] }`)
- `POST /api/alix/confirmations/batch/:batchId/cancel`

### 7.3 · Ordem de execução com dependências

Cada `PendingConfirmation` ganha campo `dependsOn: string[]` (IDs de outras pendings do mesmo batch). `applyBatch` faz **topological sort** e executa em ordem, passando IDs de criação via placeholder `{{batch.conf_X.id}}` no payload.

```ts
{
  confirmationId: 'conf_2',
  tool: 'criar_proposta_inteligente',
  payload: { clienteId: '{{batch.conf_1.clienteId}}', dividaTotal: 487000, ... },
  dependsOn: ['conf_1']
}
```

Se qualquer pending com `dependsOn` tem precedente falhado → marca `skipped`, não executa.

### 7.4 · UI — componentes novos em `apps/web`

- `<AlixConfirmationBatch />` — card consolidado (reutiliza `<AlixConfirmationCard />` existente como filho por-item)
- `<SubagentIndicator />` — pill "🧠 DealAnalyzer pensando..." / "🔎 WebResearcher buscando..." / "✍️ CRMWriter preparando..."

### 7.5 · SSE events novos

- `subagent:active` → `{ agent: string, action: string }`
- `batch:created` → `{ batchId, title, pendings }`
- `batch:progress` → `{ batchId, confirmationId, status: 'applying'|'applied'|'failed' }`
- `batch:done` → `{ batchId, applied, failed, skipped }`

Endpoints legados de confirmação single **inalterados** (backward compat).

### 7.6 · Cancelamento e rollback

- Batch pending → cancelar inteiro antes de apply, sem efeito colateral.
- Batch parcialmente aplicado → **rollback não-automático**. Orchestrator registra timeline: "Pipeline parcial: X aplicado, Y falhou". Christian decide.
- **Exceção**: se `criar_cliente` foi passo recente (<10min) e passo posterior falhou, Orchestrator oferece tool `deletar_cliente_recém_criado`.

### 7.7 · Timeout e retry

- Pending confirmation expira em **1h** (env `ALIX_CONFIRMATION_TTL_SEC=3600`).
- User não responder → batch `expired`; Orchestrator avisa no chat: "Confirmação expirou. Refazer?"
- Tool falha na execução → 2 retries automáticos com backoff exp. Falha final → `status: failed` + log.

---

## 8 · System Prompts

### 8.1 · Orchestrator (integral)

```markdown
Você é o ALIX — o cérebro da ALETIS, consultoria financeira agro do Christian Kohler.

# Quem é o Christian
Sócio-fundador. Vende reestruturação de dívidas rurais para produtores e cooperativas
(casos vivos: Paulo Luciano/Fertiflora, Ailton/Sicoob). Trabalha 1:1, não tem time
grande. Precisa de você como braço direito analítico e executor — não como chatbot.

# Seu papel REAL
Você não é um assistente que responde perguntas. Você é um **consultor sênior agro**
operando dentro do sistema ALETIS. Quando o Christian pergunta algo, seu trabalho é:

1. **OBSERVAR** — quais dados reais existem (CRM, prospecção, dossiês, memória)
2. **ORIENTAR** — contextualizar com macro, jurídico, climático, competitivo
3. **DECIDIR** — recomendar estratégia com números, explicitamente
4. **AGIR** — executar no sistema (com confirmação para ações de alto impacto)

Se falta dado, você busca (tool ou web). Se falta capacidade, você delega a sub-agentes:
- `delegate_deal_analyzer` — estudo de caso, estruturação, análise jurídico-financeira profunda
- `delegate_web_researcher` — due-diligence externa (CVM, Jusbrasil, Receita, notícias)
- `delegate_crm_writer` — escrever no sistema (cria cliente, proposta, promove lead)
- `delegate_doc_generator` — gerar PDF/DOCX/XLSX

Você é o PM dos sub-agentes. Eles reportam a você. Você sintetiza para o Christian.

# Data de hoje
${hoje}

# Como o Christian pensa
Ele não quer resposta educada, quer resposta útil. Prefere:
- Números redondos com fonte
- Recomendação explícita ("faria X porque Y") ao invés de lista neutra
- Próxima ação concreta ao final de cada resposta
- Markdown com bullets quando há 3+ itens, texto corrido quando é 1 ideia
- Sem "claro!", "com certeza!", sem emoji no corpo do texto
- Aceita discordância técnica se for bem fundamentada

# Quando delegar vs responder direto
- Pergunta factual rápida ("qual câmbio?", "qual cliente X?") → responde com tool leve, SEM delegar
- Qualquer "analise", "estruture", "vale a pena", "quanto daria", "o que sugere" sobre CLIENTE/LEAD → delega para DealAnalyzer
- Busca externa ("procura", "no Google", "no CVM", "no Jusbrasil") → delega para WebResearcher
- Ação de escrever no sistema → delega para CRMWriter
- "Gera PDF/documento" → delega para DocGenerator
- Pipeline completo (ex: "pega lead X, analisa e cria proposta") → cascata: DealAnalyzer → apresenta resultado → pergunta → CRMWriter + DocGenerator

# Pipeline canônico: "estuda esse lead"
1. DealAnalyzer com goal="estudo de caso completo" → produz análise
2. Você apresenta no chat (resumo executivo + link para análise completa)
3. Pergunta: "Quer que eu execute o onboarding? (promover lead → cliente,
   criar proposta inteligente, gerar dossiê PDF, criar tarefa de follow-up)"
4. Se sim → CRMWriter + DocGenerator (em batch HITL)

# Regras de voz
- Linguagem direta, técnica, SEM floreio
- Valores em BRL formatados (R$ 1.234,56)
- Datas YYYY-MM-DD ou pt-BR
- SEMPRE cite as fontes (tools ou URLs) que foram usadas
- Se tool falhar, diga exatamente o que falhou — não simule sucesso
- Respostas curtas quando possível (3-8 linhas). Bullets quando listar 3+ itens.

# Base jurídica disponível
${Object.keys(SUMULAS_STJ).length} súmulas STJ, ${Object.keys(MCR_SECOES).length} seções MCR, Plano Safra
2025/26, Proagro, precedentes. Sub-agentes acessam direto.

# NUNCA
- Invente números. Sempre puxe da tool.
- Prometa garantia absoluta ("vai funcionar 100%"). Diga "historicamente X% dos casos similares deram Y".
- Exponha dados sensíveis de outros clientes quando estiver falando de um caso específico.
- Chame 2 tools HITL em sequência sem agregar em batch.
- Responda "vou fazer X" e não fazer. Se vai executar, execute agora.

# Memória persistente
Você tem memória por cliente (AlixMemoryService). Quando um `clienteId` vem no contexto,
a memória é injetada automaticamente abaixo deste prompt. Use-a como contexto prioritário.
Ao decidir algo relevante novo, grave via `memoria_cliente_adicionar_nota`.
```

### 8.2 · DealAnalyzer

> "Você é o analista sênior da ALETIS. Dado um cliente/lead, produza um estudo de caso OODA completo com: (1) foto da dívida + garantias + situação produtiva, (2) contexto macro/jurídico/climático aplicável, (3) recomendação de estratégia com números e precedentes, (4) próximas ações concretas. Use extended thinking. Chame `delegate_web_researcher` quando faltar contexto externo. Entregue em markdown estruturado."

### 8.3 · WebResearcher

> "Você busca informação pública externa. Priorize fontes oficiais (Receita, CVM, PGFN, INPE, Jusbrasil) antes de notícias. Sempre retorne URLs. Se não achou, diga 'não encontrado' — nunca invente."

### 8.4 · CRMWriter

> "Você escreve no sistema com precisão. Ações de baixo impacto (tarefa, evento, nota) execute direto. Ações de alto impacto criem pending confirmation. Valide payload contra estado atual (`buscar_cliente` antes de atualizar). Nunca chame 2 tools HITL sem retornar ao orquestrador."

### 8.5 · DocGenerator

> "Você gera artefatos. Receba input estruturado, escolha a tool certa, retorne URL."

### 8.6 · Injeção dinâmica de contexto

Cada sub-agente tem `buildSystemPrompt(ctx)` que injeta:
- `ctx.clienteId` → resumo da memória + último briefing
- `ctx.leadCpfCnpj` → enriquecimento atual do lead
- `ctx.orchestratorHistory` → últimas 3-5 msgs do chat
- `ctx.parentToolCalls` → evita recursão

Todos os prompts usam `cache_control: { type: 'ephemeral' }`.

---

## 9 · Roteamento de Modelo + Extended Thinking + Web Search

### 9.1 · Modelo por componente (determinístico)

| Componente | Modelo | Justificativa |
|---|---|---|
| Orchestrator | `claude-sonnet-4-6` | Rápido, barato, suficiente para rotear |
| DealAnalyzer | `claude-opus-4-7` + thinking | Análise profunda multi-passo |
| WebResearcher | `claude-sonnet-4-6` | Síntese de busca |
| CRMWriter | `claude-sonnet-4-6` | Ação rápida, valida payload |
| DocGenerator | `claude-sonnet-4-6` | Preenche template |

**Overrides:**
- Env: `ALIX_ORCHESTRATOR_MODEL`, `ALIX_DEAL_ANALYZER_MODEL`, `ALIX_WEB_RESEARCHER_MODEL`, `ALIX_CRM_WRITER_MODEL`, `ALIX_DOC_GENERATOR_MODEL`
- Query: `POST /api/alix/chat?forceOpus=1` → Orchestrator e CRMWriter também em Opus nesta sessão
- Flag de sessão: `ChatSession.metadata.mode = 'fast'|'deep'`. `deep` → Opus em tudo. UI tem toggle discreto.

### 9.2 · Extended thinking (só DealAnalyzer)

```ts
const response = await runClaude(messages, {
  model: 'claude-opus-4-7',
  maxTokens: 16000,
  thinking: { type: 'enabled', budget_tokens: 8000 },
  tools, toolRegistry,
  maxIterations: 25,
});
```

- **Budget 8000 tokens/iter** → modelo pensa antes de agir
- **Log**: `storage/alix-sessions/{sessionId}/thinking.jsonl` (não aparece no chat, mas auditável)
- **Custo**: ~0,12 USD extra por análise típica (20 iter × 8000 tok × $0,075/Mtok)

> `runClaude()` atual em `ClaudeFoundryClient.ts` não expõe `thinking`. Adicionar `ClaudeRunOpts.thinking` e passar para Anthropic SDK.

### 9.3 · Web search — verificação do Foundry

**Etapa 1** (verificação na boot): `pingFoundryWebSearch()` tenta criar mensagem com `tools: [{ type: "web_search_20250305", name: "web_search" }]` e query "capital do Brasil". Se 200 → nativa ativa. Se 400/unsupported → fallback.

**Etapa 2** (fallback Tavily): `web_search_tavily` como tool custom
- Cliente: `tavily-js` (npm)
- Env: `TAVILY_API_KEY`
- Interface: `web_search({ query, max_results, include_domains?, exclude_domains? }) → { results: [{ title, url, content, score }] }`

**Abstração strategy pattern:**

```ts
interface WebSearchProvider {
  search(q: string, opts?: WebSearchOpts): Promise<WebSearchResults>;
}
class ClaudeNativeWebSearch implements WebSearchProvider { /* passa como tool ao LLM */ }
class TavilyWebSearch implements WebSearchProvider { /* HTTP call + expõe como tool custom */ }

function getProvider(): WebSearchProvider {
  if (process.env.ALIX_WEB_SEARCH === 'tavily') return new TavilyWebSearch();
  if (process.env.ALIX_WEB_SEARCH === 'claude') return new ClaudeNativeWebSearch();
  return autoDetect(); // tenta Claude native, cai para Tavily se falhar no boot
}
```

Log na boot: `[ALIX] WebSearch: claude-native` | `[ALIX] WebSearch: tavily`.

### 9.4 · Limites e guards

| Limite | Valor | Enforcement |
|---|---|---|
| Max iterations Orchestrator | 10 | `runClaude` |
| Max iterations DealAnalyzer | 25 | `runClaude` |
| Max iterations WebResearcher | 15 | `runClaude` |
| Max iterations CRMWriter | 10 | `runClaude` |
| Max iterations DocGenerator | 8 | `runClaude` |
| Max total tokens por request (tudo) | 150k | Guard novo no Orchestrator |
| Max duração por request | 120s | Timeout Fastify + SSE keepalive |
| Max delegações aninhadas | 3 | `ctx.parentToolCalls` tracker |

### 9.5 · Telemetria

JSONL em `storage/alix-sessions/{sessionId}/telemetry.jsonl`:

```json
{"ts":"2026-04-23T14:52:10Z","agent":"DealAnalyzer","iter":14,
 "toolCalls":["buscar_lead","simular_amortizacao","delegate_web_researcher"],
 "inputTokens":12450,"outputTokens":2100,"thinkingTokens":6200,
 "cacheRead":8900,"cacheCreate":3100,"latencyMs":18400,"cost":0.38}
```

Rota nova: `GET /api/alix/telemetry/:sessionId` → agregados (custo, tempo, iterações por agente).

UI: footer da sessão "Custo desta conversa: R$ 2,40 · 4 sub-agentes · 32 iterações".

---

## 10 · Fases de Implementação

| Fase | Entrega | Verificação |
|---|---|---|
| **F0 · Fundação** | `ClaudeFoundryClient`: `thinking` opt + detecção de web search nativa. `SubAgent` interface + types. | `pingFoundry()` passa. Teste com tool web_search detecta suporte. |
| **F1 · Tools de prospecção** | 6 tools novas em `services/alix/tools/prospeccao.ts`, expostas no Alix atual (antes mesmo da refatoração multi-agente) | "lista top 5 leads de MT com dívida > R$ 500k" → dados reais |
| **F2 · Web Search** | `WebSearchProviderFactory` + `ClaudeNativeWebSearch` + `TavilyWebSearch`. Tool `web_search` no Alix atual. | "Busca notícias moratória soja 2026" → URLs reais |
| **F3 · Esqueleto multi-agente** | `OrchestratorService` + 4 sub-agentes + `delegate_*` tools. `/api/alix/chat` inalterado, mas internamente passa pelo Orchestrator. | "oi" (sem delegação), "qual câmbio" (tool leve), "analisa cliente X" (delega DealAnalyzer) |
| **F4 · Tools CRUD HITL** | 10 tools em `CRMWriterAgent` + `ConfirmationBatch` + endpoint `/api/alix/confirmations/batch/:id/apply` | "Cria cliente João Silva" → pending → aplica → cliente criado |
| **F5 · UI Wave 10+** | `<AlixConfirmationBatch />`, `<SubagentIndicator />`, SSE events novos | Pipeline completo em browser |
| **F6 · System prompts** | Prompts novos + cache de prompt configurado | Tom "insano" sentido; comparar 1 resposta antes/depois |
| **F7 · Extended thinking + telemetria** | Thinking no DealAnalyzer. JSONL + rota `/api/alix/telemetry/:sessionId` | `thinking.jsonl` populado, custo medido |
| **F8 · Pipeline E2E** | Golden test: "pega top lead MT com dívida > R$ 300k, faz estudo completo, pede confirmação para criar cliente + proposta + dossiê" | End-to-end verde, custo < R$ 3,00 |

Cada fase = 1 PR (ou commit coeso).

---

## 11 · Estratégia de Testes

### 11.1 · Unitários (vitest)

- `OrchestratorService.routeDelegation()` — mock LLM, assert qual delegate tool foi chamado
- `ConfirmationBatch` — topological sort, apply ordenado, dependsOn com skip em falha
- `WebSearchProviderFactory` — auto-detect com mock `runClaude`
- Cada `delegate_*` tool handler — schema validation, error paths

### 11.2 · Integração (opt-in `RUN_LLM_TESTS=1`)

- **Golden 1**: "liste top 3 leads MT com dívida > R$ 300k" → 3 leads com scoring
- **Golden 2**: "analisa lead CPF 12345678901" → DealAnalyzer full OODA, markdown estruturado, cita fontes
- **Golden 3** (pipeline): "pega esse lead e faz onboarding completo" → batch de 4 pendings → apply → cliente + proposta + PDF existem
- **Golden 4** (web): "procura notícias Pronaf 2026" → WebResearcher retorna ≥3 URLs `*.br`

### 11.3 · Fixtures

`apps/api/tests/fixtures/leads-gold.json` — 3 leads sintéticos (PF, PJ cooperativa, PJ falida) derivados de dump PGFN de teste.

---

## 12 · Backward Compat + Feature Flag

- `POST /api/alix/chat` mantém contrato idêntico (request/response shape)
- 79 tools atuais continuam funcionando (handlers reutilizados nos sub-agentes)
- Sessões existentes em `storage/alix-sessions/` lidas sem migração; campo novo `subagentTrace` é opcional
- Feature flag `ALIX_MULTIAGENT_ENABLED=true` (default `true` após F3). Se `false` → Orchestrator vira `AlixService` monolítico antigo (cai no blob de 4846 linhas). Rollback de 1 env var.

---

## 13 · Riscos + Mitigação

| Risco | Prob | Mitigação |
|---|---|---|
| Foundry não suporta web_search nativa | Média | Fallback Tavily já na spec, decisão no boot |
| Foundry não suporta extended thinking | Baixa | Catch específico; se 400, desativa thinking, mantém Opus sem. Log warning. |
| Custo por pipeline > esperado | Média | Telemetria desde F7. >R$ 5/pipeline → ajustar `maxIterations`. |
| Batch com 5 HITL sobrecarrega usuário | Baixa | "Aplicar tudo" + "revisar um por vez". Collapse default. |
| Loop de delegação (Orch ↔ DealAnalyzer) | Baixa | `parentToolCalls` limita aninhamento a 3. Test F3. |
| Migração quebra sessões antigas | Baixa | Campos novos opcionais. Test F3 com sessão antiga. |
| Scraping CVM/Jusbrasil frágil | Média | Circuit breaker: 3 falhas consecutivas → WebResearcher volta para web_search nativa |

---

## 14 · Escopo Explicitamente Fora (YAGNI)

- UI "painel gráfico de sub-agentes" (só pill discreta)
- Sub-agentes customizáveis pelo usuário (hardcoded 4)
- Voice/ASR (chat text-only)
- Fine-tuning (só prompt engineering + tool use)
- Rollback automático de batch parcial (Christian decide manualmente)
- Cache de RAG além do atual (ortogonal)

---

## 15 · Arquivos Criados / Modificados

**Criados:**
- `apps/api/src/services/alix/agents/types.ts`
- `apps/api/src/services/alix/agents/DealAnalyzerAgent.ts`
- `apps/api/src/services/alix/agents/WebResearcherAgent.ts`
- `apps/api/src/services/alix/agents/CRMWriterAgent.ts`
- `apps/api/src/services/alix/agents/DocGeneratorAgent.ts`
- `apps/api/src/services/alix/OrchestratorService.ts`
- `apps/api/src/services/alix/tools/prospeccao.ts`
- `apps/api/src/services/alix/tools/websearch/WebSearchProvider.ts`
- `apps/api/src/services/alix/tools/websearch/ClaudeNativeWebSearch.ts`
- `apps/api/src/services/alix/tools/websearch/TavilyWebSearch.ts`
- `apps/api/src/services/alix/tools/websearch/scrapers/cvm.ts`
- `apps/api/src/services/alix/tools/websearch/scrapers/jusbrasil.ts`
- `apps/api/src/services/alix/tools/crm/writer.ts` (tools HITL)
- `apps/web/src/components/alix/AlixConfirmationBatch.tsx`
- `apps/web/src/components/alix/SubagentIndicator.tsx`
- `apps/api/tests/fixtures/leads-gold.json`
- Testes correspondentes

**Modificados:**
- `apps/api/src/services/llm/ClaudeFoundryClient.ts` — `thinking` opt, detecção web_search, logging
- `apps/api/src/services/alix/AlixConfirmationStore.ts` — `ConfirmationBatch` + topological apply
- `apps/api/src/services/AlixService.ts` — desmembrado; vira thin wrapper sobre `OrchestratorService` atrás da feature flag
- `apps/api/src/routes/alix.ts` — chama `OrchestratorService`; adiciona rotas `/confirmations/batch/:id/*` e `/telemetry/:sessionId`
- `apps/api/src/routes/prospeccao.ts` — expõe novo método `LeadsRepository.addOutcome` (se não existir)
- `apps/web` — Wave 10 chat integra novos SSE events e componentes

---

## 16 · Go/No-Go

Este spec é **executável em ~8 fases**, com cada fase entregável e testável. Risco total dominado pela telemetria desde F7 (custo real medido) e pela feature flag (rollback de 1 env var).

Próximo passo após aprovação: invocar `writing-plans` para detalhar plano de implementação fase a fase com tarefas granulares, acceptance criteria, arquivos exatos e ordem de commits.
