# Regressões PostgreSQL do fechamento de propostas

A suíte usa PostgreSQL 16 real em uma fixture descartável. Não carrega `.env`, não consulta o banco da aplicação e substitui o serviço N8n por um mock. Cada execução cria um schema aleatório e o remove ao terminar.

Inicie somente o container de teste:

```bash
docker run -d --name aletis-closure-pg-fixture \
  --memory 256m --cpus 1 \
  -p 127.0.0.1:55436:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=aletis-fixture-only \
  -e POSTGRES_DB=aletis_implementation_fixture \
  postgres:16-alpine
```

Na pasta `apps/api`, execute:

```bash
pnpm exec vitest run --config vitest.proposal-workflow-pg.config.ts --configLoader runner
```

O guard exige exatamente a URL local configurada. As tabelas são criadas a partir das migrações reais necessárias ao domínio, incluindo a revisão da proposta e os índices únicos de contrato/negociação. A execução normal de outras suítes não habilita estes testes.

A cobertura verifica atomicidade por falhas em cada tabela e no COMMIT, concorrência entre instâncias, retomada após reinício, vínculos conflitantes, valores decimais, imutabilidade do aceite, exclusão protegida e consumo dos recibos internos de automação. Também verifica persistência antes de dispatch, conteúdo autoritativo e uma única chamada externa simulada em execuções concorrentes.

Três casos registram o plugin Fastify de propostas e percorrem as rotas PATCH/DELETE até o PostgreSQL real. Bloqueios advisory permitem verificar o cache enquanto a transação aguarda; triggers diferidas comprovam a resposta HTTP 503 e a preservação do cache quando o COMMIT falha. PDF, leitura de documentos, LLM e memória ALIX são simulados nesses testes; o coordenador, os repositórios e as gravações PostgreSQL permanecem reais.

Quando a fixture não for mais necessária:

```bash
docker stop aletis-closure-pg-fixture
```
