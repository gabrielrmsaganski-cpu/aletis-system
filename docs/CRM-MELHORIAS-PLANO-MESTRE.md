# CRM ALETIS - Plano Mestre de Evolucao

## 1. Objetivo

Transformar o CRM em uma carteira unica, orientada a demandas e capaz de reduzir drasticamente o trabalho manual do consultor. O sistema deve receber muitos documentos, compreender o dossie, organizar as informacoes por cliente e demanda, manter propostas e negociacoes versionadas e sempre indicar a proxima acao confiavel.

Este plano cobre cadastro, carteira, cliente 360, demandas, propostas, negociacoes, documentos, ALIX, indicadores, dados e desempenho. Seguranca nao faz parte do escopo desta etapa, conforme direcionamento do projeto.

## 2. Diagnostico do modelo atual

### Capacidades que ja existem e devem ser preservadas

- Cadastro guiado em sete etapas, com leitura de arquivos e texto pela IA.
- Upload multiplo, classificacao documental, extracao de campos, conflitos e revisao.
- Cliente com dados pessoais, endereco, operacao rural, grupo familiar, credores e contexto financeiro.
- Demandas numeradas por cliente, com categoria, prioridade, probabilidade, proxima acao e resultado esperado.
- Propostas ligadas a demandas, com proposta principal e historico de negociacao.
- Documentos ligados a cliente, demanda e proposta.
- Saude financeira calculada por componentes, cobertura e confianca, sem nota fixa artificial.
- Priorizacao operacional e proxima melhor acao na carteira.
- ALIX com memoria, RAG, ferramentas de CRM, analise documental e acoes confirmaveis.
- Workspace do cliente com visao 360, documentos, demandas, propostas, negociacao e financeiro.

### Fragilidades estruturais identificadas

- O CRM estava exposto como duas ferramentas visuais, embora Canarana fosse apenas o mesmo CRM filtrado.
- `escritorio` era texto opcional; isso permitia clientes sem destino ou grafias diferentes para o mesmo local.
- O cadastro cria o cliente e depois tenta criar demandas e enviar anexos. Uma falha intermediaria pode deixar o onboarding parcialmente concluido.
- O identificador novo usa a quantidade atual de clientes, o que pode colidir depois de exclusoes ou bases concorrentes.
- A API e a interface ainda concentram responsabilidades demais: `CRM.tsx` tem mais de 2.700 linhas e a rota de clientes quase 2.900.
- A listagem carrega a carteira completa no navegador e filtra localmente; isso perde fluidez com crescimento real.
- Ha campos estruturais representados por texto livre: escritorio, consultor, tags, credor, modalidade e algumas classificacoes.
- Cliente, pessoa, grupo economico, propriedade, operacao rural e demanda ainda compartilham informacoes que deveriam ter ciclos de vida independentes.
- A timeline mistura fatos de naturezas diferentes sem uma taxonomia unica de eventos.
- Existem tipos repetidos de Cliente, Demanda e Proposta em varias telas, elevando o risco de divergencia.
- A saude financeira e correta quando ha cobertura, mas falta um programa operacional para completar os dados que alimentam os componentes.
- A IA extrai muitos dados, mas a procedencia e a confianca ainda nao acompanham cada campo durante todo o ciclo de vida.

## 3. Alteracoes entregues nesta etapa

- Remocao da ferramenta duplicada `CRM Canarana` da navegacao.
- CRM unico com todos os escritorios na mesma carteira.
- Redirecionamento da URL antiga para o CRM unico, mantendo o filtro `Canarana`.
- Filtro de escritorio persistido na URL e compativel com favoritos e retorno do navegador.
- Opcoes de Aletis - Matriz, Canarana e clientes legados sem escritorio.
- Escritorio exibido na lista mobile, tabela, kanban e exportacao CSV.
- Busca por cliente, cidade, UF, credor e escritorio.
- Metricas e alertas ALIX recalculados para a carteira de escritorio selecionada.
- Selecao obrigatoria de escritorio no topo do onboarding, na etapa de responsabilidade e na revisao final.
- Validacao de escritorio tanto na interface quanto na API.
- IA impedida de decidir ou sobrescrever automaticamente o escritorio responsavel.
- Comandos ALIX de criar cliente, promover lead e onboarding documental obrigados a perguntar Aletis ou Canarana antes da confirmacao.

