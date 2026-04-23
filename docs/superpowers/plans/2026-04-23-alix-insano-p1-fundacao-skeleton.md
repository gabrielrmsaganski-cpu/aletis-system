# ALIX Insano — Plano 1: Fundação + Skeleton Multi-Agente (F0–F3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um Alix que (a) detecta suporte a `web_search` e `thinking` no Foundry da conta, (b) acessa a aba Prospecção via 6 tools novas, (c) tem web search funcional (nativa ou Tavily fallback), (d) roda internamente através de um Orchestrator que delega para 4 sub-agentes — com backward-compat total via feature flag.

**Architecture:** Sem quebrar nada. Primeiro injetamos `thinking` opt no `ClaudeFoundryClient` e criamos tipos de sub-agente. Depois adicionamos tools (prospecção, web) ao Alix atual — já melhora capacidade sem mudar arquitetura. Por último refatoramos `AlixService` para delegar a um `OrchestratorService` que invoca `DealAnalyzer`/`WebResearcher`/`CRMWriter`/`DocGenerator` via tool-use — tudo atrás de flag `ALIX_MULTIAGENT_ENABLED`.

**Tech Stack:** TypeScript 5.7 (ESM) · Fastify 5 · Anthropic SDK 0.90 · Node built-in test runner (`node --test`) · `tsx` para executar TS em dev · pnpm workspaces · turbo.

**Ref do spec:** `docs/superpowers/specs/2026-04-23-alix-insano-design.md` (commit `e143b0c`)

---

## File Structure

### Criados

| Arquivo | Responsabilidade |
|---|---|
| `apps/api/src/services/alix/agents/types.ts` | Interface `SubAgent`, `SubAgentContext`, `SubAgentResult` |
| `apps/api/src/services/alix/agents/BaseAgent.ts` | Abstração comum (runClaude wrapper + parentToolCalls guard) |
| `apps/api/src/services/alix/agents/DealAnalyzerAgent.ts` | Análise estratégica (Opus 4.7 + thinking quando suportado) |
| `apps/api/src/services/alix/agents/WebResearcherAgent.ts` | Due-diligence externa |
| `apps/api/src/services/alix/agents/CRMWriterAgent.ts` | Escrita no CRM (F3: só low-impact; F4 adiciona HITL) |
| `apps/api/src/services/alix/agents/DocGeneratorAgent.ts` | Geração de artefatos |
| `apps/api/src/services/alix/OrchestratorService.ts` | Orquestrador principal + 4 delegate_* + tools leves |
| `apps/api/src/services/alix/tools/prospeccao.ts` | 6 tools de prospecção |
| `apps/api/src/services/alix/tools/websearch/types.ts` | Interface `WebSearchProvider`, types |
| `apps/api/src/services/alix/tools/websearch/ClaudeNativeWebSearch.ts` | Provider que usa `web_search_20250305` |
| `apps/api/src/services/alix/tools/websearch/TavilyWebSearch.ts` | Fallback via Tavily API |
| `apps/api/src/services/alix/tools/websearch/WebSearchProviderFactory.ts` | Auto-detect + singleton |
| `apps/api/src/services/alix/tools/websearch/fetchUrl.ts` | `fetch_url` tool (GET + readability) |
| `apps/api/src/services/alix/tools/websearch/scrapers/cvm.ts` | `consultar_cvm` |
| `apps/api/src/services/alix/tools/websearch/scrapers/jusbrasil.ts` | `consultar_jusbrasil` |
| `apps/api/src/services/alix/tools/websearch/scrapers/cnpj.ts` | `consultar_cnpj_detalhado` |
| `apps/api/tests/alix/prospeccao-tools.test.ts` | Teste das 6 tools |
| `apps/api/tests/alix/websearch-provider.test.ts` | Teste provider factory + tavily mock |
| `apps/api/tests/alix/orchestrator.test.ts` | Teste de delegação do orquestrador |
| `apps/api/tests/alix/regression.test.ts` | Garante que endpoints legados continuam funcionando |

### Modificados

| Arquivo | O quê |
|---|---|
| `apps/api/package.json` | `test` script + `@mozilla/readability` + `jsdom` + `tavily` deps |
| `apps/api/src/services/llm/ClaudeFoundryClient.ts` | `thinking` opt em `ClaudeRunOpts` + `pingFoundryWebSearch()` + `pingFoundryThinking()` |
| `apps/api/src/services/AlixService.ts` | Expor 6 tools de prospecção + tool `web_search` (quando F2 entrega) |
| `apps/api/src/services/prospeccao/LeadsRepository.ts` | Método `addOutcome(cpfCnpj, outcome)` (se não existir) |
| `apps/api/src/routes/alix.ts` | Feature flag `ALIX_MULTIAGENT_ENABLED` — se true, usa `OrchestratorService`; se false, usa `AlixService` legado |

---

## F0 — Fundação

### Task 1: Adicionar test script e dependências necessárias

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Adicionar script `test` e deps**

Edite `apps/api/package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch --env-file=../../.env src/server.ts",
    "build": "tsc",
    "start": "node --env-file=../../.env dist/server.js",
    "test": "node --import tsx --test 'tests/**/*.test.ts'",
    "ingest:pgfn": "tsx scripts/ingest-pgfn.ts",
    "ingest:sicar": "tsx scripts/ingest-sicar.ts",
    "download:sicar": "tsx --env-file=../../.env scripts/download-sicar.ts",
    "refresh:sicar": "tsx --env-file=../../.env scripts/refresh-sicar.ts"
  }
}
```

Adicione em `dependencies`:

```json
"@mozilla/readability": "^0.5.0",
"jsdom": "^25.0.1",
"tavily": "^0.3.0"
```

Adicione em `devDependencies` (criar a chave se não existir):

```json
"@types/jsdom": "^21.1.7"
```

- [ ] **Step 2: Instalar deps**

```bash
cd /home/azureai/ALETIS/aletis-system && pnpm install
```

Expected: deps instaladas sem erro.

- [ ] **Step 3: Criar diretório tests**

```bash
mkdir -p apps/api/tests/alix
```

- [ ] **Step 4: Teste sanity do runner**

Crie `apps/api/tests/sanity.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';

test('node test runner funciona', () => {
  assert.strictEqual(1 + 1, 2);
});
```

- [ ] **Step 5: Rodar**

```bash
cd apps/api && pnpm test
```

Expected: 1 test passando.

- [ ] **Step 6: Commit**

```bash
cd /home/azureai/ALETIS/aletis-system
git add apps/api/package.json apps/api/tests/sanity.test.ts pnpm-lock.yaml
git commit -m "chore(api): adiciona node test runner + deps readability/tavily (Alix Insano F0)"
```

---

### Task 2: Adicionar opção `thinking` em ClaudeRunOpts

**Files:**
- Modify: `apps/api/src/services/llm/ClaudeFoundryClient.ts:143-170` e `:200-220`
- Test: `apps/api/tests/alix/claude-client-thinking.test.ts`

- [ ] **Step 1: Escrever teste que falha**

Crie `apps/api/tests/alix/claude-client-thinking.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import type { ClaudeRunOpts } from '../../src/services/llm/ClaudeFoundryClient.ts';

test('ClaudeRunOpts aceita campo thinking', () => {
  const opts: ClaudeRunOpts = {
    thinking: { type: 'enabled', budget_tokens: 8000 },
  };
  assert.strictEqual(opts.thinking?.type, 'enabled');
  assert.strictEqual(opts.thinking?.budget_tokens, 8000);
});
```

- [ ] **Step 2: Rodar — deve falhar (typecheck)**

```bash
cd apps/api && pnpm test 2>&1 | head -30
```

Expected: falha com TS2353 ou 2322 — campo `thinking` não existe em `ClaudeRunOpts`.

- [ ] **Step 3: Adicionar campo `thinking` ao tipo**

Em `apps/api/src/services/llm/ClaudeFoundryClient.ts`, localize `export interface ClaudeRunOpts` (~linha 143) e adicione antes do `}`:

```ts
  /** Extended thinking (Claude 4). Só use com Opus 4.7. */
  thinking?: { type: 'enabled'; budget_tokens: number };
```

Na destructuring de opts dentro de `runClaude` (~linha 177), adicione:

```ts
  const {
    model = CLAUDE_MODEL_SONNET,
    maxTokens = 2048,
    system,
    tools,
    toolRegistry,
    maxIterations = 6,
    temperature = 0.2,
    onToolCall,
    thinking,        // <-- adicionado
  } = opts;
```

E nos dois blocos `client.messages.create({...})` (tem 2: o try e o catch-retry), adicione `thinking` logo após `temperature`:

```ts
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        ...(thinking ? { thinking } : {}),     // <-- adicionado
        ...(system ? { system: system as any } : {}),
        ...(tools && tools.length > 0 ? { tools: tools as any } : {}),
        messages: convo as any,
      });
```

- [ ] **Step 4: Rodar — deve passar**

```bash
cd apps/api && pnpm test tests/alix/claude-client-thinking.test.ts 2>&1 | tail -10
```

Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/llm/ClaudeFoundryClient.ts apps/api/tests/alix/claude-client-thinking.test.ts
git commit -m "feat(llm): ClaudeRunOpts aceita extended thinking (Alix Insano F0)"
```

---

### Task 3: Adicionar `pingFoundryWebSearch()` e `pingFoundryThinking()` para detecção de capabilities

**Files:**
- Modify: `apps/api/src/services/llm/ClaudeFoundryClient.ts` (adiciona funções perto do `pingFoundry` existente, ~linha 324)

- [ ] **Step 1: Adicionar funções ao final do arquivo**

Em `apps/api/src/services/llm/ClaudeFoundryClient.ts`, depois de `pingFoundry`, adicione:

```ts
/**
 * Verifica se o Foundry expõe a tool nativa `web_search_20250305`.
 * Faz 1 chamada pequena; retorna true se a API aceitou o tool, false caso contrário.
 */
export async function pingFoundryWebSearch(): Promise<{ supported: boolean; error?: string }> {
  try {
    const client = await getClient();
    await client.messages.create({
      model: CLAUDE_MODEL_SONNET,
      max_tokens: 256,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{ role: 'user', content: 'Qual a capital do Brasil?' }],
    });
    return { supported: true };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/400|unsupported|invalid.*tool|web_search/i.test(msg)) {
      return { supported: false, error: msg };
    }
    // Outros erros (401, rede) não decidem suporte — repropaga
    throw err;
  }
}

/**
 * Verifica se o Foundry suporta extended thinking em Opus 4.7.
 */
export async function pingFoundryThinking(): Promise<{ supported: boolean; error?: string }> {
  try {
    const client = await getClient();
    await client.messages.create({
      model: CLAUDE_MODEL_OPUS,
      max_tokens: 1024,
      thinking: { type: 'enabled', budget_tokens: 512 } as any,
      messages: [{ role: 'user', content: 'Diga "ok".' }],
    });
    return { supported: true };
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/400|unsupported|invalid|thinking/i.test(msg)) {
      return { supported: false, error: msg };
    }
    throw err;
  }
}
```

- [ ] **Step 2: Criar teste de integração (opt-in)**

Crie `apps/api/tests/alix/foundry-capabilities.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { pingFoundryWebSearch, pingFoundryThinking, isLLMEnabled } from '../../src/services/llm/ClaudeFoundryClient.ts';

const runLLM = process.env.RUN_LLM_TESTS === '1';

test('pingFoundryWebSearch retorna supported boolean', { skip: !runLLM || !isLLMEnabled() }, async () => {
  const res = await pingFoundryWebSearch();
  assert.strictEqual(typeof res.supported, 'boolean');
  console.log('[cap] web_search nativa:', res.supported, res.error || '');
});

test('pingFoundryThinking retorna supported boolean', { skip: !runLLM || !isLLMEnabled() }, async () => {
  const res = await pingFoundryThinking();
  assert.strictEqual(typeof res.supported, 'boolean');
  console.log('[cap] thinking em Opus 4.7:', res.supported, res.error || '');
});
```

- [ ] **Step 3: Rodar pela primeira vez (com LLM real) para mapear capacidades**

```bash
cd /home/azureai/ALETIS/aletis-system
RUN_LLM_TESTS=1 pnpm --filter @aletis/api test tests/alix/foundry-capabilities.test.ts 2>&1 | tail -20
```

Expected: imprime no console se web_search e thinking estão suportados. **Anote o resultado** — vai informar as próximas tasks.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/llm/ClaudeFoundryClient.ts apps/api/tests/alix/foundry-capabilities.test.ts
git commit -m "feat(llm): detecção de capabilities web_search e thinking no Foundry (Alix Insano F0)"
```

