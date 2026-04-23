# ALIX Insano — Plano 2: HITL CRUD + Batch + SSE (F4-F5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Alix escreve no CRM com confirmação humana — criar cliente, promover lead, criar/atualizar proposta — com `ConfirmationBatch` para agrupar múltiplas pending confirmations em ordem topológica e stream SSE para a UI.

**Architecture:** Estende o `AlixConfirmationStore` com conceito de **batch** (dependsOn entre pendings). Novos handlers `handle_*` + `exec_*` seguem o padrão Wave 6 existente no `AlixService`. `CRMWriterAgent` passa a expor 4 tools HITL. Orchestrator agrupa 2+ pendings em batch automaticamente.

**Tech Stack:** TypeScript · Fastify · mesmos padrões do Plano 1 · sem deps novas.

**Ref spec:** `docs/superpowers/specs/2026-04-23-alix-insano-design.md` (seções 4.3, 7, 8.4)

---

## File Structure

### Modificados
| Arquivo | Mudança |
|---|---|
| `apps/api/src/services/alix/AlixConfirmationStore.ts` | + `ConfirmationBatch`, `createBatch`, `applyBatch` (topological), `cancelBatch`, `listBatches`, event bus |
| `apps/api/src/routes/alix-confirmations.ts` | + 4 endpoints batch + `/stream` (SSE) |
| `apps/api/src/services/AlixService.ts` | + 4 pares `handle_*/exec_*` (criar_cliente, promover_lead, criar_proposta, atualizar_proposta) + `registerCrmWriteBackends` |
| `apps/api/src/routes/alix.ts` | Liga backends reais de clientes/propostas/leads |
| `apps/api/src/services/alix/agents/CRMWriterAgent.ts` | Recebe `AlixService` e expõe 4 tools HITL |
| `apps/api/src/services/alix/agents/BaseAgent.ts` | Captura `pendingConfirmations` via callback |
| `apps/api/src/services/alix/OrchestratorService.ts` | Agrupa 2+ pendings em batch |

### Criados
| Arquivo | Propósito |
|---|---|
| `apps/api/src/services/alix/crm/writer-tools.ts` | Toolkit HITL reutilizável |
| `apps/api/tests/alix/confirmation-batch.test.ts` | Testes topological + skip-on-fail |
| `apps/api/tests/alix/crm-writer-tools.test.ts` | Testes dos 4 handlers |

---

## Task 1: ConfirmationBatch + event bus

**Files:**
- Modify: `apps/api/src/services/alix/AlixConfirmationStore.ts`
- Create: `apps/api/tests/alix/confirmation-batch.test.ts`

- [ ] **Testes primeiro**

Crie `apps/api/tests/alix/confirmation-batch.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { AlixConfirmationStore } from '../../src/services/alix/AlixConfirmationStore.ts';

test('createBatch agrupa pendings com dependsOn', () => {
  const store = new AlixConfirmationStore();
  const batch = store.createBatch('sess1', 'Onboarding', [
    { toolName: 'criar_cliente', description: 'Cria cliente', payload: { nome: 'X' } },
    { toolName: 'criar_proposta', description: 'Cria proposta', payload: {}, dependsOn: 0 },
  ]);
  assert.strictEqual(batch.pendings.length, 2);
  assert.strictEqual(batch.pendings[1].dependsOn?.[0], batch.pendings[0].id);
  assert.strictEqual(batch.status, 'pending');
});

test('topological apply: ordem correta + skip em falha', async () => {
  const store = new AlixConfirmationStore();
  const batch = store.createBatch('sess1', 'Test', [
    { toolName: 'a', description: 'A', payload: {} },
    { toolName: 'b', description: 'B', payload: {}, dependsOn: 0 },
    { toolName: 'c', description: 'C', payload: {}, dependsOn: 1 },
  ]);
  const order: string[] = [];
  const results = await store.applyBatch(batch.id, async (p) => {
    order.push(p.toolName);
    if (p.toolName === 'b') throw new Error('fail B');
    return { ok: true };
  });
  assert.deepStrictEqual(order, ['a', 'b']);
  assert.strictEqual(results.applied.length, 1);
  assert.strictEqual(results.failed.length, 1);
  assert.strictEqual(results.skipped.length, 1);
  assert.strictEqual(results.skipped[0].toolName, 'c');
});

test('event bus emite batch:created/progress/done', async () => {
  const store = new AlixConfirmationStore();
  const events: string[] = [];
  store.on((ev) => events.push(ev.type));
  const batch = store.createBatch('s', 'x', [{ toolName: 'a', description: 'A', payload: {} }]);
  await store.applyBatch(batch.id, async () => ({ ok: true }));
  assert.ok(events.includes('batch:created'));
  assert.ok(events.includes('batch:progress'));
  assert.ok(events.includes('batch:done'));
});
```

- [ ] **Types + event bus no Store**

