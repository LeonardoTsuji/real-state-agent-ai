# Corretor Copilot

Aplicação para organizar leads, imóveis, visitas e o relacionamento comercial. O frontend React segue os 27 protótipos de [design/](../frontend/design/), com NestJS, PostgreSQL e Redis no backend. O roadmap está em [plan.md](plan.md), as especificações em [specs/README.md](specs/README.md) e o mapa de telas e validações em [docs/prototype-matrix.md](docs/prototype-matrix.md).

## Demonstração completa

Com Node.js 24, pnpm e Docker disponíveis:

```bash
pnpm install
pnpm --dir ../frontend install
pnpm start:demo
```

Abra **http://127.0.0.1:5173**. O comando cria e migra somente o banco local `corretor_copilot_demo`, popula exemplos sem apagar registros existentes e inicia frontend, API e workers. A fila `copilot-demo-workflows` é separada da fila normal. Encerre os processos com `Ctrl+C`; os containers e dados persistem.

| Perfil                   | E-mail              | Senha local      |
| ------------------------ | ------------------- | ---------------- |
| Marina Costa — corretora | marina@copilot.demo | DemoCopilot2026! |
| Lucas Mendes — operador  | lucas@copilot.demo  | DemoCopilot2026! |

WhatsApp, calendário externo, assinatura, pagamento, check-in por localização e mídias são demonstrações identificadas na interface. O assistente usa `AI_PROVIDER=mock` nesse comando, sem chamadas pagas. Dossiês e PDFs exigem autenticação e pertencem ao corretor; não há link público. O token e o cache ficam em memória: recarregar a página exige login novamente.

Para desenvolver separadamente, execute `pnpm start:local` e `pnpm frontend:dev`. O Vite encaminha `/api` para a API na porta 3000. Swagger está disponível em `/api/docs`, e seu contrato JSON em `/api/docs-json`, somente fora de produção. Com a API iniciada, `pnpm api:types` atualiza o contrato versionado e os tipos TypeScript.

```bash
pnpm frontend:build
pnpm frontend:test
pnpm --dir ../frontend lint
pnpm --dir ../frontend test:e2e
```

Os testes de interface precisam da demonstração já iniciada e do Chrome instalado (ou outro canal em `E2E_BROWSER_CHANNEL`). Eles criam registros identificáveis e não limpam o banco de desenvolvimento.

## Requisitos

- Node.js 24
- pnpm 12
- Docker Compose v2

## Executar localmente

```bash
pnpm install
cp .env.example .env
openssl rand -base64 48
```

Copie o segredo gerado para `JWT_SECRET` no `.env` e execute:

```bash
pnpm start:local
```

Esse comando inicia PostgreSQL e Redis com volumes persistentes, aguarda os health checks, aplica migrations e inicia a API em modo watch. A API ficará em `http://localhost:3000/api`.

Para encerrar a API, pressione `Ctrl+C`. `docker compose down` para os containers e preserva os dados. `docker compose down -v` também apaga os volumes locais.