---

### Task 4: Criar `SubAgent` interface + types

**Files:**
- Create: `apps/api/src/services/alix/agents/types.ts`
- Test: `apps/api/tests/alix/subagent-types.test.ts`

- [ ] **Step 1: Escrever teste**

Crie `apps/api/tests/alix/subagent-types.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import type { SubAgent, SubAgentContext, SubAgentResult } from '../../src/services/alix/agents/types.ts';

test('SubAgent tem shape esperado', () => {
  const fake: SubAgent = {
    name: 'FakeAgent',
    model: 'claude-sonnet-4-6',
    buildSystemPrompt: () => 'prompt',
    buildTools: () => ({ tools: [], registry: {} }),
    run: async () => ({
      agent: 'FakeAgent',
      summary: 'ok',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, iterations: 0 },
    }) as SubAgentResult,
  };
  assert.strictEqual(fake.name, 'FakeAgent');
});

test('SubAgentContext aceita parentToolCalls', () => {
  const ctx: SubAgentContext = {
    sessionId: 's1',
    orchestratorHistory: [],
    parentToolCalls: ['delegate_deal_analyzer'],
    hitl: true,
  };
  assert.deepStrictEqual(ctx.parentToolCalls, ['delegate_deal_analyzer']);
});
```

- [ ] **Step 2: Rodar — deve falhar (arquivo não existe)**

```bash
cd apps/api && pnpm test tests/alix/subagent-types.test.ts 2>&1 | head -10
```

Expected: `Cannot find module`.

- [ ] **Step 3: Criar o arquivo de types**

Crie `apps/api/src/services/alix/agents/types.ts`:

```ts
// ============================================================
// ALETIS — SubAgent types (Alix Insano, multi-agent skeleton)
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import type { ChatMessage } from '../../AlixService.js';

export interface SubAgentContext {
  sessionId: string;
  clienteId?: string;
  leadCpfCnpj?: string;
  /** Últimas N mensagens do chat do orquestrador para contexto. */
  orchestratorHistory: ChatMessage[];
  /** Tools já invocadas na cadeia de delegação — evita recursão infinita. */
  parentToolCalls: string[];
  /** Se HITL é requerido para ações de alto impacto. Default true. */
  hitl: boolean;
}

export interface SubAgentArtifact {
  type: 'pdf' | 'docx' | 'xlsx' | 'markdown' | 'json';
  url?: string;
  data?: unknown;
}

export interface SubAgentUsage {
  inputTokens: number;
  outputTokens: number;
  iterations: number;
  thinkingTokens?: number;
  cacheRead?: number;
  cacheCreate?: number;
  latencyMs?: number;
}

export interface SubAgentResult {
  agent: string;
  /** Markdown que o Orchestrator vai digerir e potencialmente entregar ao usuário. */
  summary: string;
  artifacts?: SubAgentArtifact[];
  toolCalls: string[];
  pendingConfirmations?: string[];
  usage: SubAgentUsage;
}

export interface SubAgent {
  name: string;
  model: string;
  buildSystemPrompt(ctx: SubAgentContext): string;
  buildTools(ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry };
  run(goal: string, ctx: SubAgentContext): Promise<SubAgentResult>;
}

/** Limite de aninhamento de delegações para evitar loop. */
export const MAX_DELEGATION_DEPTH = 3;

export class DelegationLoopError extends Error {
  constructor(chain: string[]) {
    super(`Delegation depth exceeded: ${chain.join(' → ')}`);
    this.name = 'DelegationLoopError';
  }
}
```

- [ ] **Step 4: Rodar — deve passar**

```bash
pnpm test tests/alix/subagent-types.test.ts 2>&1 | tail -5
```

Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/alix/agents/types.ts apps/api/tests/alix/subagent-types.test.ts
git commit -m "feat(alix): SubAgent interface + context/result types (F0)"
```

---

### Task 5: Criar `BaseAgent` com runClaude wrapper + delegation depth guard

**Files:**
- Create: `apps/api/src/services/alix/agents/BaseAgent.ts`
- Test: `apps/api/tests/alix/base-agent.test.ts`

- [ ] **Step 1: Escrever teste**

Crie `apps/api/tests/alix/base-agent.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { BaseAgent } from '../../src/services/alix/agents/BaseAgent.ts';
import { DelegationLoopError } from '../../src/services/alix/agents/types.ts';

test('BaseAgent.guardDepth bloqueia aninhamento > 3', () => {
  assert.throws(
    () => BaseAgent.guardDepth(['A', 'B', 'C', 'D']),
    DelegationLoopError,
  );
});

test('BaseAgent.guardDepth permite até 3', () => {
  BaseAgent.guardDepth(['A', 'B', 'C']); // sem erro
  assert.ok(true);
});
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
pnpm test tests/alix/base-agent.test.ts 2>&1 | head -10
```

- [ ] **Step 3: Criar BaseAgent**

Crie `apps/api/src/services/alix/agents/BaseAgent.ts`:

```ts
// ============================================================
// ALETIS — BaseAgent (abstração comum a todos sub-agentes)
// ============================================================