Em `apps/api/src/services/alix/AlixConfirmationStore.ts`, após o type `PendingConfirmation`:

```ts
export interface PendingConfirmationWithDeps extends PendingConfirmation {
  batchId?: string;
  dependsOn?: string[];
}

export type BatchStatus = 'pending' | 'applying' | 'partial_applied' | 'all_applied' | 'cancelled' | 'failed';

export interface ConfirmationBatch {
  batchId: string;
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: BatchStatus;
  pendings: PendingConfirmationWithDeps[];
  results?: {
    applied: Array<{ confirmationId: string; toolName: string; result: unknown }>;
    failed: Array<{ confirmationId: string; toolName: string; error: string }>;
    skipped: Array<{ confirmationId: string; toolName: string; reason: string }>;
  };
}

export interface BatchInputItem {
  toolName: string;
  description: string;
  payload: Record<string, unknown>;
  dependsOn?: number | number[];
}

export type StoreEvent =
  | { type: 'pending:created'; confirmation: PendingConfirmation }
  | { type: 'batch:created'; batch: ConfirmationBatch }
  | { type: 'batch:progress'; batchId: string; confirmationId: string; status: 'applying' | 'applied' | 'failed' | 'skipped'; detail?: unknown }
  | { type: 'batch:done'; batch: ConfirmationBatch };

export type StoreListener = (ev: StoreEvent) => void;
```

Dentro da classe, após `cleanupTimer`:

```ts
  private readonly batches: Map<string, ConfirmationBatch> = new Map();
  private readonly listeners: Set<StoreListener> = new Set();

  on(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(ev: StoreEvent): void {
    for (const l of this.listeners) {
      try { l(ev); } catch (err) { console.warn('[AlixConfirmationStore] listener erro:', (err as Error).message); }
    }
  }
```

No método `create`, antes do `return entry;`:

```ts
    this.emit({ type: 'pending:created', confirmation: entry });
```

Ao final da classe (antes do `}` de fecho), adicione:

```ts
  createBatch(sessionId: string, title: string, items: BatchInputItem[]): ConfirmationBatch {
    const now = Date.now();
    const batchId = 'batch_' + randomBytes(8).toString('hex');
    const pendings: PendingConfirmationWithDeps[] = [];

    for (const it of items) {
      const base = this.create(it.toolName, it.description, it.payload, sessionId);
      const stored = this.store.get(base.id) as PendingConfirmationWithDeps;
      stored.batchId = batchId;
      pendings.push(stored);
    }
    for (let i = 0; i < items.length; i++) {
      const raw = items[i].dependsOn;
      if (raw === undefined) continue;
      const indices = Array.isArray(raw) ? raw : [raw];
      const depIds = indices
        .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < pendings.length && idx !== i)
        .map(idx => pendings[idx].id);
      pendings[i].dependsOn = depIds;
    }

    const batch: ConfirmationBatch = {
      batchId, sessionId, title,
      createdAt: now, updatedAt: now,
      status: 'pending',
      pendings,
    };
    this.batches.set(batchId, batch);
    this.emit({ type: 'batch:created', batch });
    return batch;
  }

  getBatch(batchId: string): ConfirmationBatch | null {
    return this.batches.get(batchId) ?? null;
  }

  listBatches(): ConfirmationBatch[] {
    return Array.from(this.batches.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async applyBatch(
    batchId: string,
    runner: (p: PendingConfirmationWithDeps) => Promise<unknown>,
    opts: { only?: string[] } = {},
  ): Promise<{ applied: Array<{ confirmationId: string; toolName: string; result: unknown }>; failed: Array<{ confirmationId: string; toolName: string; error: string }>; skipped: Array<{ confirmationId: string; toolName: string; reason: string }> }> {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error('Batch não encontrado');
    if (batch.status === 'all_applied' || batch.status === 'cancelled') {
      throw new Error(`Batch em estado terminal: ${batch.status}`);
    }
    batch.status = 'applying';
    batch.updatedAt = Date.now();

    const applied: Array<{ confirmationId: string; toolName: string; result: unknown }> = [];
    const failed: Array<{ confirmationId: string; toolName: string; error: string }> = [];
    const skipped: Array<{ confirmationId: string; toolName: string; reason: string }> = [];
    const successIds = new Set<string>();
    const failedIds = new Set<string>();
    const restrict = opts.only ? new Set(opts.only) : null;
    const remaining = [...batch.pendings];

    while (remaining.length > 0) {
      const idx = remaining.findIndex(p => {
        if (restrict && !restrict.has(p.id)) return false;
        if (!p.dependsOn || p.dependsOn.length === 0) return true;
        return p.dependsOn.every(dep => successIds.has(dep));
      });
      if (idx === -1) {
        for (const p of remaining) {
          const reason = p.dependsOn?.some(dep => failedIds.has(dep)) ? 'dependência falhou' : 'bloqueado';
          skipped.push({ confirmationId: p.id, toolName: p.toolName, reason });
          this.emit({ type: 'batch:progress', batchId, confirmationId: p.id, status: 'skipped', detail: reason });
        }
        break;
      }
      const [current] = remaining.splice(idx, 1);
      this.emit({ type: 'batch:progress', batchId, confirmationId: current.id, status: 'applying' });
      try {
        const result = await runner(current);
        applied.push({ confirmationId: current.id, toolName: current.toolName, result });
        successIds.add(current.id);
        this.store.delete(current.id);
        this.emit({ type: 'batch:progress', batchId, confirmationId: current.id, status: 'applied', detail: result });
      } catch (err) {
        const errorMsg = (err as Error).message;
        failed.push({ confirmationId: current.id, toolName: current.toolName, error: errorMsg });
        failedIds.add(current.id);
        this.store.delete(current.id);
        this.emit({ type: 'batch:progress', batchId, confirmationId: current.id, status: 'failed', detail: errorMsg });
      }
    }

    batch.results = { applied, failed, skipped };
    if (failed.length === 0 && skipped.length === 0) batch.status = 'all_applied';
    else if (applied.length > 0) batch.status = 'partial_applied';
    else batch.status = 'failed';
    batch.updatedAt = Date.now();
    this.emit({ type: 'batch:done', batch });
    return { applied, failed, skipped };
  }

  cancelBatch(batchId: string): ConfirmationBatch | null {
    const batch = this.batches.get(batchId);
    if (!batch) return null;
    if (batch.status !== 'pending') return batch;
    for (const p of batch.pendings) this.store.delete(p.id);
    batch.status = 'cancelled';
    batch.updatedAt = Date.now();
    this.emit({ type: 'batch:done', batch });
    return batch;
  }
```