Os valores `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e `DATABASE_URL` precisam corresponder. O Compose usa credenciais locais de demonstração quando não há valores explícitos; troque-as antes de expor serviços fora da máquina local. `JWT_SECRET` precisa ter ao menos 32 caracteres e não possui valor padrão funcional.

## API

Todas as rotas usam o prefixo `/api`. Cadastro e login são públicos. Leads e imóveis exigem `Authorization: Bearer <accessToken>`. O proprietário é derivado da identidade autenticada.

### Papéis e acesso operacional

Cadastro público e usuários migrados recebem `BROKER`. O papel `OPERATOR` permite consultar jobs e métricas e executar replay de jobs de todo o sistema; as rotas normais continuam limitadas aos dados do próprio usuário. Papéis e permissões são definidos no código, com um papel por usuário.

Para conceder ou revogar acesso, um administrador executa no servidor, com `DATABASE_URL` apontando para o ambiente desejado (`.env` é usado como fallback):

```bash
pnpm auth:set-role -- <brokerId> OPERATOR
pnpm auth:set-role -- <brokerId> BROKER
```

O script valida UUID, papel e existência do corretor, atualiza `updatedAt` e informa ID e papéis anterior/novo. Não precisa de build. O backend consulta o papel atual em cada chamada; o mesmo JWT reflete imediatamente promoção ou revogação na próxima requisição. Cadastro/login preservam seus formatos e não aceitam campos de privilégio no cadastro. As rotas operacionais retornam `401` sem JWT válido e `403` sem permissão; basta o header `Authorization` de um operador, sem segredo compartilhado. Consulte o [procedimento de deploy e administração](docs/operations-runbook.md#acesso-operacional-por-rbac).

| Método   | Rota                                 | Descrição                                                |
| -------- | ------------------------------------ | -------------------------------------------------------- |
| `POST`   | `/auth/register`                     | Cadastra corretor; senha recebe hash Argon2id            |
| `POST`   | `/auth/login`                        | Emite token de acesso JWT                                |
| `POST`   | `/leads`                             | Cria lead com e-mail ou telefone                         |
| `GET`    | `/leads`                             | Lista leads paginados do corretor                        |
| `GET`    | `/leads/:id`                         | Consulta lead próprio                                    |
| `PATCH`  | `/leads/:id`                         | Atualiza parcialmente lead próprio                       |
| `DELETE` | `/leads/:id`                         | Exclui lead próprio logicamente                          |
| `GET`    | `/leads/funnel`                      | Conta leads por estágio                                  |
| `GET`    | `/leads/:id/preferences`             | Consulta preferências estruturadas                       |
| `PATCH`  | `/leads/:id/preferences`             | Cria ou atualiza preferências parcialmente               |
| `GET`    | `/leads/:id/matches`                 | Lista imóveis associados por cursor                      |
| `POST`   | `/leads/:id/matches`                 | Associa imóvel próprio com score e status                |
| `PATCH`  | `/leads/:leadId/matches/:propertyId` | Atualiza score/status                                    |
| `GET`    | `/leads/:id/interactions`            | Lista eventos por cursor e instante                      |
| `POST`   | `/leads/:id/interactions`            | Registra evento append-only                              |
| `PATCH`  | `/leads/:id/stage`                   | Transiciona para estágio permitido                       |
| `POST`   | `/properties`                        | Cadastra imóvel                                          |
| `GET`    | `/properties`                        | Lista imóveis com filtros e paginação                    |
| `GET`    | `/properties/:id`                    | Consulta imóvel próprio                                  |
| `PATCH`  | `/properties/:id`                    | Atualiza parcialmente imóvel próprio                     |
| `DELETE` | `/properties/:id`                    | Exclui imóvel próprio logicamente                        |
| `POST`   | `/visits`                            | Reserva visita sem conflito de horário                   |
| `GET`    | `/visits`                            | Lista visitas próprias por cursor                        |
| `GET`    | `/visits/:id`                        | Consulta visita própria                                  |
| `PATCH`  | `/visits/:id`                        | Remarca visita ainda agendada                            |
| `DELETE` | `/visits/:id`                        | Cancela visita e registra ator/instante                  |
| `POST`   | `/visits/:id/complete`               | Conclui visita                                           |
| `POST`   | `/follow-ups`                        | Agenda follow-up para lead próprio com chave idempotente |
| `PATCH`  | `/follow-ups/:id/complete`           | Conclui follow-up pendente                               |
| `PATCH`  | `/follow-ups/:id/cancel`             | Cancela follow-up e job pendente                         |
| `POST`   | `/imports/properties`                | Enfileira lote de imóveis com chave idempotente          |
| `GET`    | `/imports/properties/:id`            | Consulta relatório do lote próprio                       |
| `POST`   | `/leads/:id/messages`                | Enfileira mensagem simulada por conversa                 |
| `GET`    | `/leads/:id/messages`                | Consulta mensagens e estados                             |
| `POST`   | `/visits/:id/calendar-sync`          | Enfileira sincronização simulada do calendário           |
| `GET`    | `/visits/:id/calendar-event`         | Consulta evento de calendário simulado                   |
| `GET`    | `/operations/jobs`                   | Consulta jobs sem payload (papel OPERATOR)               |
| `GET`    | `/operations/jobs/:id`               | Consulta tentativas, retry e erro sanitizado             |
| `POST`   | `/operations/jobs/:id/replay`        | Reenvia job que falhou permanentemente                   |
| `GET`    | `/operations/metrics`                | Contagem, retries e latência média por estado/fila       |
| `POST`   | `/tasks`                             | Cria tarefa para lead próprio                            |
| `GET`    | `/tasks`                             | Lista tarefas por vencimento e cursor                    |
| `PATCH`  | `/tasks/:id/status`                  | Conclui ou cancela tarefa pendente                       |

Preço é inteiro em centavos de real. A busca aceita `purpose`, `type`, `city`, `neighborhood`, `minPriceCents`, `maxPriceCents`, `minBedrooms`, `minParkingSpaces`, `page` e `limit`. Exemplo:

```http
GET /api/properties?purpose=SALE&city=São%20Paulo&maxPriceCents=60000000&minBedrooms=2&page=1&limit=20
Authorization: Bearer <accessToken>
```

Leads e imóveis preservam a paginação legada `{ items, page, limit, total }`. Listas novas retornam `{ items, nextCursor }`; o cursor é vinculado ao corretor, lead e filtros usados. Erros seguem `{ statusCode, code, message, details? }`. Recursos fora do corretor autenticado retornam `404`.

Os horários de visitas, interações e tarefas exigem ISO 8601 em UTC (`Z`). O intervalo da visita inclui o início e exclui o fim, então visitas adjacentes são permitidas. Preferências são atualizadas parcialmente; campos omitidos ficam como estão e `null` limpa apenas campos numéricos opcionais ou observações.

Exemplos dos novos fluxos:

```bash
curl -X PATCH 'http://localhost:3000/api/leads/<leadId>/preferences' \
  -H 'Authorization: Bearer <accessToken>' -H 'Content-Type: application/json' \
  -d '{"purposes":["SALE"],"types":["APARTMENT"],"minPriceCents":30000000,"maxPriceCents":80000000,"neighborhoods":["Pinheiros"]}'