import { runClaude, type ClaudeMessage, type ClaudeTool, type ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import {
  type SubAgent,
  type SubAgentContext,
  type SubAgentResult,
  MAX_DELEGATION_DEPTH,
  DelegationLoopError,
} from './types.js';

export abstract class BaseAgent implements SubAgent {
  abstract name: string;
  abstract model: string;
  abstract maxTokens: number;
  abstract maxIterations: number;
  thinking?: { type: 'enabled'; budget_tokens: number };

  abstract buildSystemPrompt(ctx: SubAgentContext): string;
  abstract buildTools(ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry };

  static guardDepth(parentToolCalls: string[]): void {
    if (parentToolCalls.length >= MAX_DELEGATION_DEPTH) {
      throw new DelegationLoopError(parentToolCalls);
    }
  }

  async run(goal: string, ctx: SubAgentContext): Promise<SubAgentResult> {
    BaseAgent.guardDepth(ctx.parentToolCalls);

    const system = this.buildSystemPrompt(ctx);
    const { tools, registry } = this.buildTools(ctx);
    const toolCalls: string[] = [];
    const startedAt = Date.now();

    const messages: ClaudeMessage[] = [{ role: 'user', content: goal }];

    const result = await runClaude(messages, {
      model: this.model,
      maxTokens: this.maxTokens,
      maxIterations: this.maxIterations,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as any,
      tools,
      toolRegistry: registry,
      ...(this.thinking ? { thinking: this.thinking } : {}),
      onToolCall: (toolName) => {
        toolCalls.push(toolName);
      },
    });

    const latencyMs = Date.now() - startedAt;

    return {
      agent: this.name,
      summary: result.text,
      toolCalls,
      usage: {
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        iterations: result.iterations ?? 1,
        cacheRead: result.cacheRead ?? 0,
        cacheCreate: result.cacheCreate ?? 0,
        latencyMs,
      },
    };
  }
}
```

- [ ] **Step 4: Verificar shape atual de `ClaudeRunResult`**

Abra `apps/api/src/services/llm/ClaudeFoundryClient.ts`, localize `ClaudeRunResult`. Os campos que o BaseAgent lê (`text`, `inputTokens`, `outputTokens`, `iterations`, `cacheRead`, `cacheCreate`) precisam existir. Se algum não existe com esse nome (ex.: o código atual pode usar `totalInput`/`totalOutput`), **ajuste o BaseAgent ao shape real** mapeando corretamente. Rode `pnpm typecheck` para confirmar.

```bash
cd /home/azureai/ALETIS/aletis-system && pnpm typecheck
```

Expected: sem erros em `BaseAgent.ts`.

- [ ] **Step 5: Rodar testes**

```bash
cd apps/api && pnpm test tests/alix/base-agent.test.ts 2>&1 | tail -5
```

Expected: 2 pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/alix/agents/BaseAgent.ts apps/api/tests/alix/base-agent.test.ts
git commit -m "feat(alix): BaseAgent abstract + delegation depth guard (F0)"
```

---

## F1 — Tools de Prospecção

### Task 6: Expor tools de prospecção — parte 1 (`buscar_lead` + `listar_leads_filtrados`)

**Files:**
- Create: `apps/api/src/services/alix/tools/prospeccao.ts`
- Test: `apps/api/tests/alix/prospeccao-tools.test.ts`

- [ ] **Step 1: Escrever teste**

Crie `apps/api/tests/alix/prospeccao-tools.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { buildProspeccaoTools } from '../../src/services/alix/tools/prospeccao.ts';

test('buildProspeccaoTools retorna 6 tools com schemas', () => {
  const { tools } = buildProspeccaoTools();
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, [
    'buscar_lead',
    'enriquecer_lead',
    'listar_leads_filtrados',
    'registrar_contato_lead',
    'stats_prospeccao',
    'top_leads_by_score',
  ]);
  for (const t of tools) {
    assert.strictEqual(t.input_schema.type, 'object');
    assert.ok(typeof t.description === 'string' && t.description.length > 10);
  }
});

test('handler buscar_lead retorna erro claro se lead inexistente', async () => {
  const { registry } = buildProspeccaoTools();
  const out = await registry['buscar_lead'].handler({ cpfCnpj: '00000000000' });
  assert.ok(out && typeof out === 'object');
  // ok=false ou error: string
  const parsed = out as { ok?: boolean; error?: string };
  assert.ok(parsed.ok === false || typeof parsed.error === 'string');
});

test('handler listar_leads_filtrados retorna items + total', async () => {
  const { registry } = buildProspeccaoTools();
  const out = await registry['listar_leads_filtrados'].handler({ limit: 3 }) as any;
  assert.ok(Array.isArray(out.items));
  assert.strictEqual(typeof out.total, 'number');
});
```

- [ ] **Step 2: Rodar — deve falhar**

```bash
pnpm test tests/alix/prospeccao-tools.test.ts 2>&1 | head -10
```

- [ ] **Step 3: Criar `prospeccao.ts` com 6 tools**

Crie `apps/api/src/services/alix/tools/prospeccao.ts`:

```ts
// ============================================================
// ALETIS — Alix tools: Prospecção (6 tools)
// Expõe LeadsRepository/ProspeccaoService como tool-use do LLM
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js';
import type { ProspeccaoFilters, ContactOutcomeTipo } from '../../prospeccao/types.js';

type ToolSpec = { spec: ClaudeTool; handler: (input: Record<string, unknown>) => Promise<unknown> | unknown };

function buildSpecs(): ToolSpec[] {
  const svc = getProspeccaoService();

  return [
    {
      spec: {
        name: 'buscar_lead',
        description: 'Busca um lead da aba Prospecção pelo CPF ou CNPJ (só dígitos). Retorna dados do PGFN, enriquecimento BrasilAPI, SICAR, scoring.',
        input_schema: {
          type: 'object',
          properties: {
            cpfCnpj: { type: 'string', description: 'CPF (11) ou CNPJ (14) apenas dígitos' },
          },
          required: ['cpfCnpj'],
        },
      },
      handler: (i) => {
        const cpfCnpj = String(i.cpfCnpj || '').replace(/\D/g, '');
        if (!cpfCnpj) return { ok: false, error: 'cpfCnpj obrigatório' };
        const lead = svc.getLead(cpfCnpj);
        if (!lead) return { ok: false, error: 'Lead não encontrado', cpfCnpj };
        return { ok: true, lead };
      },
    },
    {
      spec: {
        name: 'listar_leads_filtrados',
        description: 'Lista leads da Prospecção com filtros. Suporta UF, área (ha), valor de dívida, flag de ajuizamento, CNAE agro. Retorna paginado com stats.',
        input_schema: {
          type: 'object',
          properties: {
            uf: { type: 'string' },
            ufs: { type: 'array', items: { type: 'string' } },
            minHa: { type: 'number' },
            maxHa: { type: 'number' },
            minDivida: { type: 'number' },
            maxDivida: { type: 'number' },
            temAjuizada: { type: 'boolean' },
            cnaeAgro: { type: 'boolean', description: 'Filtra CNAE agrícola' },
            page: { type: 'number' },
            limit: { type: 'number', description: 'Máx 50. Default 20.' },
            sortBy: { type: 'string', enum: ['score', 'divida', 'hectares', 'recencia'] },
          },
        },
      },
      handler: (i) => {
        const filters: ProspeccaoFilters = { ...(i as any), limit: Math.min(Number(i.limit ?? 20), 50) };
        return svc.buscar(filters);
      },
    },
    {
      spec: {
        name: 'enriquecer_lead',
        description: 'Dispara enriquecimento remoto de um lead (BrasilAPI CNPJ, ViaCEP, IBGE, SICAR, NASA clima). Retorna lead atualizado. Pode levar 5-30s.',
        input_schema: {
          type: 'object',
          properties: {
            cpfCnpj: { type: 'string' },
            sources: {
              type: 'array',
              items: { type: 'string', enum: ['cnpj', 'viacep', 'ibge', 'sicar', 'nasa'] },
              description: 'Omita para usar todas.',
            },
          },
          required: ['cpfCnpj'],
        },
      },
      handler: async (i) => {
        const cpfCnpj = String(i.cpfCnpj || '').replace(/\D/g, '');
        if (!cpfCnpj) return { ok: false, error: 'cpfCnpj obrigatório' };
        try {
          const lead = await svc.enriquecer(cpfCnpj, (i.sources as string[] | undefined));
          return { ok: true, lead };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
    },
    {
      spec: {
        name: 'stats_prospeccao',
        description: 'Agregados da base de leads: contagem por UF, faixas de dívida, sinais agro, total.',
        input_schema: {
          type: 'object',
          properties: { uf: { type: 'string' } },
        },
      },
      handler: (i) => svc.stats((i.uf as string | undefined)),
    },
    {
      spec: {
        name: 'top_leads_by_score',
        description: 'Top N leads ordenados por critério. Útil para priorizar prospecção.',
        input_schema: {
          type: 'object',
          properties: {
            n: { type: 'number', description: 'Qtd (1-50). Default 10.' },
            criterio: { type: 'string', enum: ['score', 'divida', 'hectares'], description: 'Default score' },
            uf: { type: 'string' },
          },
        },
      },
      handler: (i) => {
        const n = Math.min(Math.max(Number(i.n ?? 10), 1), 50);
        const criterio = (i.criterio as string) || 'score';
        const sortMap: Record<string, ProspeccaoFilters['sortBy']> = {
          score: 'score', divida: 'divida', hectares: 'hectares',
        };
        const result = svc.buscar({
          uf: i.uf as string | undefined,
          limit: n,
          sortBy: sortMap[criterio] ?? 'score',
        });
        return { criterio, n, items: result.items };
      },
    },
    {
      spec: {
        name: 'registrar_contato_lead',
        description: 'Registra o resultado de um contato feito com um lead (sucesso, interessado, recusou, etc). Fica no histórico do lead para priorizar próximos follow-ups.',
        input_schema: {
          type: 'object',
          properties: {
            cpfCnpj: { type: 'string' },
            tipo: { type: 'string', enum: ['sucesso', 'interessado', 'retornar', 'recusou', 'ja_regularizou', 'nao_agro', 'fora_target'] },
            canal: { type: 'string', enum: ['whatsapp', 'telefone', 'email', 'presencial', 'outro'] },
            observacao: { type: 'string' },
          },
          required: ['cpfCnpj', 'tipo'],
        },
      },
      handler: async (i) => {
        const cpfCnpj = String(i.cpfCnpj || '').replace(/\D/g, '');
        if (!cpfCnpj) return { ok: false, error: 'cpfCnpj obrigatório' };
        try {
          const outcomeId = await svc.registerOutcome(cpfCnpj, {
            tipo: i.tipo as ContactOutcomeTipo,
            canal: (i.canal as any) ?? undefined,
            observacao: (i.observacao as string) ?? undefined,
          });
          return { ok: true, outcomeId };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
    },
  ];
}

export function buildProspeccaoTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const specs = buildSpecs();
  const tools = specs.map(s => s.spec);
  const registry: ClaudeToolRegistry = {};
  for (const s of specs) {
    registry[s.spec.name] = { handler: s.handler };
  }
  return { tools, registry };
}
```

- [ ] **Step 4: Verificar que `ProspeccaoService` tem os métodos usados**

```bash
cd apps/api && grep -n "buscar\|getLead\|enriquecer\|stats\|registerOutcome" src/services/prospeccao/ProspeccaoService.ts | head -20
```

Se faltar `registerOutcome` ou `enriquecer`, fazer Task 7 antes.

- [ ] **Step 5: Rodar typecheck**

```bash
cd /home/azureai/ALETIS/aletis-system && pnpm typecheck 2>&1 | tail -15
```

Corrija qualquer erro de tipo (p. ex. se o nome real do método for `enrich` em vez de `enriquecer`, ajuste o handler).

- [ ] **Step 6: Rodar tests**

```bash
cd apps/api && pnpm test tests/alix/prospeccao-tools.test.ts 2>&1 | tail -10
```

Expected: 3 pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/alix/tools/prospeccao.ts apps/api/tests/alix/prospeccao-tools.test.ts
git commit -m "feat(alix): 6 tools de prospecção (F1)"
```

---

### Task 7: Garantir métodos faltantes em ProspeccaoService (`enriquecer`, `registerOutcome`)

**Files:**
- Modify: `apps/api/src/services/prospeccao/ProspeccaoService.ts`
- Modify: `apps/api/src/services/prospeccao/LeadsRepository.ts` (se addOutcome não existir)

- [ ] **Step 1: Ler ProspeccaoService atual**

```bash
grep -n "public \|private \|async " apps/api/src/services/prospeccao/ProspeccaoService.ts | head -30
```

- [ ] **Step 2: Adicionar os métodos que faltam**

Se `enriquecer(cpfCnpj, sources?)` **não existir**, adicione ao `ProspeccaoService`:

```ts
  async enriquecer(cpfCnpj: string, sources?: string[]): Promise<unknown> {
    // Reutiliza EnrichmentQueue existente
    return this.enqueueEnrichment(cpfCnpj, sources); // ajuste nome real do método interno
  }
```

Se `registerOutcome(cpfCnpj, outcome)` **não existir**, adicione:

```ts
  async registerOutcome(
    cpfCnpj: string,
    outcome: { tipo: ContactOutcomeTipo; canal?: string; observacao?: string }
  ): Promise<string> {
    return this.leadsRepo.addOutcome(cpfCnpj, outcome);
  }
```

E em `LeadsRepository.ts`, se `addOutcome` não existir, adicione:

```ts
  async addOutcome(cpfCnpj: string, outcome: { tipo: string; canal?: string; observacao?: string }): Promise<string> {
    const id = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const lead = this.leads.get(cpfCnpj);
    if (!lead) throw new Error(`Lead ${cpfCnpj} não encontrado`);
    if (!lead.outcomes) lead.outcomes = [];
    lead.outcomes.push({ id, ts: new Date().toISOString(), ...outcome });
    await this.save();
    return id;
  }
```

Adapte ao shape real do `lead` e sistema de persistência do `LeadsRepository`.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | grep prospeccao | head -10
```

Zero erros.

- [ ] **Step 4: Re-rodar test**

```bash
cd apps/api && pnpm test tests/alix/prospeccao-tools.test.ts 2>&1 | tail -5
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/prospeccao/
git commit -m "feat(prospeccao): métodos enriquecer() e registerOutcome() para tools Alix (F1)"
```

---

### Task 8: Conectar tools de prospecção ao `AlixService`

**Files:**
- Modify: `apps/api/src/services/AlixService.ts` (função `buildAlixTools`, ~linha 1783)

- [ ] **Step 1: Importar builder**

No topo de `AlixService.ts` (após outros imports), adicione:

```ts
import { buildProspeccaoTools } from './alix/tools/prospeccao.js';
```

- [ ] **Step 2: Expandir buildAlixTools**

Localize o final da função `buildAlixTools` — após o último spec `.push`-ado no array `specs` e antes do `return { tools, registry }` (procure pelo `return` da função). Adicione antes:

```ts
    // ── Alix Insano F1 — tools de prospecção ────────────
    const prospeccaoToolKit = buildProspeccaoTools();
    for (const t of prospeccaoToolKit.tools) {
      specs.push({
        spec: t,
        handler: prospeccaoToolKit.registry[t.name].handler as any,
      });
    }
```

(Adapte se o array local chama-se `specs` ou outro nome; o essencial é que cada entrada de `specs[]` vá para `tools` e `registry` no return.)

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -15
```

Zero erros em `AlixService.ts`.

- [ ] **Step 4: Teste de integração (com LLM real)**

Crie `apps/api/tests/alix/prospeccao-integration.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { AlixService } from '../../src/services/AlixService.ts';
import { DataSourceManager } from '../../src/services/DataSourceManager.ts';
import { isLLMEnabled } from '../../src/services/llm/ClaudeFoundryClient.ts';
import { join } from 'path';
import { tmpdir } from 'os';

const runLLM = process.env.RUN_LLM_TESTS === '1';

test(
  'Alix responde "liste top 3 leads" usando tool de prospecção',
  { skip: !runLLM || !isLLMEnabled(), timeout: 60_000 },
  async () => {
    const dsm = DataSourceManager.getInstance();
    const alix = new AlixService(dsm, join(tmpdir(), `alix-test-${Date.now()}`));
    const res = await alix.chat(undefined, 'Liste os top 3 leads por score. Resposta curta.');
    assert.ok(res.reply.length > 10);
    assert.ok(
      res.session.messages.some(m => m.toolsUsed?.includes('top_leads_by_score') || m.toolsUsed?.includes('listar_leads_filtrados')),
      'Alix deveria ter chamado uma tool de prospecção',
    );
    console.log('[integration] reply:', res.reply.slice(0, 500));
  },
);
```

- [ ] **Step 5: Rodar**

```bash
RUN_LLM_TESTS=1 pnpm --filter @aletis/api test tests/alix/prospeccao-integration.test.ts 2>&1 | tail -20
```

Expected: 1 pass, e no log aparece a reply real citando leads.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/AlixService.ts apps/api/tests/alix/prospeccao-integration.test.ts
git commit -m "feat(alix): conecta 6 tools de prospecção ao serviço Alix (F1)"
```

---

## F2 — Web Search

### Task 9: Criar interface `WebSearchProvider` e types

**Files:**
- Create: `apps/api/src/services/alix/tools/websearch/types.ts`
- Test: `apps/api/tests/alix/websearch-types.test.ts`

- [ ] **Step 1: Teste**

Crie `apps/api/tests/alix/websearch-types.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import type { WebSearchProvider, WebSearchResult } from '../../src/services/alix/tools/websearch/types.ts';

test('WebSearchResult tem shape mínimo', () => {
  const r: WebSearchResult = {
    title: 't',
    url: 'https://example.com',
    snippet: 's',
  };
  assert.strictEqual(r.title, 't');
});

test('WebSearchProvider tem contract', () => {
  const p: WebSearchProvider = {
    name: 'fake',
    available: async () => true,
    search: async () => ({ results: [], query: 'q' }),
    asClaudeTool: () => null,
  };
  assert.strictEqual(p.name, 'fake');
});
```

- [ ] **Step 2: Criar `types.ts`**

Crie `apps/api/src/services/alix/tools/websearch/types.ts`:

```ts
// ============================================================
// WebSearchProvider — abstração p/ web search no Alix
// ============================================================

import type { ClaudeTool } from '../../../llm/ClaudeFoundryClient.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  /** Fonte da resposta — domínio ou nome do scraper. */
  source?: string;
}

export interface WebSearchOpts {
  max_results?: number;
  include_domains?: string[];
  exclude_domains?: string[];
  /** Usa filtro site:*.br quando true */
  brOnly?: boolean;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  /** Observação/erro quando provider não retornou resultados. */
  note?: string;
}

export interface WebSearchProvider {
  name: 'claude-native' | 'tavily' | 'fake';
  /** Verifica se provider está disponível (ex: key configurada). */
  available(): Promise<boolean>;
  /** Executa busca direta (usado por scraping / tests). */
  search(query: string, opts?: WebSearchOpts): Promise<WebSearchResponse>;
  /** Retorna o tool-spec que deve ser passado ao LLM — ou null se provider é implementado como tool custom (Tavily). */
  asClaudeTool(): ClaudeTool | null;
}
```

- [ ] **Step 3: Rodar**

```bash
pnpm test tests/alix/websearch-types.test.ts 2>&1 | tail -5
```

Expected: 2 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/alix/tools/websearch/types.ts apps/api/tests/alix/websearch-types.test.ts
git commit -m "feat(alix): WebSearchProvider interface + types (F2)"
```

---

### Task 10: Implementar `ClaudeNativeWebSearch`

**Files:**
- Create: `apps/api/src/services/alix/tools/websearch/ClaudeNativeWebSearch.ts`

- [ ] **Step 1: Escrever arquivo**

```ts
// ============================================================
// ClaudeNativeWebSearch — wrapper p/ web_search_20250305
// ============================================================

import type { ClaudeTool } from '../../../llm/ClaudeFoundryClient.js';
import { pingFoundryWebSearch } from '../../../llm/ClaudeFoundryClient.js';
import type { WebSearchOpts, WebSearchProvider, WebSearchResponse } from './types.js';

export class ClaudeNativeWebSearch implements WebSearchProvider {
  name = 'claude-native' as const;
  private _available: boolean | null = null;

  async available(): Promise<boolean> {
    if (this._available !== null) return this._available;
    try {
      const res = await pingFoundryWebSearch();
      this._available = res.supported;
    } catch {
      this._available = false;
    }
    return this._available;
  }

  asClaudeTool(): ClaudeTool {
    // ATENÇÃO: o SDK Anthropic usa `type: 'web_search_20250305'` para ativar o tool nativo.
    // Como nosso tipo `ClaudeTool` é restrito, fazemos cast. O Foundry aceita passar assim.
    return {
      name: 'web_search',
      description: 'Busca na web pública.',
      type: 'web_search_20250305',
    } as unknown as ClaudeTool;
  }

  async search(query: string, _opts?: WebSearchOpts): Promise<WebSearchResponse> {
    // Com provider nativo, a busca é executada PELO LLM dentro do loop — este método
    // só existe p/ tests/scrapers que queiram chamar direto. Retornamos vazio para direcionar
    // o chamador a usar o flow tool-use.
    return {
      query,
      results: [],
      note: 'ClaudeNativeWebSearch: busca é feita pelo LLM durante o tool-use; use asClaudeTool() para expor ao modelo.',
    };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | grep ClaudeNativeWebSearch || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/alix/tools/websearch/ClaudeNativeWebSearch.ts
git commit -m "feat(alix): ClaudeNativeWebSearch provider (F2)"
```

---

### Task 11: Implementar `TavilyWebSearch`

**Files:**
- Create: `apps/api/src/services/alix/tools/websearch/TavilyWebSearch.ts`
- Test: `apps/api/tests/alix/tavily.test.ts`

- [ ] **Step 1: Teste com mock**

Crie `apps/api/tests/alix/tavily.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { TavilyWebSearch } from '../../src/services/alix/tools/websearch/TavilyWebSearch.ts';

test('TavilyWebSearch.available retorna false sem key', async () => {
  delete process.env.TAVILY_API_KEY;
  const p = new TavilyWebSearch();
  assert.strictEqual(await p.available(), false);
});

test('TavilyWebSearch.asClaudeTool retorna tool custom', async () => {
  const p = new TavilyWebSearch();
  const tool = p.asClaudeTool();
  assert.strictEqual(tool?.name, 'web_search');
  assert.ok(tool?.input_schema);
});
```

- [ ] **Step 2: Implementação**

Crie `apps/api/src/services/alix/tools/websearch/TavilyWebSearch.ts`:

```ts
// ============================================================
// TavilyWebSearch — fallback quando Foundry não expõe web_search nativa
// ============================================================

import type { ClaudeTool } from '../../../llm/ClaudeFoundryClient.js';
import type { WebSearchOpts, WebSearchProvider, WebSearchResponse } from './types.js';

interface TavilyResponse {
  query: string;
  results: Array<{ title: string; url: string; content: string; score?: number }>;
}

export class TavilyWebSearch implements WebSearchProvider {
  name = 'tavily' as const;

  async available(): Promise<boolean> {
    return Boolean(process.env.TAVILY_API_KEY);
  }

  asClaudeTool(): ClaudeTool {
    return {
      name: 'web_search',
      description: 'Busca na web via Tavily. Retorna lista de resultados com título, URL, conteúdo resumido e score. Use include_domains para restringir a fontes confiáveis; brOnly=true para sites .br (notícias agro BR).',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          max_results: { type: 'number', description: '1-10, default 5' },
          include_domains: { type: 'array', items: { type: 'string' } },
          exclude_domains: { type: 'array', items: { type: 'string' } },
          brOnly: { type: 'boolean' },
        },
        required: ['query'],
      },
    };
  }

  async search(query: string, opts: WebSearchOpts = {}): Promise<WebSearchResponse> {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return { query, results: [], note: 'TAVILY_API_KEY não configurada' };

    const includeDomains = opts.include_domains ?? (opts.brOnly ? ['*.br'] : undefined);

    const body = {
      api_key: key,
      query,
      max_results: opts.max_results ?? 5,
      ...(includeDomains ? { include_domains: includeDomains } : {}),
      ...(opts.exclude_domains ? { exclude_domains: opts.exclude_domains } : {}),
      search_depth: 'basic',
    };

    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return { query, results: [], note: `Tavily HTTP ${r.status}` };
      const data = (await r.json()) as TavilyResponse;
      return {
        query,
        results: data.results.map(it => ({
          title: it.title,
          url: it.url,
          snippet: it.content,
          score: it.score,
          source: new URL(it.url).hostname,
        })),
      };
    } catch (err) {
      return { query, results: [], note: `Tavily erro: ${(err as Error).message}` };
    }
  }
}
```

- [ ] **Step 3: Rodar teste**

```bash
pnpm test tests/alix/tavily.test.ts 2>&1 | tail -5
```

Expected: 2 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/alix/tools/websearch/TavilyWebSearch.ts apps/api/tests/alix/tavily.test.ts
git commit -m "feat(alix): TavilyWebSearch provider (F2)"
```