- [ ] **Typecheck + test + commit**

```
pnpm --filter @aletis/api typecheck
pnpm --filter @aletis/api test
git add apps/api/src/services/alix/AlixConfirmationStore.ts apps/api/tests/alix/confirmation-batch.test.ts
git commit -m "feat(alix): ConfirmationBatch + topological apply + event bus (F4)"
```

---

## Task 2: Endpoints batch + SSE stream

**Files:**
- Modify: `apps/api/src/routes/alix-confirmations.ts`

- [ ] **Adicionar endpoints no final de `alixConfirmationsRoutes`** (antes do `console.log` final):

```ts
  // ── GET /batches ──
  fastify.get('/api/alix/confirmations/batches', async (_req, reply) => {
    const items = store.listBatches().map(b => ({
      batchId: b.batchId, sessionId: b.sessionId, title: b.title, status: b.status,
      createdAt: new Date(b.createdAt).toISOString(),
      updatedAt: new Date(b.updatedAt).toISOString(),
      pendingCount: b.pendings.length,
    }));
    return reply.send({ success: true, data: items, total: items.length });
  });

  // ── GET /batch/:batchId ──
  fastify.get('/api/alix/confirmations/batch/:batchId',
    async (req: FastifyRequest<{ Params: { batchId: string } }>, reply) => {
      const batch = store.getBatch(req.params.batchId);
      if (!batch) return reply.status(404).send({ success: false, error: 'Batch não encontrado' });
      return reply.send({ success: true, data: batch });
    });

  // ── POST /batch/:batchId/apply ──
  fastify.post('/api/alix/confirmations/batch/:batchId/apply',
    async (req: FastifyRequest<{ Params: { batchId: string }; Body: { only?: string[] } }>, reply) => {
      const batch = store.getBatch(req.params.batchId);
      if (!batch) return reply.status(404).send({ success: false, error: 'Batch não encontrado' });
      const alix = getAlixServiceForExecutors();
      try {
        const results = await store.applyBatch(req.params.batchId, async (p) => {
          const run = alix.getExecutor(p.toolName);
          if (!run) throw new Error(`Executor não registrado: ${p.toolName}`);
          return run(p.payload);
        }, req.body ?? {});
        return reply.send({ success: true, data: { batchId: req.params.batchId, ...results, status: store.getBatch(req.params.batchId)?.status } });
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message });
      }
    });

  // ── POST /batch/:batchId/cancel ──
  fastify.post('/api/alix/confirmations/batch/:batchId/cancel',
    async (req: FastifyRequest<{ Params: { batchId: string } }>, reply) => {
      const batch = store.cancelBatch(req.params.batchId);
      if (!batch) return reply.status(404).send({ success: false, error: 'Batch não encontrado' });
      return reply.send({ success: true, data: { batchId: batch.batchId, status: batch.status } });
    });

  // ── GET /stream (SSE) ──
  fastify.get('/api/alix/confirmations/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const write = (ev: unknown) => reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    write({ type: 'hello', ts: new Date().toISOString() });
    const unsub = store.on((ev) => write(ev));
    const keepalive = setInterval(() => reply.raw.write(': keepalive\n\n'), 25_000);
    request.raw.on('close', () => { clearInterval(keepalive); unsub(); });
  });
```