## 4. Modelo operacional alvo

O fluxo ideal deve ser:

1. O consultor escolhe escritorio e responsavel.
2. Arrasta todos os arquivos de uma vez ou cola uma conversa/ficha.
3. O sistema classifica, remove duplicatas, faz OCR, separa pessoas, propriedades, dividas, propostas, garantias e demandas.
4. A ALIX apresenta um resumo executivo e somente as divergencias que exigem decisao humana.
5. O consultor confirma o cliente existente ou cria um novo relacionamento.
6. O sistema cria atomicamente cliente, pessoas vinculadas, propriedades, demandas, dividas, documentos e propostas.
7. Cada documento fica ligado ao assunto correto, mantendo fonte e confianca dos campos extraidos.
8. O CRM abre o cliente 360 com demandas ativas, proposta vigente, pendencias e proxima acao.
9. A ALIX monitora prazos, dados incompletos e mudancas relevantes e prepara a proxima tarefa.

## 5. Backlog completo de melhorias

### A. Carteira unica e escritorios

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| CRM-001 | Criar entidade `escritorio`, em vez de string | Cadastro padronizado e administravel | Clientes guardam `escritorioId` valido |
| CRM-002 | Migrar Aletis, Canarana e registros sem escritorio | Base historica coerente | 100% dos ativos possuem escritorio revisado |
| CRM-003 | Vincular consultores a um ou mais escritorios | Responsabilidade sem digitacao livre | Seletor mostra somente responsaveis validos |
| CRM-004 | Registrar historico de transferencia | Preservar contexto entre escritorios | Timeline mostra origem, destino, autor e data |
| CRM-005 | Permitir carteira consolidada e visoes por escritorio | Gestao central sem duplicar CRM | Mesma URL e mesmos componentes em todas as visoes |
| CRM-006 | Adicionar metas, SLA e configuracoes por escritorio | Operacao comparavel sem misturar regras | Indicadores usam configuracao do escritorio |
| CRM-007 | Criar fila de saneamento `Sem escritorio` | Corrigir legado sem esconder registros | Fila zerada e monitorada no dashboard |
| CRM-008 | Incluir escritorio em relatorios e exportacoes | Rastreabilidade operacional | Toda exportacao de cliente possui o campo |