---

### Task 12: `WebSearchProviderFactory` com auto-detect

**Files:**
- Create: `apps/api/src/services/alix/tools/websearch/WebSearchProviderFactory.ts`
- Test: `apps/api/tests/alix/websearch-factory.test.ts`

- [ ] **Step 1: Teste**

Crie `apps/api/tests/alix/websearch-factory.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { WebSearchProviderFactory, resetProviderForTests } from '../../src/services/alix/tools/websearch/WebSearchProviderFactory.ts';

test('factory retorna Tavily se ALIX_WEB_SEARCH=tavily', async () => {
  process.env.ALIX_WEB_SEARCH = 'tavily';
  resetProviderForTests();
  const p = await WebSearchProviderFactory.get();
  assert.strictEqual(p.name, 'tavily');
});

test('factory retorna Claude native se ALIX_WEB_SEARCH=claude', async () => {
  process.env.ALIX_WEB_SEARCH = 'claude';
  resetProviderForTests();
  const p = await WebSearchProviderFactory.get();
  assert.strictEqual(p.name, 'claude-native');
});
```

- [ ] **Step 2: Implementação**

Crie `apps/api/src/services/alix/tools/websearch/WebSearchProviderFactory.ts`:

```ts
// ============================================================
// WebSearchProviderFactory — auto-detect + singleton
// Boot loga qual provider foi escolhido.
// ============================================================

import type { WebSearchProvider } from './types.js';
import { ClaudeNativeWebSearch } from './ClaudeNativeWebSearch.js';
import { TavilyWebSearch } from './TavilyWebSearch.js';

let cached: WebSearchProvider | null = null;

export function resetProviderForTests(): void {
  cached = null;
}

async function detect(): Promise<WebSearchProvider> {
  const forced = process.env.ALIX_WEB_SEARCH?.toLowerCase();
  if (forced === 'tavily') {
    console.log('[ALIX] WebSearch: tavily (forçado via ALIX_WEB_SEARCH)');
    return new TavilyWebSearch();
  }
  if (forced === 'claude') {
    console.log('[ALIX] WebSearch: claude-native (forçado via ALIX_WEB_SEARCH)');
    return new ClaudeNativeWebSearch();
  }

  const native = new ClaudeNativeWebSearch();
  if (await native.available()) {
    console.log('[ALIX] WebSearch: claude-native (auto)');
    return native;
  }

  const tavily = new TavilyWebSearch();
  if (await tavily.available()) {
    console.log('[ALIX] WebSearch: tavily (fallback — sem suporte nativo)');
    return tavily;
  }

  console.warn('[ALIX] WebSearch: NENHUM provider disponível. Tools de web não funcionarão.');
  return tavily; // retorna mas available()=false — chamadas vão ignorar
}

export const WebSearchProviderFactory = {
  async get(): Promise<WebSearchProvider> {
    if (!cached) cached = await detect();
    return cached;
  },
};
```

- [ ] **Step 3: Typecheck + teste**

```bash
pnpm typecheck 2>&1 | grep WebSearch || echo "OK"
pnpm test tests/alix/websearch-factory.test.ts 2>&1 | tail -5
```

Expected: 2 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/alix/tools/websearch/WebSearchProviderFactory.ts apps/api/tests/alix/websearch-factory.test.ts
git commit -m "feat(alix): WebSearchProviderFactory com auto-detect (F2)"
```

---

### Task 13: Tool `fetch_url` com readability

**Files:**
- Create: `apps/api/src/services/alix/tools/websearch/fetchUrl.ts`
- Test: `apps/api/tests/alix/fetch-url.test.ts`

- [ ] **Step 1: Teste**

Crie `apps/api/tests/alix/fetch-url.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { buildFetchUrlTool } from '../../src/services/alix/tools/websearch/fetchUrl.ts';

test('fetch_url tool tem schema exigindo URL', () => {
  const { tools } = buildFetchUrlTool();
  assert.strictEqual(tools[0].name, 'fetch_url');
  assert.ok((tools[0].input_schema as any).required?.includes('url'));
});

test('fetch_url rejeita url não http(s)', async () => {
  const { registry } = buildFetchUrlTool();
  const r = await registry['fetch_url'].handler({ url: 'file:///etc/passwd' });
  assert.ok((r as any).error);
});
```

- [ ] **Step 2: Implementação**

Crie `apps/api/src/services/alix/tools/websearch/fetchUrl.ts`:

```ts
// ============================================================
// fetch_url — GET HTTP + readability → markdown limpo
// Blindagem: só http/https, timeout 15s, max 1MB
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../../llm/ClaudeFoundryClient.js';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 15_000;

export function buildFetchUrlTool(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tool: ClaudeTool = {
    name: 'fetch_url',
    description: 'Baixa uma página web e retorna o conteúdo principal limpo (markdown-like via readability). Use APÓS web_search achar uma URL interessante para ler o conteúdo completo.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL HTTP/HTTPS' },
        max_chars: { type: 'number', description: 'Limite de caracteres retornados. Default 8000.' },
      },
      required: ['url'],
    },
  };

  const registry: ClaudeToolRegistry = {
    fetch_url: {
      handler: async (input) => {
        const url = String(input.url || '');
        const maxChars = Math.min(Number(input.max_chars ?? 8000), 20000);
        if (!/^https?:\/\//i.test(url)) {
          return { error: 'URL inválida: aceita apenas http:// ou https://' };
        }
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 ALETIS-Alix/1.0' } });
          if (!r.ok) return { error: `HTTP ${r.status}`, url };
          const buf = await r.arrayBuffer();
          if (buf.byteLength > MAX_BYTES) return { error: 'Página muito grande (>1MB)', url };
          const html = new TextDecoder('utf-8').decode(buf);
          const dom = new JSDOM(html, { url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();
          if (!article) return { error: 'Não conseguiu extrair conteúdo legível', url, rawLength: html.length };
          const text = (article.textContent || '').trim();
          return {
            ok: true,
            url,
            title: article.title,
            byline: article.byline,
            excerpt: article.excerpt,
            content: text.length > maxChars ? text.slice(0, maxChars) + '…' : text,
            contentChars: text.length,
            truncated: text.length > maxChars,
          };
        } catch (err) {
          return { error: (err as Error).message, url };
        } finally {
          clearTimeout(to);
        }
      },
    },
  };

  return { tools: [tool], registry };
}
```

- [ ] **Step 3: Test**

```bash
pnpm test tests/alix/fetch-url.test.ts 2>&1 | tail -5
```

Expected: 2 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/alix/tools/websearch/fetchUrl.ts apps/api/tests/alix/fetch-url.test.ts
git commit -m "feat(alix): tool fetch_url com readability (F2)"
```