- [ ] **Typecheck + smoke**

```
pnpm --filter @aletis/api typecheck
curl -s http://localhost:3001/api/alix/confirmations/batches | jq .
```

Expected: `{"success":true,"data":[],"total":0}`.

- [ ] **Commit**

```
git add apps/api/src/routes/alix-confirmations.ts
git commit -m "feat(alix): endpoints batch + SSE /stream em alix-confirmations (F4)"
```

---

## Task 3: 4 handlers HITL + backends no AlixService

**Files:**
- Modify: `apps/api/src/services/AlixService.ts`

- [ ] **Types + setter de backends**

Em `apps/api/src/services/AlixService.ts`, após `registerStores(...)`:

```ts
// ── Alix Insano F4 — escrita no CRM ──────────────────────
interface CrmWriteBackends {
  setCliente?: (cliente: { id: string; [key: string]: unknown }) => void;
  setPropostaInteligente?: (p: { id: string; [key: string]: unknown }) => void;
  updateProposta?: (id: string, partial: Record<string, unknown>) => boolean;
  getLead?: (cpfCnpj: string) => unknown;
}
let crmWriteBackends: CrmWriteBackends = {};
export function registerCrmWriteBackends(b: CrmWriteBackends): void {
  crmWriteBackends = { ...crmWriteBackends, ...b };
}
function getCrmWriteBackends(): CrmWriteBackends { return crmWriteBackends; }
```

- [ ] **4 pares handle/exec dentro da classe**

Adicione dentro de `class AlixService` (antes do `}` final):