### B. Onboarding e cadastro inteligente

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| CAD-001 | Salvar rascunho automaticamente | Nao perder trabalho em cadastros longos | Retorno restaura arquivos, etapa e campos |
| CAD-002 | Criar central de rascunhos | Retomar varios onboardings | Lista mostra autor, escritorio, progresso e idade |
| CAD-003 | Permitir upload em lotes ilimitados praticos | Receber dossies grandes | Processamento assincorno sem bloquear o modal |
| CAD-004 | Exibir fila por arquivo | Transparencia do processamento | Status: enviado, lendo, classificado, revisao, erro |
| CAD-005 | Identificar arquivos duplicados por hash | Evitar documentos repetidos | Sistema sugere ignorar, substituir ou versionar |
| CAD-006 | Aplicar OCR por pagina com qualidade medida | Extrair scans ruins com criterio | Paginas de baixa qualidade entram em revisao |
| CAD-007 | Classificar documentos compostos | Separar um PDF com varios tipos | Paginas formam documentos logicos independentes |
| CAD-008 | Mostrar fonte e confianca em cada campo | Revisao confiavel | Clique no campo abre arquivo e pagina de origem |
| CAD-009 | Comparar valores conflitantes lado a lado | Resolver divergencias rapidamente | Usuario escolhe valor e a decisao fica registrada |
| CAD-010 | Sugerir cliente existente por CPF/CNPJ e similaridade | Reduzir duplicidade | Sugestao mostra evidencias e permite vincular |
| CAD-011 | Diferenciar duplicidade de pessoa e novo relacionamento | Suportar novas demandas do mesmo cliente | Consultor adiciona demanda sem duplicar cliente |
| CAD-012 | Formularios dinamicos por PF/PJ | Pedir apenas o necessario | Campos e documentos mudam conforme tipo |
| CAD-013 | Checklist dinamico por tipo de demanda | Completar dossie certo | Pendencias variam por credito, juridico, tributario etc. |
| CAD-014 | Cadastro estruturado de varias dividas | Eliminar total sem composicao | Cada divida possui credor, contrato, saldo, taxa e vencimento |
| CAD-015 | Cadastro de varias propriedades e operacoes | Representar cliente rural real | Cliente pode ter N fazendas e N ciclos produtivos |
| CAD-016 | Pessoas vinculadas com papeis multiplos | Organizar socios, conjuges, avalistas e procuradores | Relacoes pesquisaveis e reutilizaveis |
| CAD-017 | Criacao de varias demandas no onboarding | Abrir frentes independentes desde o inicio | Cada assunto recebe numero, responsavel e proxima acao |
| CAD-018 | Preencher proposta detectada como rascunho revisavel | Aproveitar documentos recebidos | Proposta nasce ligada a demanda correta |
| CAD-019 | Resumo executivo antes da confirmacao | Conferencia em menos tempo | Revisao destaca somente campos criticos e ausentes |
| CAD-020 | Criacao atomica do dossie | Evitar cadastro pela metade | Falha reverte ou permite retomada idempotente |
| CAD-021 | Validacao brasileira de CPF, CNPJ, CEP, telefone e UF | Melhor qualidade na entrada | Erros objetivos antes da gravacao |
| CAD-022 | Normalizacao controlada de credores, culturas e modalidades | Filtros e relatorios confiaveis | Taxonomia unica com opcao de sugestao nova |
| CAD-023 | Consentir campos opcionais sem simular completude | Score honesto | Ausencia fica `nao informado`, nunca zero artificial |
| CAD-024 | Criar comprovante do onboarding | Auditoria operacional | Resumo registra entradas, decisoes e objetos criados |
| CAD-025 | Permitir onboarding por link/formulario externo | Cliente adianta dados | Respostas chegam como rascunho para revisao |
| CAD-026 | Medir tempo por etapa e taxa de correcao | Melhorar o fluxo com evidencias | Telemetria sem expor conteudo dos documentos |

### C. Modelo de cliente e relacionamento

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| MOD-001 | Separar Pessoa, Cliente e Relacionamento | Nao duplicar identidade a cada contrato | Pessoa pode ter varios relacionamentos/demandas |
| MOD-002 | Criar Grupo Economico/Familiar | Visao consolidada de exposicao | Pessoas e empresas ligadas aparecem em grafo simples |
| MOD-003 | Criar entidade Propriedade Rural | CAR, area e local independentes | Varias propriedades por cliente e demanda |
| MOD-004 | Criar entidade Operacao/Safra | Historico por ciclo produtivo | Cultura, area, custo e receita por safra |
| MOD-005 | Criar entidade Credor e contatos | Padronizacao de contraparte | Propostas e dividas apontam para credor cadastrado |
| MOD-006 | Identificadores UUID/ULID no servidor | Eliminar colisao de IDs | Criacoes paralelas nunca repetem identificador |
| MOD-007 | Tipos compartilhados gerados do contrato da API | Parar divergencia entre telas | Um schema origina API e TypeScript |
| MOD-008 | Dinheiro em centavos/decimal, sem `number` no dominio | Calculos consistentes | Nenhuma operacao monetaria usa ponto flutuante |
| MOD-009 | Datas com semantica explicita | Evitar aging incorreto | Data civil e timestamp usam tipos e fusos definidos |
| MOD-010 | Taxonomia unica de eventos | Timeline compreensivel | Contato, documento, proposta, tarefa e mudanca usam schema comum |
| MOD-011 | Proveniencia por campo | Saber de onde veio o dado | Campo guarda origem, documento, pagina e ultima confirmacao |
| MOD-012 | Estado de qualidade do cadastro | Priorizar saneamento | Completude, atualidade e conflitos aparecem separados |

