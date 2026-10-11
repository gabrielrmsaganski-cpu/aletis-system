// ============================================================
// Alix Insano F4 — Tools HITL do CRMWriter
// Cada tool chama o handler do AlixService que cria pending
// confirmation e retorna confirmationId para o LLM surfacear.
// ============================================================

import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js';

const dividaDocumentalItemSchema = {
  type: 'object',
  description: 'Dívida/contrato identificado no documento ou enriquecimento CRM.',
  properties: {
    contrato: { type: 'string' },
    numeroContrato: { type: 'string' },
    credor: { type: 'string' },
    modalidade: { type: 'string' },
    valorOriginal: { type: ['string', 'number'], description: 'Principal contratado, em decimal canônico. Omitir se desconhecido; não copiar o saldo atual.' },
    valorAtualizado: { type: ['string', 'number'], description: 'Saldo devedor documentado, em decimal canônico. Zero é válido; omitir se desconhecido.' },
    vencimento: { type: 'string' },
    status: { type: 'string' },
    taxaContratadaAa: { type: 'number' },
    garantias: { type: 'array', items: { type: 'string' } },
    observacoes: { type: 'string' },
  },
};

const propriedadeRuralItemSchema = {
  type: 'object',
  description: 'Propriedade rural identificada no documento ou enriquecimento CRM.',
  properties: {
    nome: { type: 'string' },
    municipio: { type: 'string' },
    uf: { type: 'string' },
    areaHa: { type: 'number' },
    car: { type: 'string' },
    ccir: { type: 'string' },
    matricula: { type: 'string' },
    condicao: { type: 'string' },
    culturas: { type: 'array', items: { type: 'string' } },
  },
};

const evidenciaDocumentalItemSchema = {
  type: 'object',
  description: 'Evidência que lastreia um campo extraído do documento.',
  properties: {
    field: { type: 'string' },
    campo: { type: 'string' },
    trecho: { type: 'string' },
    fonte: { type: 'string' },
    pagina: { type: 'number' },
    confianca: { type: 'number' },
  },
};

export interface CrmWriterHandlers {
  handle_criar_cliente: (i: Record<string, unknown>) => unknown;
  handle_promover_lead_para_cliente: (i: Record<string, unknown>) => unknown;
  handle_criar_proposta_inteligente: (i: Record<string, unknown>) => unknown;
  handle_atualizar_proposta: (i: Record<string, unknown>) => unknown;
  handle_atualizar_dossie_dividas: (i: Record<string, unknown>) => unknown;
  handle_anexar_documento_cliente: (i: Record<string, unknown>) => unknown;
  handle_definir_proxima_acao_cliente: (i: Record<string, unknown>) => unknown;
  handle_registrar_contato_cliente: (i: Record<string, unknown>) => unknown;
  handle_alterar_estagio_cliente: (i: Record<string, unknown>) => unknown;
  /** Pipeline completo: cliente → proposta → vínculo de documento em uma única confirmação. */
  handle_onboarding_cliente_completo: (i: Record<string, unknown>) => unknown;
  /** Atualiza cliente existente com dados extraídos de documento (endereço, propriedades, dívidas). */
  handle_atualizar_cliente_completo: (i: Record<string, unknown>) => unknown;
  handle_criar_demanda_cliente: (i: Record<string, unknown>) => unknown;
  handle_atualizar_demanda_cliente: (i: Record<string, unknown>) => unknown;
  handle_registrar_atividade_demanda: (i: Record<string, unknown>) => unknown;
  handle_gerenciar_checklist_demanda: (i: Record<string, unknown>) => unknown;
}