```ts
  // ── F4 · criar_cliente ─────────────────────────────────
  public handle_criar_cliente(input: Record<string, unknown>): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    const nome = String(input.nome || '').trim();
    const tipoPessoa = String(input.tipoPessoa || 'PF').toUpperCase();
    const cpfCnpj = String(input.cpfCnpj || '').replace(/\D/g, '');
    const uf = String(input.uf || '').toUpperCase();
    if (!nome || !cpfCnpj) return this.invalidInput('Faltam: nome e cpfCnpj');
    if (!['PF', 'PJ'].includes(tipoPessoa)) return this.invalidInput('tipoPessoa deve ser PF ou PJ');
    const payload = {
      nome, tipoPessoa, cpfCnpj, uf,
      email: String(input.email || ''),
      telefone: String(input.telefone || ''),
      dividaTotal: Number(input.dividaTotal ?? 0),
      origem: String(input.origem || 'alix'),
    };
    return this.buildPendingResponse('criar_cliente',
      `Criar cliente ${nome} (${tipoPessoa} ${cpfCnpj})`, payload,
      { nome, tipoPessoa, cpfCnpj, uf });
  }

  private async exec_criar_cliente(payload: Record<string, unknown>): Promise<unknown> {
    const b = getCrmWriteBackends();
    if (!b.setCliente) throw new Error('Backend setCliente não registrado');
    const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const cliente = {
      id, nome: payload.nome, tipoPessoa: payload.tipoPessoa, cpfCnpj: payload.cpfCnpj,
      uf: payload.uf, email: payload.email, telefone: payload.telefone,
      dividaTotal: Number(payload.dividaTotal ?? 0),
      statusAtendimento: 'ativo', origem: payload.origem,
      criadoEm: now, atualizadoEm: now,
    };
    b.setCliente(cliente);
    return { id, cliente };
  }

  // ── F4 · promover_lead_para_cliente ────────────────────
  public handle_promover_lead_para_cliente(input: Record<string, unknown>) {
    const cpfCnpj = String(input.cpfCnpj || '').replace(/\D/g, '');
    if (!cpfCnpj) return this.invalidInput('cpfCnpj obrigatório');
    const b = getCrmWriteBackends();
    const lead = b.getLead ? b.getLead(cpfCnpj) : null;
    if (!lead) return this.invalidInput(`Lead ${cpfCnpj} não encontrado na prospecção`);
    const l = lead as { nome?: string; uf?: string; totalDivida?: number };
    return this.buildPendingResponse('promover_lead_para_cliente',
      `Promover lead ${l.nome ?? cpfCnpj} para cliente`,
      { cpfCnpj, lead: l },
      { cpfCnpj, nome: l.nome, uf: l.uf, divida: l.totalDivida });
  }

  private async exec_promover_lead_para_cliente(payload: Record<string, unknown>): Promise<unknown> {
    const b = getCrmWriteBackends();
    if (!b.setCliente || !b.getLead) throw new Error('Backends CRM não registrados');
    const cpfCnpj = String(payload.cpfCnpj);
    const lead = b.getLead(cpfCnpj) as {
      nome?: string; tipoPessoa?: string; uf?: string; totalDivida?: number;
      enrichment?: { razaoSocial?: string; email?: string; telefone1?: string };
    };
    if (!lead) throw new Error('Lead sumiu entre handle e apply');
    const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const cliente = {
      id,
      nome: lead.enrichment?.razaoSocial ?? lead.nome ?? `Lead ${cpfCnpj}`,
      tipoPessoa: lead.tipoPessoa ?? 'PF',
      cpfCnpj, uf: lead.uf ?? '',
      email: lead.enrichment?.email ?? '',
      telefone: lead.enrichment?.telefone1 ?? '',
      dividaTotal: Number(lead.totalDivida ?? 0),
      statusAtendimento: 'ativo', origem: 'prospeccao',
      leadCpfCnpj: cpfCnpj,
      criadoEm: now, atualizadoEm: now,
    };
    b.setCliente(cliente);
    return { id, cliente };
  }

  // ── F4 · criar_proposta_inteligente ────────────────────
  public handle_criar_proposta_inteligente(input: Record<string, unknown>) {
    const clienteId = String(input.clienteId || '').trim();
    const dividaTotal = Number(input.dividaTotal ?? 0);
    const estrategia = String(input.estrategia || 'padrão').trim();
    const bancos = Array.isArray(input.bancos) ? (input.bancos as string[]) : [];
    if (!clienteId || dividaTotal <= 0) return this.invalidInput('clienteId e dividaTotal > 0 obrigatórios');
    return this.buildPendingResponse('criar_proposta_inteligente',
      `Criar proposta para cliente ${clienteId} (R$ ${dividaTotal.toLocaleString('pt-BR')}, ${estrategia})`,
      { clienteId, dividaTotal, estrategia, bancos, observacao: String(input.observacao || '') },
      { clienteId, dividaTotal, estrategia, bancosCount: bancos.length });
  }

  private async exec_criar_proposta_inteligente(payload: Record<string, unknown>): Promise<unknown> {
    const b = getCrmWriteBackends();
    if (!b.setPropostaInteligente) throw new Error('Backend setPropostaInteligente não registrado');
    const id = `prop-int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const proposta = {
      id, clienteId: payload.clienteId,
      dividaTotal: Number(payload.dividaTotal ?? 0),
      estrategia: payload.estrategia, bancos: payload.bancos, observacao: payload.observacao,
      criadoEm: new Date().toISOString(), criadoPor: 'alix',
      secoes: Array(15).fill(0).map((_, i) => ({ ordem: i + 1, titulo: `Seção ${i + 1}`, status: 'rascunho' })),
    };
    b.setPropostaInteligente(proposta);
    return { id, proposta };
  }

  // ── F4 · atualizar_proposta ────────────────────────────
  public handle_atualizar_proposta(input: Record<string, unknown>) {
    const id = String(input.id || '').trim();
    if (!id) return this.invalidInput('id obrigatório');
    const partial: Record<string, unknown> = {};
    for (const k of ['estrategia', 'dividaTotal', 'observacao', 'status', 'valor', 'prazoMeses', 'taxaNominal']) {
      if (input[k] !== undefined) partial[k] = input[k];
    }
    if (Object.keys(partial).length === 0) {
      return this.invalidInput('Envie ao menos um de: estrategia, dividaTotal, observacao, status, valor, prazoMeses, taxaNominal');
    }
    return this.buildPendingResponse('atualizar_proposta',
      `Atualizar proposta ${id} (${Object.keys(partial).join(', ')})`,
      { id, partial },
      { id, campos: Object.keys(partial) });
  }

  private async exec_atualizar_proposta(payload: Record<string, unknown>): Promise<unknown> {
    const b = getCrmWriteBackends();
    if (!b.updateProposta) throw new Error('Backend updateProposta não registrado');
    const id = String(payload.id);
    const partial = (payload.partial as Record<string, unknown>) ?? {};
    const ok = b.updateProposta(id, partial);
    if (!ok) throw new Error(`Proposta ${id} não encontrada`);
    return { id, atualizado: true, campos: Object.keys(partial) };
  }

  private invalidInput(msg: string): { content: string; sources: string[]; toolsUsed: string[]; metadata: Record<string, unknown> } {
    return { content: msg, sources: [], toolsUsed: [], metadata: { pendingConfirmation: false, error: 'invalid_input' } };
  }
```

- [ ] **Registrar no `getExecutor` map** (localize o método `public getExecutor(toolName: string)`) — adicione 4 entradas:

```ts
      criar_cliente: (p) => this.exec_criar_cliente(p as Record<string, unknown>),
      promover_lead_para_cliente: (p) => this.exec_promover_lead_para_cliente(p as Record<string, unknown>),
      criar_proposta_inteligente: (p) => this.exec_criar_proposta_inteligente(p as Record<string, unknown>),
      atualizar_proposta: (p) => this.exec_atualizar_proposta(p as Record<string, unknown>),