### D. Demandas e multiplas frentes do cliente

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| DEM-001 | Tornar Demanda o centro operacional | Separar assuntos do mesmo cliente | Propostas, docs, tarefas e negociacao sempre possuem demanda |
| DEM-002 | Numeracao imutavel por cliente | Referencia simples | `Demanda #4` nunca muda depois de criada |
| DEM-003 | Cabecalho com objetivo, valor, prazo e resultado | Entendimento imediato | Visao fechada mostra os quatro elementos |
| DEM-004 | Status com transicoes e motivos | Pipeline confiavel | Fechamento/cancelamento exige resultado e justificativa |
| DEM-005 | Responsavel e equipe por demanda | Dividir trabalho sem confusao | Cliente pode ter responsaveis diferentes por assunto |
| DEM-006 | Proxima acao obrigatoria para demanda ativa | Nenhuma frente abandonada | Ativa sem acao entra em excecao operacional |
| DEM-007 | Checklist configuravel por categoria | Execucao repetivel | Modelos por credito, renegociacao, juridico e tributario |
| DEM-008 | SLA por etapa e prioridade | Alertas com regra clara | Prazo calculado e exibido antes de vencer |
| DEM-009 | Dependencias entre demandas | Representar ordem real | Demanda pode bloquear ou depender de outra |
| DEM-010 | Visao consolidada e individual | Cliente 360 sem misturar assuntos | Totais agregados e detalhe isolado conferem |
| DEM-011 | Duplicar demanda como modelo | Agilizar casos semelhantes | Copia estrutura sem copiar fatos historicos |
| DEM-012 | Encerramento com resultado estruturado | Aprendizado e relatorios | Motivo, valor realizado, prazo e aprendizado obrigatorios |

### E. Propostas e negociacoes

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| PRO-001 | Uma proposta principal por demanda | Remover ambiguidade | Regra garantida no banco e na API |
| PRO-002 | Versoes imutaveis de proposta | Comparar evolucao | Alteracao relevante cria versao, nao sobrescreve historico |
| PRO-003 | Comparador entre versoes | Facilitar decisao | Taxa, prazo, parcela, garantias e valor lado a lado |
| PRO-004 | Status operacional completo | Separar elaboracao de resultado | Rascunho, enviada, contraproposta, aprovada, recusada, expirada |
| PRO-005 | Data de validade e alerta de expiracao | Evitar proposta vencida | Alertas em 7, 3 e 1 dia configuraveis |
| PRO-006 | Registro estruturado de contraproposta | Historico negociavel | Condicoes recebidas viram nova versao comparavel |
| PRO-007 | Aprovacoes internas | Controlar prontidao | Proposta so pode ser enviada quando checklist concluir |
| PRO-008 | Motivo de perda/recusa | Melhorar estrategia | Taxonomia e observacao alimentam relatorio |
| PRO-009 | Documentos e mensagens por proposta | Dossie fechado | Anexo e contato aparecem na timeline correta |
| PRO-010 | Simulacao lado a lado | Apoiar consultoria | Cenarios preservam premissas e resultado financeiro |
| PRO-011 | Conversao em acordo/contrato | Continuidade sem redigitacao | Aprovacao gera objeto contratual referenciado |
| PRO-012 | Painel de negociacao por excecao | Foco diario | Expiradas, sem retorno e contrapropostas aparecem primeiro |