---

### Task 14: Scrapers `consultar_cvm`, `consultar_jusbrasil`, `consultar_cnpj_detalhado`

**Files:**
- Create: `apps/api/src/services/alix/tools/websearch/scrapers/cvm.ts`
- Create: `apps/api/src/services/alix/tools/websearch/scrapers/jusbrasil.ts`
- Create: `apps/api/src/services/alix/tools/websearch/scrapers/cnpj.ts`

> Scraping de sites externos é frágil. Implementamos com **circuit breaker** (3 falhas consecutivas → tool retorna erro pedindo fallback para `web_search`). Todos os scrapers começam com implementação mínima que dispara `web_search_via_provider` quando o scraping falha.

- [ ] **Step 1: `consultar_cnpj_detalhado` — o mais simples, usa BrasilAPI (já tem)**

Crie `apps/api/src/services/alix/tools/websearch/scrapers/cnpj.ts`:

```ts
import type { ClaudeTool, ClaudeToolRegistry } from '../../../../llm/ClaudeFoundryClient.js';

export function buildCnpjTool(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  return {
    tools: [{
      name: 'consultar_cnpj_detalhado',
      description: 'Consulta BrasilAPI para dados públicos da Receita Federal: razão social, CNAE, situação, sócios, endereço, porte, situação especial (falida, RJ, etc).',
      input_schema: {
        type: 'object',
        properties: { cnpj: { type: 'string', description: '14 dígitos, só números' } },
        required: ['cnpj'],
      },
    }],
    registry: {
      consultar_cnpj_detalhado: {
        handler: async (i) => {
          const cnpj = String(i.cnpj || '').replace(/\D/g, '');
          if (cnpj.length !== 14) return { error: 'CNPJ deve ter 14 dígitos' };
          try {
            const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (!r.ok) return { error: `BrasilAPI HTTP ${r.status}` };
            const data = await r.json();
            return { ok: true, data };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      },
    },
  };
}
```

- [ ] **Step 2: `consultar_cvm` — scraper leve com fallback**

Crie `apps/api/src/services/alix/tools/websearch/scrapers/cvm.ts`:

```ts
import type { ClaudeTool, ClaudeToolRegistry } from '../../../../llm/ClaudeFoundryClient.js';

// Circuit breaker simples em memória.
let consecutiveFailures = 0;
const FAIL_THRESHOLD = 3;

export function buildCvmTool(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  return {
    tools: [{
      name: 'consultar_cvm',
      description: 'Consulta CVM (sistema RAD) por fatos relevantes, recuperação judicial, RJ/RE, fatos relevantes de empresas listadas. Não cobre empresas fechadas — nesse caso use web_search.',
      input_schema: {
        type: 'object',
        properties: {
          cnpj: { type: 'string' },
          razaoSocial: { type: 'string' },
        },
      },
    }],
    registry: {
      consultar_cvm: {
        handler: async (i) => {
          if (consecutiveFailures >= FAIL_THRESHOLD) {
            return { error: 'Circuit breaker ativo — use web_search como alternativa', circuitOpen: true };
          }
          const q = String(i.cnpj || i.razaoSocial || '');
          if (!q) return { error: 'cnpj ou razaoSocial obrigatório' };
          try {
            // Implementação mínima: delegamos para web_search com site:cvm.gov.br
            // (scraping real do CVM/RAD exige sessão stateful — em F5 ou depois podemos endurecer)
            const fallbackQuery = `${q} site:cvm.gov.br OR site:b3.com.br`;
            consecutiveFailures = 0;
            return {
              ok: true,
              hint: 'Use web_search com esta query para obter resultados CVM/B3',
              suggestedQuery: fallbackQuery,
            };
          } catch (err) {
            consecutiveFailures++;
            return { error: (err as Error).message };
          }
        },
      },
    },
  };
}
```

- [ ] **Step 3: `consultar_jusbrasil` — mesmo padrão**

Crie `apps/api/src/services/alix/tools/websearch/scrapers/jusbrasil.ts`:

```ts
import type { ClaudeTool, ClaudeToolRegistry } from '../../../../llm/ClaudeFoundryClient.js';

export function buildJusbrasilTool(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  return {
    tools: [{
      name: 'consultar_jusbrasil',
      description: 'Busca processos públicos no Jusbrasil. Implementação atual retorna query otimizada para web_search (site:jusbrasil.com.br). Ideal p/ descobrir ações judiciais envolvendo CPF/CNPJ/nome.',
      input_schema: {
        type: 'object',
        properties: {
          termo: { type: 'string', description: 'Nome, CPF, CNPJ ou número de processo' },
        },
        required: ['termo'],
      },
    }],
    registry: {
      consultar_jusbrasil: {
        handler: async (i) => {
          const termo = String(i.termo || '');
          if (!termo) return { error: 'termo obrigatório' };
          return {
            ok: true,
            hint: 'Use web_search com a query abaixo',
            suggestedQuery: `"${termo}" site:jusbrasil.com.br`,
          };
        },
      },
    },
  };
}
```

- [ ] **Step 4: Teste rápido dos 3**

Crie `apps/api/tests/alix/scrapers.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { buildCnpjTool } from '../../src/services/alix/tools/websearch/scrapers/cnpj.ts';
import { buildCvmTool } from '../../src/services/alix/tools/websearch/scrapers/cvm.ts';
import { buildJusbrasilTool } from '../../src/services/alix/tools/websearch/scrapers/jusbrasil.ts';

test('consultar_cnpj_detalhado rejeita cnpj curto', async () => {
  const { registry } = buildCnpjTool();
  const r = await registry['consultar_cnpj_detalhado'].handler({ cnpj: '123' });
  assert.ok((r as any).error);
});

test('consultar_cvm retorna suggestedQuery', async () => {
  const { registry } = buildCvmTool();
  const r = await registry['consultar_cvm'].handler({ cnpj: '12345678000199' }) as any;
  assert.ok(r.ok);
  assert.ok(r.suggestedQuery.includes('cvm.gov.br'));
});

test('consultar_jusbrasil retorna suggestedQuery', async () => {
  const { registry } = buildJusbrasilTool();
  const r = await registry['consultar_jusbrasil'].handler({ termo: '12345678901' }) as any;
  assert.ok(r.suggestedQuery.includes('jusbrasil.com.br'));
});
```

- [ ] **Step 5: Rodar**

```bash
pnpm test tests/alix/scrapers.test.ts 2>&1 | tail -5
```

Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/alix/tools/websearch/scrapers/ apps/api/tests/alix/scrapers.test.ts
git commit -m "feat(alix): scrapers cvm/jusbrasil/cnpj (modo fallback web_search) (F2)"
```

---

### Task 15: Conectar web search + scrapers ao `AlixService` (provisório, antes da refatoração multi-agente)

**Files:**
- Modify: `apps/api/src/services/AlixService.ts`

- [ ] **Step 1: Importar builders no topo de AlixService.ts**

```ts
import { WebSearchProviderFactory } from './alix/tools/websearch/WebSearchProviderFactory.js';
import { buildFetchUrlTool } from './alix/tools/websearch/fetchUrl.js';
import { buildCnpjTool } from './alix/tools/websearch/scrapers/cnpj.js';
import { buildCvmTool } from './alix/tools/websearch/scrapers/cvm.js';
import { buildJusbrasilTool } from './alix/tools/websearch/scrapers/jusbrasil.js';
```

- [ ] **Step 2: Adicionar as tools na função buildAlixTools** — depois da adição de prospecção (Task 8), e no início do método, antes do `return`, precisamos um async escape. O buildAlixTools atual parece síncrono — se for, troque o approach:

Opção A (se `buildAlixTools` é síncrono): chame `WebSearchProviderFactory.get()` no boot em `alixRoutes()` (arquivo `routes/alix.ts`) e injete o provider já resolvido via construtor/setter.

Opção B (mais simples agora): chame sem await — a primeira chamada resolve e cacheia; enquanto não resolve, registramos apenas as tools sync (fetch_url + scrapers + cnpj) e deixamos a `web_search` tool registrada só a partir do primeiro `chat()` que await-iar.

Vá de **Opção A**. No arquivo `routes/alix.ts` (`getAlixService`), adicione:

```ts
// Inicializa WebSearchProvider de forma assíncrona e injeta quando pronto.
WebSearchProviderFactory.get().then((provider) => {
  alixInstance!.setWebSearchProvider(provider);
  console.log('[ALIX] WebSearch provider ativado:', provider.name);
});
```

E em `AlixService.ts`, adicione um setter + integração em `buildAlixTools`:

```ts
  private webSearchProvider: import('./alix/tools/websearch/types.js').WebSearchProvider | null = null;

  setWebSearchProvider(p: import('./alix/tools/websearch/types.js').WebSearchProvider): void {
    this.webSearchProvider = p;
  }
```

E dentro de `buildAlixTools`, após o bloco de prospecção:

```ts
    // ── Alix Insano F2 — web search + scrapers ──────────
    if (this.webSearchProvider) {
      const nativeTool = this.webSearchProvider.asClaudeTool();
      if (nativeTool) {
        specs.push({ spec: nativeTool, handler: async (i) => {
          if (this.webSearchProvider!.name === 'tavily') {
            return this.webSearchProvider!.search(String(i.query), i as any);
          }
          // claude-native: o próprio LLM executa; handler nunca é chamado.
          return { note: 'web_search nativa executada pelo Claude' };
        }});
      }
    }
    for (const t of [
      ...buildFetchUrlTool().tools,
      ...buildCnpjTool().tools,
      ...buildCvmTool().tools,
      ...buildJusbrasilTool().tools,
    ]) {
      const reg = { ...buildFetchUrlTool().registry, ...buildCnpjTool().registry, ...buildCvmTool().registry, ...buildJusbrasilTool().registry };
      specs.push({ spec: t, handler: reg[t.name].handler as any });
    }
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -15
```

Zero erros.

- [ ] **Step 4: Teste de integração (opt-in)**

Crie `apps/api/tests/alix/web-search-integration.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { AlixService } from '../../src/services/AlixService.ts';
import { DataSourceManager } from '../../src/services/DataSourceManager.ts';
import { WebSearchProviderFactory } from '../../src/services/alix/tools/websearch/WebSearchProviderFactory.ts';
import { isLLMEnabled } from '../../src/services/llm/ClaudeFoundryClient.ts';
import { join } from 'path';
import { tmpdir } from 'os';

const runLLM = process.env.RUN_LLM_TESTS === '1';

test(
  'Alix busca notícias Pronaf 2026 via web_search',
  { skip: !runLLM || !isLLMEnabled(), timeout: 90_000 },
  async () => {
    const dsm = DataSourceManager.getInstance();
    const alix = new AlixService(dsm, join(tmpdir(), `alix-ws-${Date.now()}`));
    const provider = await WebSearchProviderFactory.get();
    alix.setWebSearchProvider(provider);

    const res = await alix.chat(undefined, 'Busque na web 3 notícias de 2026 sobre o Pronaf. Retorne com URLs.');
    assert.ok(res.reply.length > 30);
    console.log('[integration/web] reply:', res.reply.slice(0, 600));
  },
);
```

Rode:

```bash
RUN_LLM_TESTS=1 pnpm --filter @aletis/api test tests/alix/web-search-integration.test.ts 2>&1 | tail -25
```

Expected: resposta com URLs reais.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/AlixService.ts apps/api/src/routes/alix.ts apps/api/tests/alix/web-search-integration.test.ts
git commit -m "feat(alix): integra web_search + fetch_url + scrapers ao AlixService (F2)"
```