```

- [ ] **Typecheck + commit**

```
pnpm --filter @aletis/api typecheck
git add apps/api/src/services/AlixService.ts
git commit -m "feat(alix): 4 pares handle/exec HITL CRUD + registerCrmWriteBackends (F4)"
```

---

## Task 4: Ligar backends reais em `routes/alix.ts`

**Files:**
- Modify: `apps/api/src/routes/alix.ts`

- [ ] **Imports**

```ts
import { AlixService, registerStores, registerCrmWriteBackends } from '../services/AlixService.js'
import { getProspeccaoService } from '../services/prospeccao/ProspeccaoService.js'
```

- [ ] **Chamada após `registerStores`** (dentro de `getAlixService`):

```ts
  registerCrmWriteBackends({
    setCliente: (c) => { clientes.set(c.id as string, c as any); },
    setPropostaInteligente: (p) => { propostasInteligentes.set(p.id as string, p as any); },
    updateProposta: (id, partial) => {
      const p = propostas.get(id);
      if (!p) return false;
      Object.assign(p as any, partial, { atualizadoEm: new Date().toISOString() });
      propostas.set(id, p);
      return true;
    },
    getLead: (cpfCnpj) => getProspeccaoService().getLead(cpfCnpj),
  });
```

- [ ] **Typecheck + commit**

```
pnpm --filter @aletis/api typecheck
git add apps/api/src/routes/alix.ts
git commit -m "feat(alix): liga backends reais de cliente/proposta/lead (F4)"
```

---

## Task 5: CRMWriterAgent com 4 tools HITL

**Files:**
- Create: `apps/api/src/services/alix/crm/writer-tools.ts`
- Modify: `apps/api/src/services/alix/agents/CRMWriterAgent.ts`
- Create: `apps/api/tests/alix/crm-writer-tools.test.ts`

- [ ] **Toolkit**

Crie `apps/api/src/services/alix/crm/writer-tools.ts`:

```ts
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';

export interface CrmWriterHandlers {
  handle_criar_cliente: (i: Record<string, unknown>) => unknown;
  handle_promover_lead_para_cliente: (i: Record<string, unknown>) => unknown;
  handle_criar_proposta_inteligente: (i: Record<string, unknown>) => unknown;
  handle_atualizar_proposta: (i: Record<string, unknown>) => unknown;
}

export function buildCrmWriterTools(h: CrmWriterHandlers): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = [
    {
      name: 'criar_cliente',
      description: 'Cria novo cliente no CRM. ALTO IMPACTO — cria pending confirmation que precisa aprovação humana.',
      input_schema: {
        type: 'object',
        properties: {
          nome: { type: 'string' }, tipoPessoa: { type: 'string', enum: ['PF', 'PJ'] },
          cpfCnpj: { type: 'string' }, uf: { type: 'string' },
          email: { type: 'string' }, telefone: { type: 'string' },
          dividaTotal: { type: 'number' }, origem: { type: 'string' },
        },
        required: ['nome', 'cpfCnpj'],
      },
    },
    {
      name: 'promover_lead_para_cliente',
      description: 'Promove lead da Prospecção para cliente, reaproveitando enriquecimento. ALTO IMPACTO — HITL.',
      input_schema: { type: 'object', properties: { cpfCnpj: { type: 'string' } }, required: ['cpfCnpj'] },
    },
    {
      name: 'criar_proposta_inteligente',
      description: 'Cria proposta inteligente (15 seções). ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' }, dividaTotal: { type: 'number' },
          estrategia: { type: 'string' }, bancos: { type: 'array', items: { type: 'string' } },
          observacao: { type: 'string' },
        },
        required: ['clienteId', 'dividaTotal'],
      },
    },
    {
      name: 'atualizar_proposta',
      description: 'Atualiza campos de proposta existente. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' }, estrategia: { type: 'string' }, dividaTotal: { type: 'number' },
          observacao: { type: 'string' }, status: { type: 'string' }, valor: { type: 'number' },
          prazoMeses: { type: 'number' }, taxaNominal: { type: 'number' },
        },
        required: ['id'],
      },
    },
  ];
  const registry: ClaudeToolRegistry = {
    criar_cliente: { spec: tools[0], handler: async (i) => h.handle_criar_cliente(i) },
    promover_lead_para_cliente: { spec: tools[1], handler: async (i) => h.handle_promover_lead_para_cliente(i) },
    criar_proposta_inteligente: { spec: tools[2], handler: async (i) => h.handle_criar_proposta_inteligente(i) },
    atualizar_proposta: { spec: tools[3], handler: async (i) => h.handle_atualizar_proposta(i) },
  };
  return { tools, registry };
}
```

- [ ] **CRMWriterAgent recebe AlixService**

Substitua `apps/api/src/services/alix/agents/CRMWriterAgent.ts`:

```ts
// ============================================================
// CRMWriterAgent — 4 tools HITL (F4)
// ============================================================
import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { buildCrmWriterTools } from '../crm/writer-tools.js';
import type { AlixService } from '../../AlixService.js';