### F. Documentos e inteligencia documental

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| DOC-001 | Cofre unico com vinculacao multipla | Um arquivo sem copias espalhadas | Documento liga cliente, demanda, proposta, divida e propriedade |
| DOC-002 | Versionamento e documento substituto | Preservar historico | Nova versao aponta para anterior e vigencia |
| DOC-003 | Matriz de documentos exigidos | Mostrar faltas reais | Checklist considera categoria e fase da demanda |
| DOC-004 | Pesquisa semantica por cliente e demanda | Encontrar fatos rapidamente | Resultado cita arquivo, pagina e trecho |
| DOC-005 | Tabelas extraidas editaveis | Aproveitar extratos e planilhas | Usuario corrige celula mantendo original e autoria |
| DOC-006 | Deteccao de validade | Alertar certidoes vencendo | Tipo documental define vigencia e renovacao |
| DOC-007 | Relacionamento automatico com entidades | Organizar sem trabalho manual | Sugestao traz justificativa e confianca |
| DOC-008 | Fila de revisao humana | Concentrar excecoes da IA | Somente baixa confianca/conflitos entram na fila |
| DOC-009 | Reprocessamento seletivo | Corrigir sem reler tudo | Arquivo, pagina ou extrator podem ser reexecutados |
| DOC-010 | Geracao de dossie exportavel | Entrega profissional | PDF/ZIP possui indice, versoes e anexos escolhidos |
| DOC-011 | Indicadores de qualidade de leitura | Evitar uso indevido | OCR, classificacao e extracao possuem confiancas separadas |
| DOC-012 | Retencao da evidencia original | Conferencia permanente | Valor derivado nunca substitui o arquivo-fonte |

### G. ALIX no CRM

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| IA-001 | Contexto sempre limitado ao cliente/demanda ativa | Respostas precisas | Cabecalho informa escopo e fontes usadas |
| IA-002 | Respostas com citacao interna | Confianca operacional | Fato documental abre arquivo e pagina |
| IA-003 | Plano de extracao por tipo documental | Melhor cobertura | Cada classe possui schema, validacoes e fallback |
| IA-004 | Confianca calibrada por campo | Revisao eficiente | Baixa confianca nunca e aplicada silenciosamente |
| IA-005 | Resolucao assistida de conflitos | Menos comparacao manual | ALIX explica divergencia sem decidir escritorio/responsavel |
| IA-006 | Comandos orientados a demanda | Acoes no contexto correto | Criar tarefa/proposta/documento exige demanda alvo |
| IA-007 | Resumo diario da carteira | Priorizar o consultor | Lista atrasos, expiracoes, dados faltantes e oportunidades |
| IA-008 | Resumo de cliente antes de reuniao | Preparacao rapida | Sintese inclui fatos, pendencias, proposta vigente e perguntas |
| IA-009 | Sugestao de proxima acao explicavel | Ajudar sem automatismo opaco | Recomendacao mostra regra e evidencias |
| IA-010 | Preparacao de contato | Acelerar WhatsApp/e-mail/ligacao | Rascunho usa tom e fatos do relacionamento |
| IA-011 | Comparacao de propostas | Mostrar ganho e risco | Analise quantitativa cita versoes e premissas |
| IA-012 | Deteccao de novos assuntos no dossie | Nao misturar demandas | IA sugere criar/vincular demanda, com confirmacao |
| IA-013 | Memoria com fatos versionados | Evitar informacao velha | Fato possui vigencia, origem e substituicao |
| IA-014 | Feedback de correcao por extrator | Melhorar continuamente | Correcoes viram metrica e conjunto de avaliacao |
| IA-015 | Avaliacoes automatizadas | Controlar qualidade antes de publicar | Dataset cobre extracao, citacao, conflito e comandos |
| IA-016 | Politica de modelos OpenAI por tarefa | Custo e qualidade previsiveis | Classificacao, extracao e chat usam perfis configurados |
| IA-017 | Processamento em background com retomada | Suportar lotes grandes | Job continua apos fechar modal e pode ser retomado |
| IA-018 | Estado de indisponibilidade claro | Nao fingir resposta inteligente | Interface diferencia IA, heuristica e falha |