---

## F3 — Esqueleto Multi-Agente

### Task 16: `WebResearcherAgent` (mais simples dos 4 — serve de modelo)

**Files:**
- Create: `apps/api/src/services/alix/agents/WebResearcherAgent.ts`
- Test: `apps/api/tests/alix/web-researcher-agent.test.ts`

- [ ] **Step 1: Teste**

Crie `apps/api/tests/alix/web-researcher-agent.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { WebResearcherAgent } from '../../src/services/alix/agents/WebResearcherAgent.ts';

test('WebResearcherAgent tem metadata correto', () => {
  const a = new WebResearcherAgent();
  assert.strictEqual(a.name, 'WebResearcher');
  assert.strictEqual(a.model, 'claude-sonnet-4-6');
});

test('WebResearcherAgent.buildTools inclui fetch_url e consultar_cnpj_detalhado', () => {
  const a = new WebResearcherAgent();
  const { tools } = a.buildTools({ sessionId: 's', orchestratorHistory: [], parentToolCalls: [], hitl: true });
  const names = tools.map(t => t.name);
  assert.ok(names.includes('fetch_url'));
  assert.ok(names.includes('consultar_cnpj_detalhado'));
});
```

- [ ] **Step 2: Implementação**

Crie `apps/api/src/services/alix/agents/WebResearcherAgent.ts`:

```ts
// ============================================================
// WebResearcherAgent — due-diligence externa
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { buildFetchUrlTool } from '../tools/websearch/fetchUrl.js';
import { buildCnpjTool } from '../tools/websearch/scrapers/cnpj.js';
import { buildCvmTool } from '../tools/websearch/scrapers/cvm.js';
import { buildJusbrasilTool } from '../tools/websearch/scrapers/jusbrasil.js';
import { WebSearchProviderFactory } from '../tools/websearch/WebSearchProviderFactory.js';

export class WebResearcherAgent extends BaseAgent {
  name = 'WebResearcher';
  model = process.env.ALIX_WEB_RESEARCHER_MODEL || 'claude-sonnet-4-6';
  maxTokens = 8000;
  maxIterations = 15;

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o WebResearcher da ALETIS, sub-agente do Alix.

Sua missão: buscar informação pública externa e retornar resultados objetivos.

Regras:
1. Priorize fontes oficiais (Receita, CVM, PGFN, INPE, Jusbrasil) antes de notícias.
2. SEMPRE retorne URLs das fontes que consultou.
3. Se não achou, diga "não encontrado" — jamais invente.
4. Use consultar_cnpj_detalhado p/ empresas, consultar_cvm p/ empresas abertas, consultar_jusbrasil p/ processos.
5. Use web_search para pesquisa ampla; depois fetch_url nas páginas relevantes pra extrair texto.
6. Responda em markdown com bullets e URLs.

Contexto da sessão pai:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId alvo: ${ctx.clienteId}` : ''}
${ctx.leadCpfCnpj ? `- leadCpfCnpj alvo: ${ctx.leadCpfCnpj}` : ''}
`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    const tools: ClaudeTool[] = [];
    const registry: ClaudeToolRegistry = {};

    const kits = [
      buildFetchUrlTool(),
      buildCnpjTool(),
      buildCvmTool(),
      buildJusbrasilTool(),
    ];
    for (const k of kits) {
      tools.push(...k.tools);
      Object.assign(registry, k.registry);
    }

    // web_search via provider atual (factory resolve async; se cache disponível, adiciona)
    // Em buildTools síncrono, o provider pode não estar pronto — chamaremos best-effort;
    // o pior caso é o agente rodar sem web_search disponível (só scrapers + fetch).
    try {
      const providerPromise = WebSearchProviderFactory.get();
      // `then` fora do flow — adicionamos post-hoc SOMENTE se já estava cached.
      // @ts-ignore
      if ((providerPromise as any).then) {
        // best effort: skip
      }
    } catch {
      /* noop */
    }

    return { tools, registry };
  }
}
```

- [ ] **Step 3: Test**

```bash
pnpm test tests/alix/web-researcher-agent.test.ts 2>&1 | tail -5
```

Expected: 2 pass.

> **Nota:** como `WebSearchProviderFactory.get()` é async, precisamos de uma variante síncrona. Próxima task ajusta isso para o agente efetivamente expor a tool `web_search`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/alix/agents/WebResearcherAgent.ts apps/api/tests/alix/web-researcher-agent.test.ts
git commit -m "feat(alix): WebResearcherAgent (F3)"
```

---

### Task 17: Resolver provider síncrono — boot inicial

**Files:**
- Modify: `apps/api/src/services/alix/tools/websearch/WebSearchProviderFactory.ts`
- Modify: `apps/api/src/services/alix/agents/WebResearcherAgent.ts`

- [ ] **Step 1: Expor getter síncrono**

Em `WebSearchProviderFactory.ts`, adicione:

```ts
export const WebSearchProviderFactory = {
  async get(): Promise<WebSearchProvider> { /* existing */ },
  /** Retorna provider já cached ou null. Útil em contextos síncronos (ex.: buildTools). */
  getSync(): WebSearchProvider | null {
    return cached;
  },
  /** Warm-up no boot: resolve provider e cacheia. Chame uma vez em server.ts / alixRoutes. */
  async warmUp(): Promise<WebSearchProvider> {
    return this.get();
  },
};
```

- [ ] **Step 2: Chamar warmUp no boot**

Em `apps/api/src/routes/alix.ts`, dentro de `getAlixService()`, troque o `.then(...)` existente por:

```ts
  // Warm-up do WebSearch provider
  WebSearchProviderFactory.warmUp()
    .then((provider) => {
      alixInstance!.setWebSearchProvider(provider);
      console.log('[ALIX] WebSearch provider ativo:', provider.name);
    })
    .catch((err) => console.warn('[ALIX] WebSearch warmUp falhou:', err.message));
```

- [ ] **Step 3: Usar getSync no agente**

Em `WebResearcherAgent.buildTools`, trocar o bloco com `try { ... }` por:

```ts
    const provider = WebSearchProviderFactory.getSync();
    if (provider) {
      const nativeTool = provider.asClaudeTool();
      if (nativeTool) {
        tools.push(nativeTool);
        if (provider.name === 'tavily') {
          registry['web_search'] = {
            handler: async (i) => provider.search(String(i.query), i as any),
          };
        } else {
          // claude-native: handler stub que nunca é chamado (o LLM executa)
          registry['web_search'] = { handler: async () => ({ note: 'web_search nativa' }) };
        }
      }
    }
```

- [ ] **Step 4: Teste**

Adicione em `web-researcher-agent.test.ts`:

```ts
import { WebSearchProviderFactory } from '../../src/services/alix/tools/websearch/WebSearchProviderFactory.ts';
import { TavilyWebSearch } from '../../src/services/alix/tools/websearch/TavilyWebSearch.ts';

test('WebResearcherAgent.buildTools inclui web_search quando provider está cached', async () => {
  // Força provider específico no cache
  (WebSearchProviderFactory as any).warmUp = async () => new TavilyWebSearch();
  await WebSearchProviderFactory.warmUp();
  process.env.TAVILY_API_KEY = 'test-key';
  const a = new (await import('../../src/services/alix/agents/WebResearcherAgent.ts')).WebResearcherAgent();
  const { tools } = a.buildTools({ sessionId: 's', orchestratorHistory: [], parentToolCalls: [], hitl: true });
  const names = tools.map(t => t.name);
  assert.ok(names.includes('web_search'));
});
```

- [ ] **Step 5: Typecheck + rodar**

```bash
pnpm typecheck 2>&1 | tail -10
pnpm test tests/alix/web-researcher-agent.test.ts 2>&1 | tail -5
```

Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/alix/tools/websearch/WebSearchProviderFactory.ts apps/api/src/services/alix/agents/WebResearcherAgent.ts apps/api/src/routes/alix.ts apps/api/tests/alix/web-researcher-agent.test.ts
git commit -m "feat(alix): warm-up síncrono do WebSearchProvider para buildTools (F3)"
```

---

### Task 18: `DealAnalyzerAgent` (Opus 4.7 + thinking condicional)

**Files:**
- Create: `apps/api/src/services/alix/agents/DealAnalyzerAgent.ts`

- [ ] **Step 1: Implementação**

Crie `apps/api/src/services/alix/agents/DealAnalyzerAgent.ts`:

```ts
// ============================================================
// DealAnalyzerAgent — análise estratégica profunda (Opus 4.7)
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { buildProspeccaoTools } from '../tools/prospeccao.js';

export class DealAnalyzerAgent extends BaseAgent {
  name = 'DealAnalyzer';
  model = process.env.ALIX_DEAL_ANALYZER_MODEL || 'claude-opus-4-7';
  maxTokens = 16000;
  maxIterations = 25;
  thinking: { type: 'enabled'; budget_tokens: number } | undefined;

  constructor(opts?: { thinkingSupported?: boolean }) {
    super();
    if (opts?.thinkingSupported) {
      this.thinking = { type: 'enabled', budget_tokens: 8000 };
    }
  }

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o DealAnalyzer da ALETIS — consultoria financeira agro do Christian Kohler.

Sua missão: dado um cliente ou lead, produzir um ESTUDO DE CASO OODA COMPLETO.

Estrutura obrigatória da resposta:
1. **OBSERVE** — fatos objetivos (dívidas, garantias, produção, cadastro, sócios, situação fiscal)
2. **ORIENT** — contexto que afeta: macro, jurídico (MCR/STJ/Proagro), climático, competitivo
3. **DECIDE** — estratégia recomendada COM NÚMEROS e precedentes
4. **ACT** — próximas ações concretas que o Christian deve tomar

Use as tools para puxar TUDO — não invente. Se faltar contexto externo, delegue ao WebResearcher via delegate_web_researcher.

Contexto:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId alvo: ${ctx.clienteId}` : ''}
${ctx.leadCpfCnpj ? `- leadCpfCnpj alvo: ${ctx.leadCpfCnpj}` : ''}

Data de hoje: ${new Date().toISOString().slice(0, 10)}

Entregue markdown estruturado. Cite fontes (tools e URLs). Seja cirúrgico.`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    const tools: ClaudeTool[] = [];
    const registry: ClaudeToolRegistry = {};

    // Prospecção
    const prospec = buildProspeccaoTools();
    tools.push(...prospec.tools);
    Object.assign(registry, prospec.registry);

    // NOTE: tools de CRM/dossiê/KB/simuladores serão conectadas via wiring
    // do AlixService existente — F3 deixa stubs mínimos; Plano 3 enriquece.
    // Por enquanto o DealAnalyzer tem acesso só à prospecção + thinking.
    // No F3 a ideia é provar delegação funciona E2E.

    return { tools, registry };
  }
}
```

- [ ] **Step 2: Teste básico**

Crie `apps/api/tests/alix/deal-analyzer-agent.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { DealAnalyzerAgent } from '../../src/services/alix/agents/DealAnalyzerAgent.ts';

test('DealAnalyzerAgent default sem thinking', () => {
  const a = new DealAnalyzerAgent();
  assert.strictEqual(a.thinking, undefined);
});

test('DealAnalyzerAgent com thinkingSupported=true', () => {
  const a = new DealAnalyzerAgent({ thinkingSupported: true });
  assert.strictEqual(a.thinking?.type, 'enabled');
});

test('DealAnalyzerAgent usa Opus 4.7 por padrão', () => {
  delete process.env.ALIX_DEAL_ANALYZER_MODEL;
  const a = new DealAnalyzerAgent();
  assert.strictEqual(a.model, 'claude-opus-4-7');
});
```

- [ ] **Step 3: Rodar**

```bash
pnpm test tests/alix/deal-analyzer-agent.test.ts 2>&1 | tail -5
```

