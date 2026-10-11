# Google Workspace no ALETIS

Esta integração prepara o ALETIS para usar Google Workspace como extensão segura do CRM: Drive por cliente, Google Docs gerados pelo sistema, Calendar para reuniões e Gmail para envio explícito de e-mails.

## Arquitetura

```text
Painel ALETIS
  -> Backend Fastify /api/integrations/google/*
  -> OAuth2 por usuário ou credencial corporativa do Google Cloud SDK
  -> Tokens criptografados no banco ou token corporativo mantido no servidor
  -> Drive / Docs / Calendar / Gmail
  -> CRM, timeline e auditoria ALETIS
```

O navegador nunca recebe `client_secret`, access token ou refresh token.

## Variáveis

```env
GOOGLE_WORKSPACE_ENABLED=true
GOOGLE_DRIVE_SYNC_ENABLED=true
GOOGLE_DRIVE_GCLOUD_ACCOUNT=
GOOGLE_DRIVE_SHARED_DRIVE_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://SEU_DOMINIO/api/integrations/google/callback
GOOGLE_OAUTH_FRONTEND_URL=https://SEU_DOMINIO
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_DRIVE_ROOT_FOLDER_ID=
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=America/Cuiaba
GOOGLE_CALENDAR_CREATE_MEET=true
```

`GOOGLE_TOKEN_ENCRYPTION_KEY` deve ser uma chave longa e secreta. O backend deriva uma chave AES-256-GCM a partir dela para criptografar tokens antes de gravar no banco.

## Drive corporativo gerenciado

Quando o ALETIS usa uma única conta corporativa no servidor, configure `GOOGLE_DRIVE_GCLOUD_ACCOUNT` com a conta autorizada pelo Google Cloud SDK, `GOOGLE_DRIVE_SHARED_DRIVE_ID` com o Drive compartilhado de clientes e `GOOGLE_DRIVE_ROOT_FOLDER_ID` com sua raiz. Nesse modo, o sistema usa a credencial corporativa para Drive e Google Docs, sem expor token ao navegador.

O servidor deve ter sido autorizado uma única vez com o escopo do Drive, por exemplo:

```bash
gcloud auth login CONTA_CORPORATIVA --enable-gdrive-access
```

A raiz corporativa é examinada antes de qualquer criação. Pastas existentes no padrão `GRUPO <NOME>` e variações já usadas no acervo são vinculadas ao CRM sem renomear, mover ou recriar conteúdo. Quando não há uma correspondência confiável, o novo padrão é `GRUPO <NOME DO CLIENTE>`.

Com `GOOGLE_DRIVE_SYNC_ENABLED=true`, cada upload do dossiê, da Central Inteligente, de propostas e de anexos ALIX vinculados ao cliente é mantido no cofre documental, enviado ao Drive vinculado e indexado pela ALIX no mesmo fluxo. O metadado do documento guarda o link, o destino e qualquer falha de sincronização para nova tentativa.

## Configuração Manual no Google Cloud

1. Criar um projeto no Google Cloud Console.
2. Ativar as APIs:
   - Google Drive API
   - Google Docs API
   - Google Calendar API
   - Gmail API
3. Configurar a tela de consentimento OAuth.
4. Criar um OAuth Client ID do tipo `Web application`.
5. Adicionar o redirect URI do backend:

```text
https://SEU_DOMINIO/api/integrations/google/callback
```

6. Copiar `Client ID` e `Client Secret` para o `.env`.
7. Reiniciar a API.
8. Abrir `Configurações > Google Workspace` no ALETIS e clicar em `Conectar Google Workspace`.

## Escopos Usados

Escopos solicitados na conexão inicial:

- `openid`
- `userinfo.email`
- `drive.file`

A conexão inicial é limitada ao Google Drive: o ALETIS pode criar e gerenciar somente os arquivos e pastas que ele mesmo criar ou que forem escolhidos explicitamente no Drive. Gmail, Agenda e Google Docs permanecem sem acesso até uma ampliação deliberada dos escopos.