### H. Experiencia da carteira e cliente 360

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| UX-001 | Filtros avancados combinaveis | Localizar qualquer segmento | Escritorio, consultor, etapa, demanda, risco, valor e prazo |
| UX-002 | Visoes salvas pessoais e da equipe | Repetir rotinas em um clique | Filtros, colunas e ordenacao persistem |
| UX-003 | Colunas configuraveis | Adequar lista ao trabalho | Usuario escolhe campos sem quebrar mobile |
| UX-004 | Acoes em lote | Tratar filas rapidamente | Atribuir, etiquetar, exportar e criar tarefa em selecao |
| UX-005 | Pre-visualizacao lateral | Reduzir abre-fecha | Cliente abre resumo sem perder filtros e scroll |
| UX-006 | Kanban com regras e WIP | Evitar movimentacao inconsistente | Transicao valida campos e registra motivo |
| UX-007 | Indicadores clicaveis | Transformar numero em lista de acao | Cada KPI aplica filtro correspondente |
| UX-008 | Cabecalho 360 consistente | Entender cliente em segundos | Escritorio, responsavel, demandas, risco e acao sempre visiveis |
| UX-009 | Navegacao centrada em demanda | Nao misturar a quarta proposta com a primeira | Seletor de demanda controla documentos/propostas/negociacao |
| UX-010 | Timeline filtravel | Reduzir ruido | Filtros por demanda e tipo de evento |
| UX-011 | Atalhos operacionais claros | Menos cliques | Nova acao, contato, documento, demanda e proposta no cabecalho |
| UX-012 | Estados vazios acionaveis | Orientar sem texto promocional | Ausencia oferece o comando correto no contexto |
| UX-013 | Layout responsivo validado | Uso real em notebook e celular | Sem sobreposicao, scroll perdido ou controles cortados |
| UX-014 | Acessibilidade de teclado e foco | Fluxo mais rapido | Modal completo operavel por teclado e foco preservado |

### I. Saude financeira e indicadores

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| FIN-001 | Exibir cobertura ao lado da nota | Nao tratar score parcial como definitivo | Toda nota mostra percentual e confianca |
| FIN-002 | Mostrar componentes ausentes | Indicar como melhorar a leitura | CTA abre o cadastro/fonte do indicador faltante |
| FIN-003 | Recalcular ao alterar fonte financeira | Nota sempre atual | Evento de divida, safra ou fluxo dispara calculo |
| FIN-004 | Registrar versao e data do calculo | Comparacao historica | Serie mostra score, cobertura e metodologia |
| FIN-005 | Diferenciar sem dados de score 50 | Eliminar falsa neutralidade | Sem cobertura aparece `Indisponivel`, nunca 50/100 |
| FIN-006 | Exposicao consolidada por grupo | Ver risco real | Dividas e garantias agregam pessoas/empresas relacionadas |
| FIN-007 | Cenários de safra e sensibilidade | Avaliar capacidade futura | Score distingue realizado, base e estresse |
| FIN-008 | Alertas por mudanca relevante | Agir sobre deterioracao | Queda de score gera evento e recomendacao |
| FIN-009 | Explicar peso e formula | Evitar nota caixa-preta | Painel mostra entrada, regra, peso e contribuicao |
| FIN-010 | Validar consistencia financeira | Evitar totais contraditorios | Soma das dividas e pagamentos reconcilia com resumo |