Expected: 3 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/alix/agents/DealAnalyzerAgent.ts apps/api/tests/alix/deal-analyzer-agent.test.ts
git commit -m "feat(alix): DealAnalyzerAgent Opus 4.7 + thinking condicional (F3)"
```

---

### Task 19: `CRMWriterAgent` (F3: apenas low-impact tools)

**Files:**
- Create: `apps/api/src/services/alix/agents/CRMWriterAgent.ts`

- [ ] **Step 1: Implementação**

Crie `apps/api/src/services/alix/agents/CRMWriterAgent.ts`:

```ts
// ============================================================
// CRMWriterAgent — escrita no CRM (F3: só low-impact; F4 adiciona HITL)
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';

export class CRMWriterAgent extends BaseAgent {
  name = 'CRMWriter';
  model = process.env.ALIX_CRM_WRITER_MODEL || 'claude-sonnet-4-6';
  maxTokens = 4000;
  maxIterations = 10;

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o CRMWriter da ALETIS — sub-agente do Alix.

Missão: executar ações de escrita no CRM com precisão.

Nesta fase (F3), só tem acesso a ações de BAIXO impacto (criar tarefa/evento/nota).
Ações de alto impacto (criar cliente, proposta, promover lead, WhatsApp real) serão
adicionadas em F4 com fluxo HITL.

Contexto:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId alvo: ${ctx.clienteId}` : ''}

Regras:
1. Valide payload antes de agir — se falta dado, diga ao orquestrador o que falta.
2. Retorne confirmação clara de cada ação (id criado, estado novo).
3. Nunca invente IDs.`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    // F3: sem tools novas — a escrita sofisticada é F4.
    // Por ora, o agente só "planeja" e reporta ao orquestrador.
    return { tools: [], registry: {} };
  }
}
```

- [ ] **Step 2: Teste**

```ts
// apps/api/tests/alix/crm-writer-agent.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { CRMWriterAgent } from '../../src/services/alix/agents/CRMWriterAgent.ts';

test('CRMWriterAgent F3 tem zero tools (só F4 adiciona)', () => {
  const a = new CRMWriterAgent();
  const { tools } = a.buildTools({ sessionId: 's', orchestratorHistory: [], parentToolCalls: [], hitl: true });
  assert.strictEqual(tools.length, 0);
});
```

- [ ] **Step 3: Rodar + commit**

```bash
pnpm test tests/alix/crm-writer-agent.test.ts 2>&1 | tail -5
git add apps/api/src/services/alix/agents/CRMWriterAgent.ts apps/api/tests/alix/crm-writer-agent.test.ts
git commit -m "feat(alix): CRMWriterAgent esqueleto (F3, só low-impact — HITL em F4)"
```

---

### Task 20: `DocGeneratorAgent` (F3: sem tools, stub)

**Files:**
- Create: `apps/api/src/services/alix/agents/DocGeneratorAgent.ts`
- Test: `apps/api/tests/alix/doc-generator-agent.test.ts`

- [ ] **Step 1: Implementação mínima**

```ts
// apps/api/src/services/alix/agents/DocGeneratorAgent.ts
import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';