curl -X POST 'http://localhost:3000/api/leads/<leadId>/matches' \
  -H 'Authorization: Bearer <accessToken>' -H 'Content-Type: application/json' \
  -d '{"propertyId":"<propertyId>","score":87,"status":"SUGGESTED"}'

curl -X POST http://localhost:3000/api/visits \
  -H 'Authorization: Bearer <accessToken>' -H 'Content-Type: application/json' \
  -d '{"leadId":"<leadId>","propertyId":"<propertyId>","startAt":"2030-02-01T10:00:00.000Z","endAt":"2030-02-01T11:00:00.000Z"}'

curl -X POST 'http://localhost:3000/api/leads/<leadId>/interactions' \
  -H 'Authorization: Bearer <accessToken>' -H 'Content-Type: application/json' \
  -d '{"type":"CALL","occurredAt":"2030-01-30T14:00:00.000Z","summary":"Apresentou opções de imóvel","channel":"phone"}'

curl -X POST http://localhost:3000/api/tasks \
  -H 'Authorization: Bearer <accessToken>' -H 'Content-Type: application/json' \
  -d '{"leadId":"<leadId>","title":"Enviar opções","dueAt":"2030-01-31T12:00:00.000Z"}'
```

`PATCH /leads/:id/stage` recebe `{ "stage": "CONTACTED" }`. `PATCH /tasks/:id/status` recebe `COMPLETED` ou `CANCELED`; visitas são concluídas em `/visits/:id/complete` e canceladas com `DELETE /visits/:id`.

Envie `Idempotency-Key` ao criar visita e um campo `idempotencyKey` em follow-ups, lotes de importação e mensagens. Repetir a mesma chave retorna o recurso original. Cada gravação de job e evento de outbox acontece na transação PostgreSQL; o dispatcher publica no BullMQ com ID determinístico e tenta novamente quando Redis volta a responder. O estado operacional fica no PostgreSQL.

As integrações de calendário e mensageria são simuladas. Configure `SIMULATED_CALENDAR_MODE` e `SIMULATED_MESSAGING_MODE` com `success`, `timeout`, `transient_failure` ou `permanent_failure` para exercitar cenários. `QUEUE_MAX_ATTEMPTS`, `QUEUE_RETRY_DELAY_MS`, `QUEUE_JOB_TIMEOUT_MS`, `QUEUE_CONCURRENCY`, `QUEUE_RATE_MAX` e `QUEUE_RATE_DURATION_MS` controlam política de execução. Rotas operacionais exigem JWT de usuário no papel `OPERATOR`, com permissões `operations:read` para consultas e `operations:replay` para replay; o papel é consultado no banco em cada requisição e payloads de jobs não são retornados. O replay mantém a chave de idempotência original, então não duplica efeitos já registrados.

O importador recebe linhas JSON em `rows`, aceita até 1.000 por lote e exige `title`, `purpose`, `type`, `priceCents`, `city` e `neighborhood`; `bedrooms` e `parkingSpaces` são opcionais (padrão zero). `externalKey` identifica o imóvel na origem para que retries atualizem o mesmo registro. O relatório informa linhas lidas, aceitas, rejeitadas e razões de validação.

## Assistente conversacional

O assistente usa um único orquestrador com tools internas autorizadas pelo corretor autenticado. `AI_PROVIDER=mock` mantém o modo offline; para chamadas reais, configure `AI_PROVIDER=openai`, `OPENAI_API_KEY` e `OPENAI_MODEL`. A chave fica somente no backend. Iterações, chamadas de tool, tempo, tokens de saída e retenção podem ser ajustados com `AI_MAX_ITERATIONS`, `AI_MAX_TOOL_CALLS`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS` e `AI_MESSAGE_RETENTION_DAYS`.