export function buildCrmWriterTools(h: CrmWriterHandlers): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = [
    {
      name: 'criar_cliente',
      description: 'Cria novo cliente no CRM. ALTO IMPACTO — cria pending confirmation que requer aprovação humana antes de persistir.',
      input_schema: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          tipoPessoa: { type: 'string', enum: ['PF', 'PJ'] },
          cpfCnpj: { type: 'string', description: 'Opcional. Se existir, enviar só dígitos.' },
          cidade: { type: 'string' },
          uf: { type: 'string' },
          email: { type: 'string' },
          telefone: { type: 'string' },
          credor: { type: 'string' },
          valorTotalDivida: { type: 'number' },
          dividaTotal: { type: 'number' },
          consultor: { type: 'string' },
          escritorio: { type: 'string', enum: ['Aletis', 'Canarana'], description: 'Escolha humana obrigatoria. Nunca inferir a partir dos documentos.' },
          origem: { type: 'string' },
          observacoes: { type: 'string' },
          grupoFamiliar: {
            type: 'array',
            description: 'Pessoas vinculadas ao cliente. CPF/CNPJ é opcional.',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                parentesco: { type: 'string' },
                papel: { type: 'string' },
                cpfCnpj: { type: 'string' },
                telefone: { type: 'string' },
                email: { type: 'string' },
                observacoes: { type: 'string' },
              },
              required: ['nome'],
            },
          },
        },
        required: ['nome', 'escritorio'],
      },
    },
    {
      name: 'promover_lead_para_cliente',
      description: 'Promove lead da Prospecção para cliente, reaproveitando enriquecimento. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          cpfCnpj: { type: 'string' },
          escritorio: { type: 'string', enum: ['Aletis', 'Canarana'], description: 'Escritorio escolhido pelo usuario para receber o cliente.' },
        },
        required: ['cpfCnpj', 'escritorio'],
      },
    },
    {
      name: 'criar_proposta_inteligente',
      description: 'Cria proposta inteligente (15 seções) para cliente existente. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          dividaTotal: { type: 'number' },
          estrategia: { type: 'string' },
          bancos: { type: 'array', items: { type: 'string' } },
          observacao: { type: 'string' },
        },
        required: ['clienteId', 'dividaTotal'],
      },
    },
    {
      name: 'atualizar_proposta',
      description: 'Atualiza uma proposta do CRM após aprovação humana. Aceite cria negociação e rascunho contratual atomicamente. Termos aceitos são imutáveis.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          expectedRevision: { type: 'integer', minimum: 0 },
          titulo: { type: 'string' },
          credor: { type: 'string' },
          observacoes: { type: 'string' },
          status: { type: 'string', enum: ['rascunho', 'em_analise', 'enviada', 'aceita', 'rejeitada', 'expirada'] },
          valorDivida: { type: 'string', description: 'Decimal exato com ponto e duas casas, por exemplo 150000.25.' },
          valorProposta: { type: 'string', description: 'Decimal exato com ponto e duas casas.' },
          tipo: { type: 'string', enum: ['liquidacao', 'renegociacao', 'memoria_calculo', 'parcelamento', 'acordo_judicial'] },
          condicoes: { type: 'array', items: { type: 'string' } },
          dataValidade: { type: 'string', description: 'Data YYYY-MM-DD.' },
        },
        required: ['id'],
      },
    },
    {
      name: 'atualizar_dossie_dividas',
      description: 'Atualiza a estrutura de dívidas (bancárias, fornecedores, terras) do dossiê de um cliente existente. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          dividas: {
            type: 'object',
            description: 'Estrutura com bancarias[], fornecedores[], terras[], dataBase',
          },
        },
        required: ['clienteId', 'dividas'],
      },
    },
    {
      name: 'anexar_documento_cliente',
      description: 'Anexa um documento previamente enviado (documentoId da sessão Alix) ao cliente — registra na memória como nota na seção "documentos". ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          documentoId: { type: 'string', description: 'ID do documento retornado por listar_documentos_sessao' },
          titulo: { type: 'string' },
        },
        required: ['clienteId', 'documentoId'],
      },
    },
    {
      name: 'definir_proxima_acao_cliente',
      description: 'Define ou substitui a próxima ação operacional de um cliente no CRM. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          data: { type: 'string', description: 'Data ISO YYYY-MM-DD ou data/hora ISO' },
          descricao: { type: 'string' },
          prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'] },
          responsavel: { type: 'string' },
          motivo: { type: 'string' },
        },
        required: ['clienteId', 'data', 'descricao'],
      },
    },
    {
      name: 'registrar_contato_cliente',
      description: 'Registra contato, reunião ou tentativa de contato na timeline do cliente e opcionalmente agenda próxima ação. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          canal: { type: 'string', enum: ['telefone', 'whatsapp', 'email', 'reuniao', 'visita', 'outro'] },
          descricao: { type: 'string' },
          resultado: { type: 'string' },
          data: { type: 'string', description: 'Data ISO opcional' },
          responsavel: { type: 'string' },
          proximaAcao: {
            type: 'object',
            properties: {
              data: { type: 'string' },
              descricao: { type: 'string' },
              prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'] },
              responsavel: { type: 'string' },
            },
          },
        },
        required: ['clienteId', 'canal', 'descricao'],
      },
    },
    {
      name: 'alterar_estagio_cliente',
      description: 'Altera o estágio do cliente no funil CRM e registra justificativa na timeline. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          estagio: {
            type: 'string',
            enum: ['lead', 'prospeccao', 'qualificacao', 'analise', 'proposta', 'negociacao', 'acordo', 'acompanhamento', 'concluido', 'encerrado'],
          },
          motivo: { type: 'string' },
          responsavel: { type: 'string' },
          proximaAcao: {
            type: 'object',
            properties: {
              data: { type: 'string' },
              descricao: { type: 'string' },
              prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'] },
              responsavel: { type: 'string' },
            },
          },
        },
        required: ['clienteId', 'estagio'],
      },
    },
    {
      name: 'onboarding_cliente_completo',
      description: 'Onboarding documental: prepara cadastro e vínculo de documento, com proposta apenas quando houver saldo total positivo comprovado — TUDO EM UMA ÚNICA CONFIRMAÇÃO HITL. Use esta tool quando o Christian enviou um documento (PDF de proposta, contrato, etc.) e quer cadastrar a pessoa no sistema. NÃO use tools separadas (criar_cliente + criar_proposta_inteligente + anexar_documento) — use SEMPRE esta tool para evitar confirmações duplicadas.',
      input_schema: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome completo ou razão social do cliente' },
          cpfCnpj: { type: 'string', description: 'Opcional. Apenas dígitos quando identificado com segurança.' },
          tipoPessoa: { type: 'string', enum: ['PF', 'PJ'], description: 'Default: PF' },
          cidade: { type: 'string' },
          uf: { type: 'string', description: 'Sigla do estado (ex: RS, PR, SC)' },
          email: { type: 'string' },
          telefone: { type: 'string' },
          escritorio: { type: 'string', enum: ['Aletis', 'Canarana'], description: 'Escolha humana obrigatoria. Nunca extrair do documento.' },
          dividaTotal: { type: ['string', 'number'], description: 'Saldo total comprovado, em decimal canônico (ex.: 1200.50). Nunca usar principal ou subtotal parcial. Omitir quando desconhecido; zero é válido. Sem saldo positivo não será criada proposta.' },
          estrategia: { type: 'string', description: 'Descrição da estratégia de renegociação (ex: redução de 40%, alongamento 120m). Opcional.' },
          bancos: { type: 'array', items: { type: 'string' }, description: 'Lista de credores/bancos. Opcional.' },
          documentoId: { type: 'string', description: 'ID do documento na sessão Alix para vincular ao cliente. Se omitido, o sistema busca o último documento da sessão automaticamente.' },
          observacoes: { type: 'string', description: 'Notas livres para o cadastro.' },
          endereco: { type: 'object', description: 'Endereço completo extraído do documento.' },
          atividade: { type: 'string', description: 'Atividade econômica/rural extraída.' },
          areaTotalHa: { type: 'number', description: 'Área total em hectares.' },
          culturas: { type: 'array', items: { type: 'string' }, description: 'Culturas identificadas.' },
          carCodigoImovel: { type: 'string', description: 'Código CAR do imóvel principal.' },
          dividas: { type: 'array', items: dividaDocumentalItemSchema, description: 'Dívidas estruturadas extraídas do documento.' },
          propriedades: { type: 'array', items: propriedadeRuralItemSchema, description: 'Propriedades rurais extraídas do documento.' },
          grupoFamiliar: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                parentesco: { type: 'string' },
                papel: { type: 'string' },
                cpfCnpj: { type: 'string' },
                telefone: { type: 'string' },
                email: { type: 'string' },
                observacoes: { type: 'string' },
              },
              required: ['nome'],
            },
            description: 'Pessoas relacionadas ao documento/cliente. CPF/CNPJ é opcional.',
          },
          evidencias: { type: 'array', items: evidenciaDocumentalItemSchema, description: 'Evidências documentais dos campos extraídos.' },
          confiancaDocumento: { type: 'number', description: 'Confiança geral da extração documental.' },
        },
        required: ['nome', 'escritorio'],
      },
    },
    {
      name: 'atualizar_cliente_completo',
      description: 'Atualiza cliente EXISTENTE no CRM com dados extraídos de documento (endereço, propriedades rurais, dívidas, CAR, CCIR, culturas). ALTO IMPACTO — cria pending confirmation HITL. Use quando o cliente JÁ existe e o Christian enviou um documento com dados complementares (contrato, laudo, CPF, etc.).',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string', description: 'ID do cliente no CRM' },
          cpfCnpj: { type: 'string', description: 'CPF/CNPJ do cliente (apenas dígitos)' },
          cidade: { type: 'string' },
          uf: { type: 'string' },
          telefone: { type: 'string' },
          email: { type: 'string' },
          endereco: { type: 'object', description: 'Endereço completo extraído do documento' },
          atividade: { type: 'string' },
          areaTotalHa: { type: 'number' },
          culturas: { type: 'array', items: { type: 'string' } },
          carCodigoImovel: { type: 'string', description: 'Código CAR do imóvel principal' },
          dividas: { type: 'array', items: dividaDocumentalItemSchema, description: 'Novas dívidas a adicionar ao cliente' },
          propriedades: { type: 'array', items: propriedadeRuralItemSchema, description: 'Novas propriedades rurais a adicionar' },
          documentoId: { type: 'string', description: 'ID do documento na sessão Alix' },
          evidencias: { type: 'array', items: evidenciaDocumentalItemSchema, description: 'Evidências documentais' },
          confiancaDocumento: { type: 'number' },
          observacoes: { type: 'string' },
        },
        required: ['clienteId'],
      },
    },
    {
      name: 'criar_demanda_cliente',
      description: 'Cria uma nova frente de trabalho dentro de um cliente existente, separando assunto, propostas e documentos. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          titulo: { type: 'string' },
          assunto: { type: 'string' },
          descricao: { type: 'string' },
          categoria: { type: 'string', enum: ['credito', 'renegociacao', 'juridico', 'tributario', 'investimento', 'operacional', 'outro'] },
          status: { type: 'string', enum: ['nova', 'em_analise', 'em_proposta', 'negociacao', 'aprovada', 'concluida', 'suspensa', 'cancelada'] },
          prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'] },
          responsavel: { type: 'string' },
          credor: { type: 'string' },
          valorPretendido: { type: 'string', description: 'Valor decimal em reais, sem símbolo monetário' },
          prazoAlvo: { type: 'string', description: 'Data ISO YYYY-MM-DD' },
          proximaAcao: { type: 'string', description: 'Próximo movimento concreto do consultor' },
          proximaAcaoEm: { type: 'string', description: 'Data ISO YYYY-MM-DD da próxima ação' },
          probabilidade: { type: 'number', description: 'Probabilidade operacional de 0 a 100' },
          resultadoEsperado: { type: 'string' },
          documentoIds: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['clienteId', 'titulo'],
      },
    },
    {
      name: 'atualizar_demanda_cliente',
      description: 'Atualiza status, prioridade, responsável, prazo, valores ou documentos de uma demanda existente do cliente. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          demandaId: { type: 'string' },
          titulo: { type: 'string' },
          assunto: { type: 'string' },
          descricao: { type: 'string' },
          categoria: { type: 'string', enum: ['credito', 'renegociacao', 'juridico', 'tributario', 'investimento', 'operacional', 'outro'] },
          status: { type: 'string', enum: ['nova', 'em_analise', 'em_proposta', 'negociacao', 'aprovada', 'concluida', 'suspensa', 'cancelada'] },
          prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'] },
          responsavel: { type: 'string' },
          credor: { type: 'string' },
          valorPretendido: { type: 'string', description: 'Valor decimal em reais, sem símbolo monetário' },
          prazoAlvo: { type: 'string', description: 'Data ISO YYYY-MM-DD' },
          proximaAcao: { type: 'string', description: 'Próximo movimento concreto do consultor' },
          proximaAcaoEm: { type: 'string', description: 'Data ISO YYYY-MM-DD da próxima ação' },
          probabilidade: { type: 'number', description: 'Probabilidade operacional de 0 a 100' },
          resultadoEsperado: { type: 'string' },
          documentoIds: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['clienteId', 'demandaId'],
      },
    },
    {
      name: 'registrar_atividade_demanda',
      description: 'Registra na timeline de uma demanda uma nota, contato, tarefa, documento ou fato de proposta. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          demandaId: { type: 'string' },
          tipo: { type: 'string', enum: ['nota', 'contato', 'proposta', 'documento', 'tarefa'] },
          titulo: { type: 'string' },
          descricao: { type: 'string' },
          autor: { type: 'string' },
        },
        required: ['clienteId', 'demandaId', 'tipo', 'titulo'],
      },
    },
    {
      name: 'gerenciar_checklist_demanda',
      description: 'Adiciona, conclui, reabre ou remove uma pendência do checklist operacional de uma demanda. ALTO IMPACTO — HITL.',
      input_schema: {
        type: 'object',
        properties: {
          clienteId: { type: 'string' },
          demandaId: { type: 'string' },
          operacao: { type: 'string', enum: ['adicionar', 'concluir', 'reabrir', 'remover'] },
          itemId: { type: 'string', description: 'Obrigatório para concluir, reabrir ou remover' },
          titulo: { type: 'string', description: 'Obrigatório para adicionar' },
          responsavel: { type: 'string' },
          prazo: { type: 'string', description: 'Data ISO YYYY-MM-DD' },
        },
        required: ['clienteId', 'demandaId', 'operacao'],
      },
    },
  ];

  const registry: LLMToolRegistry = {
    criar_cliente: { spec: tools[0], handler: async (i) => h.handle_criar_cliente(i) },
    promover_lead_para_cliente: { spec: tools[1], handler: async (i) => h.handle_promover_lead_para_cliente(i) },
    criar_proposta_inteligente: { spec: tools[2], handler: async (i) => h.handle_criar_proposta_inteligente(i) },
    atualizar_proposta: { spec: tools[3], handler: async (i) => h.handle_atualizar_proposta(i) },
    atualizar_dossie_dividas: { spec: tools[4], handler: async (i) => h.handle_atualizar_dossie_dividas(i) },
    anexar_documento_cliente: { spec: tools[5], handler: async (i) => h.handle_anexar_documento_cliente(i) },
    definir_proxima_acao_cliente: { spec: tools[6], handler: async (i) => h.handle_definir_proxima_acao_cliente(i) },
    registrar_contato_cliente: { spec: tools[7], handler: async (i) => h.handle_registrar_contato_cliente(i) },
    alterar_estagio_cliente: { spec: tools[8], handler: async (i) => h.handle_alterar_estagio_cliente(i) },
    onboarding_cliente_completo: { spec: tools[9], handler: async (i) => h.handle_onboarding_cliente_completo(i) },
    atualizar_cliente_completo: { spec: tools[10], handler: async (i) => h.handle_atualizar_cliente_completo(i) },
    criar_demanda_cliente: { spec: tools[11], handler: async (i) => h.handle_criar_demanda_cliente(i) },
    atualizar_demanda_cliente: { spec: tools[12], handler: async (i) => h.handle_atualizar_demanda_cliente(i) },
    registrar_atividade_demanda: { spec: tools[13], handler: async (i) => h.handle_registrar_atividade_demanda(i) },
    gerenciar_checklist_demanda: { spec: tools[14], handler: async (i) => h.handle_gerenciar_checklist_demanda(i) },
  };

  return { tools, registry };
}