export class DocGeneratorAgent extends BaseAgent {
  name = 'DocGenerator';
  model = process.env.ALIX_DOC_GENERATOR_MODEL || 'claude-sonnet-4-6';
  maxTokens = 6000;
  maxIterations = 8;

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o DocGenerator da ALETIS. Recebe um input estruturado, escolhe a tool de geração correta (proposta, parecer, BSC, fluxo, dossiê completo), retorna URL do artefato. Em F3 o agente está em stub — conexão com geradores Wave 9 acontece no Plano 3.

sessionId: ${ctx.sessionId}`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    return { tools: [], registry: {} };
  }
}
```

- [ ] **Step 2: Teste + commit**

```ts
// tests/alix/doc-generator-agent.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { DocGeneratorAgent } from '../../src/services/alix/agents/DocGeneratorAgent.ts';

test('DocGeneratorAgent stub', () => {
  const a = new DocGeneratorAgent();
  assert.strictEqual(a.name, 'DocGenerator');
  const { tools } = a.buildTools({ sessionId: 's', orchestratorHistory: [], parentToolCalls: [], hitl: true });
  assert.strictEqual(tools.length, 0);
});
```

```bash
pnpm test tests/alix/doc-generator-agent.test.ts 2>&1 | tail -3
git add apps/api/src/services/alix/agents/DocGeneratorAgent.ts apps/api/tests/alix/doc-generator-agent.test.ts
git commit -m "feat(alix): DocGeneratorAgent stub (F3)"
```

---

### Task 21: `OrchestratorService` — delegações + tools leves

**Files:**
- Create: `apps/api/src/services/alix/OrchestratorService.ts`
- Test: `apps/api/tests/alix/orchestrator.test.ts`

- [ ] **Step 1: Implementação**

Crie `apps/api/src/services/alix/OrchestratorService.ts`:

```ts
// ============================================================
// OrchestratorService — o Alix principal
// Roteia para 4 sub-agentes via delegate_* tools; responde direto
// perguntas factuais com tools leves.
// ============================================================

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { DataSourceManager } from '../DataSourceManager.js';
import type { ChatSession, ChatMessage } from '../AlixService.js';
import { runClaude, type ClaudeTool, type ClaudeToolRegistry, type ClaudeMessage, isLLMEnabled } from '../llm/ClaudeFoundryClient.js';
import { DealAnalyzerAgent } from './agents/DealAnalyzerAgent.js';
import { WebResearcherAgent } from './agents/WebResearcherAgent.js';
import { CRMWriterAgent } from './agents/CRMWriterAgent.js';
import { DocGeneratorAgent } from './agents/DocGeneratorAgent.js';
import type { SubAgent, SubAgentContext, SubAgentResult } from './agents/types.js';
import { buildProspeccaoTools } from './tools/prospeccao.js';
import { pingFoundryThinking } from '../llm/ClaudeFoundryClient.js';

export interface OrchestratorOpts {
  thinkingSupported?: boolean;
}

export class OrchestratorService {
  private dealAnalyzer: DealAnalyzerAgent;
  private webResearcher: WebResearcherAgent;
  private crmWriter: CRMWriterAgent;
  private docGenerator: DocGeneratorAgent;

  constructor(private dsm: DataSourceManager, private storageDir: string, opts: OrchestratorOpts = {}) {
    this.dealAnalyzer = new DealAnalyzerAgent({ thinkingSupported: opts.thinkingSupported });
    this.webResearcher = new WebResearcherAgent();
    this.crmWriter = new CRMWriterAgent();
    this.docGenerator = new DocGeneratorAgent();
  }

  static async create(dsm: DataSourceManager, storageDir: string): Promise<OrchestratorService> {
    let thinkingSupported = false;
    try {
      if (isLLMEnabled()) {
        const ping = await pingFoundryThinking();
        thinkingSupported = ping.supported;
        console.log('[Orchestrator] extended thinking supported:', thinkingSupported);
      }
    } catch (err) {
      console.warn('[Orchestrator] ping thinking falhou:', (err as Error).message);
    }
    await fs.mkdir(storageDir, { recursive: true });
    return new OrchestratorService(dsm, storageDir, { thinkingSupported });
  }

  get model(): string {
    return process.env.ALIX_ORCHESTRATOR_MODEL || 'claude-sonnet-4-6';
  }

  private buildSystemPrompt(): string {
    const hoje = new Date().toISOString().slice(0, 10);
    return `Você é o ALIX — cérebro da ALETIS, consultoria financeira agro do Christian Kohler.

Você é o consultor sênior que o Christian usa como braço direito. Não é chatbot.

Você tem 4 sub-agentes que pode delegar:
- delegate_deal_analyzer: estudo de caso profundo, estruturação financeira, recomendação estratégica
- delegate_web_researcher: due-diligence externa (web, CVM, Jusbrasil, Receita, notícias)
- delegate_crm_writer: escrita no CRM (em F3 só low-impact; alto impacto chega em F4)
- delegate_doc_generator: gerar PDF/DOCX/XLSX (stub em F3)

Também tem tools leves para responder direto sem delegar (buscar_lead, listar_leads_filtrados, stats_prospeccao, top_leads_by_score).

Quando delegar vs responder direto:
- Pergunta factual rápida → tool leve, sem delegar
- "Analisa cliente/lead X" / "estuda" / "recomenda" / "estrutura" → delega DealAnalyzer
- "Procura", "no Google", "no CVM", "notícias" → delega WebResearcher
- "Cria", "promove", "atualiza", "envia" → delega CRMWriter
- "Gera PDF/documento" → delega DocGenerator

Voz: direto, técnico, sem floreio. BRL R$ 1.234,56. Datas pt-BR. Sempre cite fontes.

Data: ${hoje}`;
  }

  private buildTools(sessionId: string, history: ChatMessage[]): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    const tools: ClaudeTool[] = [];
    const registry: ClaudeToolRegistry = {};

    // Tools leves: só consultas, sem delegar
    const prospec = buildProspeccaoTools();
    // Só expõe o subset "leve" no Orchestrator — análise pesada fica em DealAnalyzer
    const lightNames = new Set(['buscar_lead', 'listar_leads_filtrados', 'stats_prospeccao', 'top_leads_by_score']);
    for (const t of prospec.tools) {
      if (lightNames.has(t.name)) {
        tools.push(t);
        registry[t.name] = prospec.registry[t.name];
      }
    }

    // Delegações
    const ctxBase = (): SubAgentContext => ({
      sessionId,
      orchestratorHistory: history.slice(-10),
      parentToolCalls: ['orchestrator'],
      hitl: true,
    });

    const runSubAgent = async (agent: SubAgent, goal: string, extra?: Partial<SubAgentContext>): Promise<SubAgentResult> => {
      const ctx: SubAgentContext = { ...ctxBase(), ...extra };
      return agent.run(goal, ctx);
    };

    tools.push({
      name: 'delegate_deal_analyzer',
      description: 'Delega análise estratégica profunda (estudo de caso, estruturação, recomendação) para o DealAnalyzer.',
      input_schema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Objetivo concreto da análise' },
          clienteId: { type: 'string' },
          leadCpfCnpj: { type: 'string' },
        },
        required: ['goal'],
      },
    });
    registry['delegate_deal_analyzer'] = {
      handler: async (i) => runSubAgent(this.dealAnalyzer, String(i.goal), {
        clienteId: i.clienteId as string | undefined,
        leadCpfCnpj: i.leadCpfCnpj as string | undefined,
      }),
    };

    tools.push({
      name: 'delegate_web_researcher',
      description: 'Delega due-diligence externa (web, CVM, Jusbrasil, Receita, notícias) ao WebResearcher.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    });
    registry['delegate_web_researcher'] = {
      handler: async (i) => runSubAgent(this.webResearcher, String(i.query)),
    };

    tools.push({
      name: 'delegate_crm_writer',
      description: 'Delega ação de escrita ao CRMWriter. Em F3, só ações low-impact. Alto impacto chega em F4.',
      input_schema: {
        type: 'object',
        properties: { intent: { type: 'string' }, payload: { type: 'object' } },
        required: ['intent'],
      },
    });
    registry['delegate_crm_writer'] = {
      handler: async (i) => runSubAgent(this.crmWriter, `${i.intent}\n\nPayload:\n${JSON.stringify(i.payload, null, 2)}`),
    };

    tools.push({
      name: 'delegate_doc_generator',
      description: 'Delega geração de artefato ao DocGenerator.',
      input_schema: {
        type: 'object',
        properties: { tipo: { type: 'string' }, input: { type: 'object' } },
        required: ['tipo'],
      },
    });
    registry['delegate_doc_generator'] = {
      handler: async (i) => runSubAgent(this.docGenerator, `Tipo: ${i.tipo}\n\nInput:\n${JSON.stringify(i.input, null, 2)}`),
    };

    return { tools, registry };
  }

  async chat(sessionId: string | undefined, message: string): Promise<{ reply: string; session: ChatSession }> {
    const session = await this.loadOrCreateSession(sessionId);
    session.messages.push({ id: randomUUID(), role: 'user', content: message, timestamp: Date.now() });

    const { tools, registry } = this.buildTools(session.id, session.messages);
    const system = this.buildSystemPrompt();

    const messages: ClaudeMessage[] = session.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const toolsUsed: string[] = [];
    const result = await runClaude(messages, {
      model: this.model,
      maxTokens: 4000,
      maxIterations: 10,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] as any,
      tools,
      toolRegistry: registry,
      onToolCall: (n) => toolsUsed.push(n),
    });

    const assistant: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: result.text,
      timestamp: Date.now(),
      toolsUsed,
    };
    session.messages.push(assistant);
    session.updatedAt = Date.now();
    await this.saveSession(session);

    return { reply: result.text, session };
  }

  private sessionPath(id: string): string {
    return join(this.storageDir, `${id}.json`);
  }

  async loadOrCreateSession(sessionId?: string): Promise<ChatSession> {
    if (sessionId) {
      try {
        const raw = await fs.readFile(this.sessionPath(sessionId), 'utf-8');
        return JSON.parse(raw);
      } catch {
        /* novo session */
      }
    }
    const now = Date.now();
    return {
      id: sessionId ?? randomUUID(),
      title: 'Nova conversa',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
  }

  private async saveSession(s: ChatSession): Promise<void> {
    await fs.writeFile(this.sessionPath(s.id), JSON.stringify(s, null, 2));
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -i orchestrator | head -10 || echo "OK"
```

Se houver erros relativos a `ClaudeRunResult.text` não existir, confira o shape real em `ClaudeFoundryClient.ts` e ajuste.

- [ ] **Step 3: Teste unitário**

Crie `apps/api/tests/alix/orchestrator.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { OrchestratorService } from '../../src/services/alix/OrchestratorService.ts';
import { DataSourceManager } from '../../src/services/DataSourceManager.ts';
import { join } from 'path';
import { tmpdir } from 'os';

test('OrchestratorService.create instancia sem LLM', async () => {
  const orch = await OrchestratorService.create(
    DataSourceManager.getInstance(),
    join(tmpdir(), `orch-${Date.now()}`),
  );
  assert.ok(orch);
  assert.ok(typeof orch.model === 'string');
});
```

Expected: 1 pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/alix/OrchestratorService.ts apps/api/tests/alix/orchestrator.test.ts
git commit -m "feat(alix): OrchestratorService com 4 delegate_* + tools leves (F3)"
```

---

### Task 22: Integrar OrchestratorService em `routes/alix.ts` com feature flag

**Files:**
- Modify: `apps/api/src/routes/alix.ts`

- [ ] **Step 1: Adicionar factory dual**

No topo de `routes/alix.ts`, adicione imports:

```ts
import { OrchestratorService } from '../services/alix/OrchestratorService.js';
```

Logo após a variável `alixInstance`, adicione:

```ts
let orchestratorInstance: OrchestratorService | null = null;

function isMultiagentEnabled(): boolean {
  return (process.env.ALIX_MULTIAGENT_ENABLED ?? 'true').toLowerCase() !== 'false';
}

async function getOrchestrator(): Promise<OrchestratorService> {
  if (orchestratorInstance) return orchestratorInstance;
  const dsm = DataSourceManager.getInstance();
  const storageDir = join(process.cwd(), 'storage', 'alix-sessions');
  orchestratorInstance = await OrchestratorService.create(dsm, storageDir);
  console.log('[ALIX] OrchestratorService pronto (feature flag multi-agent)');
  return orchestratorInstance;
}
```

- [ ] **Step 2: Ajustar handler `/api/alix/chat`**

Localize o handler de `/api/alix/chat` e substitua a chamada para alix direta por:

```ts
      const multi = isMultiagentEnabled();
      let result: { reply: string; session: ChatSession };
      if (multi) {
        const orch = await getOrchestrator();
        result = await orch.chat(sessionId, message.trim());
      } else {
        result = await alix.chat(sessionId, message.trim(), {
          attachments: Array.isArray(attachments) ? attachments.filter((x) => typeof x === 'string') : undefined,
          clienteId: typeof clienteId === 'string' && clienteId.trim() ? clienteId.trim() : undefined,
        });
      }
```

(Ajuste os tipos/variáveis conforme o handler atual; a ideia é que `multi=true` use `OrchestratorService.chat`.)

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -15
```

Zero erros.

- [ ] **Step 4: Teste de regressão**

Crie `apps/api/tests/alix/regression.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { AlixService } from '../../src/services/AlixService.ts';
import { DataSourceManager } from '../../src/services/DataSourceManager.ts';
import { OrchestratorService } from '../../src/services/alix/OrchestratorService.ts';
import { isLLMEnabled } from '../../src/services/llm/ClaudeFoundryClient.ts';
import { join } from 'path';
import { tmpdir } from 'os';

const runLLM = process.env.RUN_LLM_TESTS === '1';

test(
  'Regression: Alix legado e Orchestrator respondem "qual câmbio?" sem crashar',
  { skip: !runLLM || !isLLMEnabled(), timeout: 60_000 },
  async () => {
    const legacy = new AlixService(DataSourceManager.getInstance(), join(tmpdir(), `leg-${Date.now()}`));
    const r1 = await legacy.chat(undefined, 'Qual o câmbio do dólar hoje? Responda curto.');
    assert.ok(r1.reply.length > 5);

    const orch = await OrchestratorService.create(DataSourceManager.getInstance(), join(tmpdir(), `orch-${Date.now()}`));
    const r2 = await orch.chat(undefined, 'Qual o câmbio do dólar hoje? Responda curto.');
    assert.ok(r2.reply.length > 5);

    console.log('[regression] legacy:', r1.reply.slice(0, 200));
    console.log('[regression] orch  :', r2.reply.slice(0, 200));
  },
);
```

```bash
RUN_LLM_TESTS=1 pnpm --filter @aletis/api test tests/alix/regression.test.ts 2>&1 | tail -25
```

Expected: ambas respondem.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/alix.ts apps/api/tests/alix/regression.test.ts
git commit -m "feat(alix): rota /chat roteia para Orchestrator atrás da flag ALIX_MULTIAGENT_ENABLED (F3)"
```

---

### Task 23: Golden integration test — delegação ao DealAnalyzer funcionando

**Files:**
- Create: `apps/api/tests/alix/delegation-golden.test.ts`

- [ ] **Step 1: Teste**

```ts
// apps/api/tests/alix/delegation-golden.test.ts
import { test } from 'node:test';
import assert from 'node:assert';
import { OrchestratorService } from '../../src/services/alix/OrchestratorService.ts';
import { DataSourceManager } from '../../src/services/DataSourceManager.ts';
import { isLLMEnabled } from '../../src/services/llm/ClaudeFoundryClient.ts';
import { join } from 'path';
import { tmpdir } from 'os';

const runLLM = process.env.RUN_LLM_TESTS === '1';

test(
  'GOLDEN: "analisa o top lead de MT" → delega a DealAnalyzer',
  { skip: !runLLM || !isLLMEnabled(), timeout: 180_000 },
  async () => {
    const orch = await OrchestratorService.create(
      DataSourceManager.getInstance(),
      join(tmpdir(), `orch-golden-${Date.now()}`),
    );
    const res = await orch.chat(
      undefined,
      'Pega o top lead de MT com dívida > R$ 300k, faz um estudo de caso inicial (observação + orientação). Pode delegar ao DealAnalyzer.',
    );
    assert.ok(res.reply.length > 100);
    const tools = res.session.messages.flatMap(m => m.toolsUsed ?? []);
    console.log('[golden] tools used:', tools);
    assert.ok(
      tools.includes('delegate_deal_analyzer') || tools.includes('top_leads_by_score'),
      `Esperava delegação ou tool leve. Tools: ${tools.join(', ')}`,
    );
    console.log('[golden] reply (trunc):', res.reply.slice(0, 1000));
  },
);
```

- [ ] **Step 2: Rodar**

```bash
RUN_LLM_TESTS=1 pnpm --filter @aletis/api test tests/alix/delegation-golden.test.ts 2>&1 | tail -40
```

Expected: resposta longa citando leads MT + tools usadas. Se `delegate_deal_analyzer` apareceu, perfeito. Se só `top_leads_by_score`, o Orchestrator decidiu responder direto — válido mas menos rico; ajuste o prompt do orquestrador se necessário.

- [ ] **Step 3: Se falhar, iterar system prompt**

Se o Orchestrator não delegou, em `OrchestratorService.buildSystemPrompt`, endureça a heurística:

```diff
- "Analisa cliente/lead X" / "estuda" / "recomenda" / "estrutura" → delega DealAnalyzer
+ "Analisa", "estuda caso", "recomenda estratégia", "estrutura", "vale a pena" → SEMPRE delega DealAnalyzer (mesmo que você tenha as tools leves, a análise é dele)
```

Rode novamente.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/alix/delegation-golden.test.ts apps/api/src/services/alix/OrchestratorService.ts
git commit -m "test(alix): golden de delegação DealAnalyzer + ajuste de prompt (F3)"
```

---

### Task 24: Smoke test manual em dev — valida em browser/curl

**Files:** (nenhum arquivo modificado, só verificação manual)

- [ ] **Step 1: Subir API em dev**

```bash
cd /home/azureai/ALETIS/aletis-system && pnpm dev:api &
```

Aguarde alguns segundos até ver `[ALIX] OrchestratorService pronto` no log.

- [ ] **Step 2: Chamar via curl — pergunta leve**

```bash
curl -s -X POST http://localhost:3001/api/alix/chat \
  -H 'content-type: application/json' \
  -d '{"message":"liste top 3 leads MT por dívida"}' | jq .
```

Expected: JSON com `reply` citando 3 leads, `session.messages[-1].toolsUsed` incluindo `listar_leads_filtrados` ou `top_leads_by_score`.

- [ ] **Step 3: Chamar via curl — pergunta que delega**

```bash
curl -s -X POST http://localhost:3001/api/alix/chat \
  -H 'content-type: application/json' \
  -d '{"message":"analisa o top lead de MT com dívida > R$ 300k"}' | jq .
```

Expected: reply longa, `toolsUsed` inclui `delegate_deal_analyzer`.

- [ ] **Step 4: Desligar dev**

```bash
pkill -f "tsx watch" || true
```

- [ ] **Step 5: Commit (só mensagem marcando fase concluída — não há diff)**

```bash
git commit --allow-empty -m "chore(alix): F3 smoke manual OK — Orchestrator + 4 sub-agentes (skeleton)"
```

---

## Self-Review do Plano

Ao final, verifique:

- [ ] **Cobertura do spec**: Tasks 1-24 cobrem F0 (Tasks 1-5), F1 (Tasks 6-8), F2 (Tasks 9-15), F3 (Tasks 16-24)? ✓
- [ ] **Placeholders**: nenhum "TBD", "TODO", "implement later" em steps?
- [ ] **Type consistency**: `SubAgent`, `SubAgentContext`, `SubAgentResult`, `WebSearchProvider`, `ClaudeRunResult.text` — consistentes entre tasks? (Task 5 lembra de ajustar ao shape real)
- [ ] **Feature flag**: `ALIX_MULTIAGENT_ENABLED` com default `true` mas com fallback legacy (Task 22) ✓
- [ ] **Backward compat**: Tasks 7-8 e 15 adicionam tools ao Alix legado; Task 22 mantém Alix legado funcionando se flag=false ✓

---

## O que fica para o Plano 2 (F4-F5)

- **F4**: 10 tools HITL (criar_cliente, promover_lead, criar_proposta_inteligente, etc.), `ConfirmationBatch` com topological sort, endpoints `/api/alix/confirmations/batch/:id/apply`
- **F5**: UI — `<AlixConfirmationBatch />`, `<SubagentIndicator />`, SSE events `subagent:active`, `batch:created`, `batch:progress`, `batch:done`

## O que fica para o Plano 3 (F6-F8)

- **F6**: System prompts completos (Orchestrator integral + 4 sub-agentes refinados), cache de prompt
- **F7**: Extended thinking ativo no DealAnalyzer + telemetria JSONL + rota `/api/alix/telemetry/:sessionId`
- **F8**: Pipeline E2E — "pega top lead, faz estudo completo, cria cliente + proposta + dossiê" — golden test com custo medido

Cada plano produz software testável e deploy-safe.