export class CRMWriterAgent extends BaseAgent {
  name = 'CRMWriter';
  model = process.env.ALIX_CRM_WRITER_MODEL || 'claude-sonnet-4-6';
  maxTokens = 4000;
  maxIterations = 10;

  constructor(private alix: AlixService) { super(); }

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o CRMWriter da ALETIS — sub-agente do Alix.

Você tem 4 tools HITL (todas alto impacto — criam pending confirmation):
- criar_cliente: novo cliente do zero
- promover_lead_para_cliente: converte lead Prospecção em cliente
- criar_proposta_inteligente: proposta 15 seções
- atualizar_proposta: patch em proposta existente

Regras:
1. Valide payload antes de chamar: campos obrigatórios preenchidos?
2. Após tool retornar confirmationId, pare — o orquestrador vai agrupar e entregar ao user.
3. Se faltar dado, diga ao orquestrador.

Contexto:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId: ${ctx.clienteId}` : ''}
${ctx.leadCpfCnpj ? `- leadCpfCnpj: ${ctx.leadCpfCnpj}` : ''}`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    return buildCrmWriterTools({
      handle_criar_cliente: (i) => this.alix.handle_criar_cliente(i),
      handle_promover_lead_para_cliente: (i) => this.alix.handle_promover_lead_para_cliente(i),
      handle_criar_proposta_inteligente: (i) => this.alix.handle_criar_proposta_inteligente(i),
      handle_atualizar_proposta: (i) => this.alix.handle_atualizar_proposta(i),
    });
  }
}
```

- [ ] **Orchestrator recebe/cria AlixService e injeta no CRMWriter**

Em `apps/api/src/services/alix/OrchestratorService.ts`, no topo:

```ts
import { AlixService } from '../AlixService.js';
```

Na interface `OrchestratorOpts` adicione:

```ts
export interface OrchestratorOpts {
  thinkingSupported?: boolean;
  alix?: AlixService;
}
```

No construtor:

```ts
  private alix: AlixService;

  constructor(private dsm: DataSourceManager, private storageDir: string, opts: OrchestratorOpts = {}) {
    this.alix = opts.alix ?? new AlixService(dsm, storageDir);
    this.dealAnalyzer = new DealAnalyzerAgent({ thinkingSupported: opts.thinkingSupported });
    this.webResearcher = new WebResearcherAgent();
    this.crmWriter = new CRMWriterAgent(this.alix);
    this.docGenerator = new DocGeneratorAgent();
  }
```

- [ ] **Testes**

Crie `apps/api/tests/alix/crm-writer-tools.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import { buildCrmWriterTools } from '../../src/services/alix/crm/writer-tools.ts';

test('buildCrmWriterTools retorna 4 tools HITL', () => {
  const { tools } = buildCrmWriterTools({
    handle_criar_cliente: () => ({}),
    handle_promover_lead_para_cliente: () => ({}),
    handle_criar_proposta_inteligente: () => ({}),
    handle_atualizar_proposta: () => ({}),
  });
  const names = tools.map(t => t.name).sort();
  assert.deepStrictEqual(names, ['atualizar_proposta', 'criar_cliente', 'criar_proposta_inteligente', 'promover_lead_para_cliente']);
});

test('handler criar_cliente chama callback', async () => {
  let called = false;
  const { registry } = buildCrmWriterTools({
    handle_criar_cliente: (i) => { called = true; return { received: i }; },
    handle_promover_lead_para_cliente: () => ({}),
    handle_criar_proposta_inteligente: () => ({}),
    handle_atualizar_proposta: () => ({}),
  });
  await registry['criar_cliente'].handler({ nome: 'X', cpfCnpj: '123' });
  assert.ok(called);
});
```

- [ ] **Typecheck + test + commit**

```
pnpm --filter @aletis/api typecheck
pnpm --filter @aletis/api test
git add apps/api/src/services/alix/crm apps/api/src/services/alix/agents/CRMWriterAgent.ts apps/api/src/services/alix/OrchestratorService.ts apps/api/tests/alix/crm-writer-tools.test.ts
git commit -m "feat(alix): CRMWriterAgent com 4 tools HITL (F4)"
```

---

## Task 6: BaseAgent captura pendingConfirmations + Orchestrator agrupa em batch

**Files:**
- Modify: `apps/api/src/services/alix/agents/BaseAgent.ts`
- Modify: `apps/api/src/services/alix/OrchestratorService.ts`

- [ ] **BaseAgent captura IDs**

Em `BaseAgent.run`, modifique o bloco `onToolCall` e adicione captura:

```ts
    const toolCalls: string[] = [];
    const pendingConfirmations: string[] = [];
    // ...
    const result = await runClaude(messages, {
      // ...existing opts,
      onToolCall: (toolName, _input, out) => {
        toolCalls.push(toolName);
        const meta = (out as { metadata?: { confirmationId?: string; pendingConfirmation?: boolean } } | undefined)?.metadata;
        if (meta?.pendingConfirmation && typeof meta.confirmationId === 'string') {
          pendingConfirmations.push(meta.confirmationId);
        }
      },
    });