### J. Dashboard e gestao

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| KPI-001 | Definir dicionario oficial de metricas | Uma interpretacao por numero | Nome, formula, fonte, janela e responsavel documentados |
| KPI-002 | Dashboard filtrado por escritorio/consultor | Visao gerencial coerente | Todos os cards usam o mesmo escopo ativo |
| KPI-003 | Fila `Precisa de atencao hoje` | Primeira pagina acionavel | Itens atrasados, expirando e sem acao priorizados |
| KPI-004 | Funil por demanda, nao apenas cliente | Medir trabalho real | Cliente com quatro demandas conta quatro oportunidades |
| KPI-005 | Aging e SLA por etapa | Identificar gargalos | Distribuicao e lista de excedentes clicaveis |
| KPI-006 | Conversao por categoria, credor e escritorio | Melhorar estrategia | Filtros preservam amostra e periodo |
| KPI-007 | Valor de pipeline sem dupla contagem | Numero financeiro veridico | Usa apenas proposta principal vigente por demanda |
| KPI-008 | Qualidade da base | Saneamento continuo | Sem escritorio, sem acao, sem documento e baixa cobertura |
| KPI-009 | Produtividade operacional | Medir velocidade | Tempo de onboarding, resposta, proposta e fechamento |
| KPI-010 | Resultado de propostas | Aprender perdas e ganhos | Aceitas, recusadas, expiradas, valor e motivo |
| KPI-011 | Alertas com acesso direto | Sair do painel para a acao | Clique abre cliente/demanda exata |
| KPI-012 | Atualizacao e origem visiveis | Evitar dado aparentemente atual | Cada bloco informa ultima atualizacao e fonte |

### K. Desempenho, confiabilidade e manutencao

| ID | Melhoria | Resultado esperado | Criterio de aceite |
|---|---|---|---|
| TEC-001 | Endpoint paginado de resumo da carteira | Carregar apenas o necessario | Filtros e ordenacao executam no servidor |
| TEC-002 | Cache de consultas e revalidacao seletiva | Interface instantanea | Mutacao invalida apenas recursos relacionados |
| TEC-003 | Virtualizacao de lista/kanban | Manter fluidez em bases grandes | Milhares de registros sem travamento perceptivel |
| TEC-004 | Dividir `CRM.tsx` por dominio | Facilitar evolucao e teste | Pagina orquestra componentes menores e hooks |
| TEC-005 | Dividir rota de clientes em servicos | Isolar persistencia e regras | Handler HTTP nao concentra calculo, IA e storage |
| TEC-006 | Repositorio unico para cliente | Eliminar divergencia memoria/Postgres | Leitura e escrita possuem fonte canonica definida |
| TEC-007 | Transacao de onboarding | Consistencia entre modulos | Cliente, demandas e ligacoes confirmam juntos |
| TEC-008 | Idempotencia em criacoes e uploads | Retentativa sem duplicacao | Mesmo token retorna o mesmo resultado |
| TEC-009 | Fila persistente para OCR/IA/enriquecimento | Resiliencia | Jobs possuem tentativa, erro e retomada |
| TEC-010 | Contratos de API validados por schema | Menos erro em runtime | Request e response gerados/testados pelo mesmo schema |
| TEC-011 | Testes de jornada completa | Proteger fluxo principal | Cadastro, varias demandas, proposta e documentos em E2E |
| TEC-012 | Testes visuais desktop/mobile | Evitar regressao de modal e scroll | Screenshots nos viewports definidos |
| TEC-013 | Metricas de latencia e falha por etapa | Diagnostico rapido | Painel mostra API, upload, OCR, extracao e persistencia |
| TEC-014 | Indices para escritorio, responsavel, etapa e prazo | Consulta previsivel | Planos de consulta sem varredura integral |
| TEC-015 | Migracoes de dados repetiveis e verificadas | Evoluir sem corromper legado | Dry-run, contagem antes/depois e rollback logico |
| TEC-016 | Feature flags para mudancas grandes | Liberacao controlada | Novo fluxo pode ser ativado por escritorio |