## Rotas

OAuth e status:

- `GET /api/integrations/google/status`
- `GET /api/integrations/google/auth-url`
- `GET /api/integrations/google/callback`
- `POST /api/integrations/google/disconnect`
- `GET /api/integrations/google/audit-logs`

Cliente:

- `GET /api/clientes/:id/google-workspace`
- `POST /api/integrations/google/drive/create-client-folder`
- `POST /api/integrations/google/drive/upload-client-file`
- `GET /api/integrations/google/drive/client/:id/files`
- `POST /api/integrations/google/drive/client/:id/import`
- `POST /api/integrations/google/docs/create-from-template`
- `POST /api/integrations/google/calendar/create-event`
- `POST /api/integrations/google/calendar/cancel-event`
- `POST /api/integrations/google/gmail/send`

## Banco de Dados

Migração criada:

- `apps/api/src/db/migrations/0023_google_workspace.sql`

Tabelas:

- `google_workspace_connection`
- `google_workspace_audit_log`
- `client_google_drive_folder`
- `google_document`
- `google_calendar_event`
- `google_email_log`

## Fluxo por Cliente

Na aba do cliente, em `Arquivos e Processo > Integrações Google`, o consultor pode:

1. Criar a pasta do cliente no Drive.
2. Criar subpastas padrão: Documentos, Propostas, Contratos, Relatórios, Anexos e Comprovantes.
3. Enviar arquivos do ALETIS para o Drive.
4. Ver o inventário recursivo do acervo já existente na pasta e subpastas.
5. Selecionar até 20 arquivos existentes para a ALIX importar, ler e indexar no cofre do cliente.
6. Gerar Google Docs dentro da pasta do cliente; os documentos permanecem nativos e editáveis no Google Docs.
7. Criar eventos no Google Calendar.
8. Enviar e-mail pelo Gmail com ação explícita.

A importação valida pertencimento à pasta do cliente, tipo de arquivo e limite de 20 MB antes de entregar conteúdo à ALIX. Cada ação relevante gera auditoria e evento na timeline do cliente.

## Segurança

- Tokens criptografados com AES-256-GCM.
- Tokens e secrets não aparecem no frontend.
- Logs do Fastify já redigem campos sensíveis.
- OAuth `state` assinado e com expiração curta.
- RBAC por cliente é validado nas ações vinculadas ao CRM.
- Em modo `ALETIS_RBAC_STRICT=true`, conectar/desconectar Workspace exige Admin Master.
- Gmail não envia nada automaticamente.
- IA fica preparada para sugerir textos e ações, mas não move, renomeia ou exclui conteúdo do Google Drive.
- O único fluxo automático é o arquivamento de um documento já enviado pelo usuário ao CRM quando `GOOGLE_DRIVE_SYNC_ENABLED=true` estiver habilitado.

## Como Testar

Sem credenciais Google:

```bash
pnpm --filter @aletis/api test -- tests/api/google-workspace.test.ts
pnpm --filter @aletis/api typecheck
pnpm --filter @aletis/web typecheck
```

Com credenciais:

1. Preencher `.env`.
2. Rodar migrations.
3. Subir API e web.
4. Abrir `Configurações > Google Workspace`.
5. Clicar em `Conectar Google Workspace`.
6. Abrir um cliente em `Arquivos e Processo > Integrações Google`.
7. Clicar em `Criar pasta`.
8. Conferir link do Drive e auditoria.

## Limitações Atuais

- No modo corporativo, Drive e Google Docs ficam disponíveis; Calendar e Gmail permanecem deliberadamente desativados.
- A ALIX importa e analisa arquivos suportados, mas não altera automaticamente documentos existentes no Drive. Google Docs criados pelo ALETIS podem ser editados diretamente no editor nativo do Google.
- A conexão corporativa depende da autorização local do Google Cloud SDK. Se ela for revogada, o painel informa que uma nova autorização é necessária.