Crie uma conversa vinculada a um lead, envie mensagens com chave de idempotência e consulte o histórico:

```bash
curl -X POST http://localhost:3000/api/conversations \
  -H 'Authorization: Bearer <accessToken>' -H 'Content-Type: application/json' \
  -d '{"leadId":"<leadId>"}'

curl -X POST http://localhost:3000/api/conversations/<conversationId>/messages \
  -H 'Authorization: Bearer <accessToken>' -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: atendimento-001' \
  -d '{"content":"Busco apartamento para alugar em Pinheiros até R$ 5.000"}'
```

`POST /api/ai/preferences/extract` retorna preferências no schema `v1`, com confiança e incertezas, sem executar busca. Agendamento retorna uma proposta; confirme em `POST /api/conversations/:id/proposals/:proposalId/decision` com `{ "confirmed": true }`. A proposta expira em 15 minutos e a criação da visita usa sua própria chave idempotente. Execuções de tools registram apenas ferramenta, duração, status e código, sem argumentos ou conteúdo da conversa.

As rotas HTTP têm limite de payload/tempo e rate limit por IP, corretor e rota. Conversas podem ser anonimizadas com `DELETE /api/conversations/:id/content`; leituras de mensagens e tentativas de acesso negado são auditadas. `GET /api/health/live` verifica o processo; `/api/health/ready` verifica PostgreSQL e Redis. `GET /api/operations/metrics/ai` (JWT de OPERATOR) retorna chamadas, tokens, latência e versões de modelo/prompt agregadas. `PROCESS_ROLE=api` desativa o worker no processo HTTP; `PROCESS_ROLE=worker` inicia o consumidor sem abrir porta HTTP. Consulte [threat model](docs/threat-model.md), [runbook operacional](docs/operations-runbook.md) e [arquitetura/demonstração](docs/architecture.md).

O dataset sintético versionado contém 100 cenários em `eval/cases.jsonl`. Valide cobertura com `pnpm eval:dataset`. Para pontuar um candidato, forneça `eval-results.jsonl` com as métricas descritas em `eval/run.py` e rode `pnpm eval:score -- --results eval-results.jsonl`; violações de autorização/confirmação bloqueiam o release e o relatório não contém prompts.

Cadastro, login e criação de lead:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Corretora","email":"ana@example.com","password":"uma-senha-local-segura"}'

curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ana@example.com","password":"uma-senha-local-segura"}'

curl -X POST http://localhost:3000/api/leads \
  -H 'Authorization: Bearer <accessToken>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Cliente exemplo","email":"cliente@example.com"}'
```

## Verificações

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

Para aplicar migrations existentes em um banco local já iniciado, execute `pnpm prisma:deploy`. Durante desenvolvimento de schema, `pnpm prisma:migrate` cria uma migration pelo Prisma.

Para testar a API manualmente no Postman, siga o [roteiro completo de fluxos](docs/postman-testing.md), incluindo autenticação, CRM, integrações, IA, segurança e concorrência na agenda.

Para entender a implementação, consulte a [arquitetura e mapa de arquivos](docs/architecture.md) e os [fluxos de negócio](docs/business-flows.md). Abra [docs/diagramas.html](docs/diagramas.html) no navegador para visualizar os diagramas offline ou salvar em PDF.

`pnpm test:e2e` sobe os serviços locais, aplica migrations e usa somente o banco local `corretor_copilot_test`. Antes de limpar dados de teste, o script exige que o host seja loopback e o nome do banco seja exatamente esse. Se as credenciais do Compose forem alteradas, defina `DATABASE_URL_TEST` para apontar ao banco local dedicado com o mesmo nome.

## Decisões atuais

- NestJS em TypeScript estrito com módulos, controllers finos, serviços e validação por DTO.
- PostgreSQL com Prisma 7.10, cliente ESM gerado em `src/generated/prisma` e adapter `pg`. A CLI lê `DATABASE_URL` via `prisma.config.ts`; `pnpm prisma:generate` gera o cliente e `pnpm prisma:migrate` cria migrations no banco de desenvolvimento.
- Redis/BullMQ transporta jobs; PostgreSQL mantém outbox, chave idempotente e estado consultável. A entrega é pelo menos uma vez, e cada adapter protege seus efeitos contra repetição.
- Remoção de leads e imóveis é lógica (`deleted_at`) para preservar associações, agenda, histórico e auditoria. As FKs históricas usam `RESTRICT`.
- A agenda usa uma constraint de exclusão GiST no PostgreSQL com intervalos `[início, fim)`; instalar migrations requer a extensão `btree_gist`.
- Consultas da etapa 2 usam cursores compostos e escopados. As rotas legadas de leads e imóveis mantêm `page/limit` por compatibilidade.