## 6. Ordem recomendada de execucao

### Fase 0 - Unificacao imediata

Status: implementada nesta entrega.

- CRM unico, rota antiga redirecionada, escritorio obrigatorio e filtro consolidado.
- Identificacao de registros legados sem escritorio.
- Validacao funcional e visual do cadastro e carteira.

### Fase 1 - Fundacao operacional

Prazo recomendado: 2 a 3 ciclos de entrega.

- Criar entidades de escritorio e consultor.
- Migrar e sanear os escritorios da base.
- Trocar IDs sequenciais por UUID/ULID.
- Implementar onboarding transacional e idempotente.
- Criar rascunhos persistentes e jobs de processamento.
- Padronizar contratos de API e tipos compartilhados.

### Fase 2 - Demanda como centro do CRM

Prazo recomendado: 2 a 4 ciclos de entrega.

- Tornar demanda obrigatoria para proposta, negociacao e documentos operacionais.
- Criar seletor global de demanda no cliente 360.
- Finalizar versoes, proposta principal, expiracao e contraproposta.
- Criar tarefas, SLA, checklist e encerramento estruturado por demanda.

### Fase 3 - Onboarding documental avancado

Prazo recomendado: 3 a 5 ciclos de entrega.

- Hash, separacao de PDF composto, OCR por pagina e processamento persistente.
- Procedencia e confianca por campo.
- Fila de conflitos e baixa confianca.
- Criacao automatica revisavel de pessoas, propriedades, dividas, demandas e propostas.

### Fase 4 - Inteligencia operacional ALIX

Prazo recomendado: 2 a 4 ciclos de entrega.

- Citacoes internas, escopo por demanda e memoria versionada.
- Briefing de carteira e cliente, comparador de propostas e proxima acao explicavel.
- Avaliacoes automaticas e feedback por extrator.

### Fase 5 - Escala, dashboard e otimizacao

Prazo recomendado: continuo.

- Paginacao, filtros no servidor, cache, virtualizacao e indices.
- Dicionario de KPIs, dashboard por demanda e indicadores de qualidade.
- Testes E2E/visuais e telemetria de tempo e falhas.

## 7. Metricas de sucesso

| Metrica | Definicao | Meta inicial |
|---|---|---|
| Tempo mediano de onboarding | Abertura ate cliente pronto | Menor que 8 minutos |
| Aproveitamento automatico | Campos aceitos sem redigitacao / campos preenchidos | Maior que 80% |
| Correcao pos-cadastro | Cadastros alterados por erro em 7 dias | Menor que 5% |
| Organizacao documental | Arquivos ligados a tipo e demanda | Maior que 95% |
| Demandas com proxima acao | Demandas ativas com acao futura | Maior que 95% |
| Propostas sem ambiguidade | Demandas com no maximo uma principal | 100% |
| Clientes com escritorio | Clientes ativos com escritorio valido | 100% |
| Cobertura da saude financeira | Clientes ativos com cobertura acima de 70% | Maior que 85% |
| Latencia da carteira | Tempo ate lista utilizavel | Menor que 1,5 segundo |
| Sucesso de processamento | Arquivos processados sem intervencao tecnica | Maior que 98% |

## 8. Criterio de CRM realmente concluido

O CRM nao deve ser considerado completo apenas por ter mais campos ou telas. A versao alvo esta concluida quando um consultor consegue receber um dossie grande, identificar ou criar o relacionamento correto, separar quatro ou mais demandas, revisar as informacoes importantes, criar propostas vinculadas e sair do fluxo com toda demanda ativa possuindo responsavel, documentos, status e proxima acao. O dashboard deve refletir exatamente esses mesmos objetos, sem dupla contagem e sem notas artificiais para dados ausentes.