```

E retorno:

```ts
    return {
      agent: this.name,
      summary: result.text,
      toolCalls,
      pendingConfirmations: pendingConfirmations.length > 0 ? pendingConfirmations : undefined,
      usage: { /* ... */ },
    };
```

- [ ] **Orchestrator agrupa em batch**

Em `OrchestratorService`, adicione import:

```ts
import { getAlixConfirmationStore } from './AlixConfirmationStore.js';
```

Substitua o handler `delegate_crm_writer`:

```ts
    registry['delegate_crm_writer'] = {
      spec: crmWriterTool,
      handler: async (i) => {
        const sub = await runSubAgent(this.crmWriter, `${i.intent}\n\nPayload:\n${JSON.stringify(i.payload, null, 2)}`);
        if (sub.pendingConfirmations && sub.pendingConfirmations.length >= 2) {
          const store = getAlixConfirmationStore();
          const individuals = sub.pendingConfirmations
            .map(id => store.get(id))
            .filter((p): p is NonNullable<typeof p> => Boolean(p));
          if (individuals.length >= 2) {
            const items = individuals.map((p, idx) => ({
              toolName: p.toolName,
              description: p.description,
              payload: p.payload,
              dependsOn: idx > 0 ? idx - 1 : undefined,
            }));
            for (const id of sub.pendingConfirmations) store.consume(id);
            const batch = store.createBatch(sessionId, `Pipeline ${sub.agent}`, items);
            return { ...sub, batch: { batchId: batch.batchId, pendingCount: batch.pendings.length } };
          }
        }
        return sub;
      },
    };
```

- [ ] **Typecheck + commit**

```
pnpm --filter @aletis/api typecheck
git add apps/api/src/services/alix/agents/BaseAgent.ts apps/api/src/services/alix/OrchestratorService.ts
git commit -m "feat(alix): Orchestrator agrupa pendings do CRMWriter em batch (F4)"
```

---

## Task 7: Smoke E2E

**Files:** nenhum arquivo modificado

- [ ] **Single pending**

```
curl -s -X POST http://localhost:3001/api/alix/chat \
  -H 'content-type: application/json' \
  -d '{"message":"cria cliente João da Silva, PF, CPF 12345678901, UF MT, dívida total 450000"}' \
  | jq '.data.reply'
```

Deve mencionar pending confirmation com ID.

- [ ] **Listar e aprovar**

```
curl -s http://localhost:3001/api/alix/confirmations | jq .
curl -s -X POST http://localhost:3001/api/alix/confirmations/CONF_ID/approve | jq .
curl -s http://localhost:3001/api/clientes | jq '.[].nome'
```

Deve aparecer "João da Silva".

- [ ] **Batch (2+ ações)**

```
curl -s -X POST http://localhost:3001/api/alix/chat \
  -H 'content-type: application/json' \
  -d '{"message":"cria cliente teste-batch cpf 99988877766 PF uf MG divida 200000, depois cria proposta pra ele com dívida 200000 estrategia Desenrola"}' \
  | jq -r '.data.reply'

curl -s http://localhost:3001/api/alix/confirmations/batches | jq .
```

Deve aparecer 1 batch com 2 pendings.

- [ ] **Aplicar batch**

```
curl -s -X POST http://localhost:3001/api/alix/confirmations/batch/BATCH_ID/apply | jq .
```

Deve retornar `applied: 2, failed: 0, skipped: 0`.

- [ ] **Commit**

```
git commit --allow-empty -m "chore(alix): F4 smoke OK — criar_cliente E2E + batch apply"
```

---

## Self-Review

- [ ] Tasks 1-2 cobrem F4 infra (batch + endpoints + SSE)
- [ ] Task 3 cobre 4 handlers HITL com executors
- [ ] Task 4 liga backends reais
- [ ] Task 5 expõe tools ao CRMWriterAgent
- [ ] Task 6 conecta BaseAgent capture + Orchestrator grouping
- [ ] Task 7 valida E2E single + batch
- [ ] Types consistentes: `ConfirmationBatch`, `BatchInputItem`, `PendingConfirmationWithDeps`, `StoreEvent`, `StoreListener`, `CrmWriteBackends`, `CrmWriterHandlers`
- [ ] Sem placeholders

## Escopo fora (Plano 3)

- `atualizar_dossie_dividas`, `criar_plano_custeio_oficial` (upgrade), `enviar_whatsapp_real`, `agendar_reuniao_real`, `anexar_documento_cliente`
- UI React `<AlixConfirmationBatch />` / `<SubagentIndicator />` — SSE stream já existe, frontend consome no Plano 3
- System prompts refinados + extended thinking ativado + telemetria JSONL + pipeline E2E golden test
