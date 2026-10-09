# Runbook de produção

## Topologia e deploy

A API e os workers usam a mesma imagem e o mesmo schema. Execute três processos lógicos: API com `PROCESS_ROLE=api`, worker com `PROCESS_ROLE=worker`, e migração como job único. `PROCESS_ROLE=all` é conveniente para desenvolvimento local. O processo worker inicializa os módulos Nest sem abrir porta HTTP. Configure health check do balanceador em `/api/health/live` e use `/api/health/ready` para remover instância quando PostgreSQL ou Redis estiverem indisponíveis.

1. Gere/valide a imagem e rode `pnpm lint`, `pnpm build`, `pnpm test --runInBand`, `pnpm prisma validate` e `pnpm eval:dataset`. Pontue o candidato com `pnpm eval:score -- --results eval-results.jsonl` e bloqueie a publicação se o relatório marcar `releaseBlocked`.
2. Faça backup do PostgreSQL e confirme espaço/retention antes da migration.
3. Rode `pnpm prisma:deploy` como job único, com a mesma versão de código. As migrations são aditivas; mantenha API e workers compatíveis durante rollout.
4. Atualize primeiro workers, depois API. Verifique `/api/health/ready`, fila sem jobs atrasados, falhas de integração e relatório de avaliação do candidato.
5. Acompanhe logs JSON por `correlationId`; alertas iniciais: readiness indisponível por 1 minuto, falhas permanentes de job, fila WAITING atrasada > 5 minutos, taxa de 5xx > 2% por 5 minutos, latência p95 > 2 segundos e quota/erros do provedor de LLM.

As credenciais ficam no secret manager do ambiente. Gere `JWT_SECRET` com entropia alta, aplique acesso mínimo à role PostgreSQL e Redis, e nunca injete secrets em imagem, logs ou arquivos de avaliação. Rotacione a chave OpenAI no provedor e no secret manager. JWTs existentes expiram conforme `JWT_EXPIRES_IN_SECONDS`.

## Acesso operacional por RBAC

Os papéis são fixos no código: `BROKER` opera seus próprios dados; `OPERATOR` também possui `operations:read` e `operations:replay`, com alcance global sobre jobs e métricas. O papel é consultado no banco em cada requisição; promoção ou revogação vale na próxima chamada, inclusive com o mesmo JWT. As rotas normais continuam limitadas ao corretor autenticado para ambos os papéis.

Aplique a migration `20261008120000_operations_rbac` antes de atualizar API e workers. Todos os usuários existentes e novos começam como `BROKER`. Cadastre a conta normalmente e obtenha seu ID; um administrador com acesso ao servidor e uma conexão PostgreSQL autorizada deve conceder o papel explicitamente:

```bash
pnpm auth:set-role -- <brokerId> OPERATOR
pnpm auth:set-role -- <brokerId> BROKER
```

O primeiro comando concede acesso e o segundo o revoga. O script usa `DATABASE_URL` do ambiente, com `.env` como fallback; não inicializa a API nem workers e não requer build. A conexão precisa poder ler o usuário e atualizar `role` e `updated_at` em `brokers`. O comando retorna ID, papel anterior e papel novo, e encerra com código diferente de zero para argumentos inválidos, usuário inexistente ou erro de banco. Restrinja a execução e o acesso a essa conexão à administração.

O cliente envia somente `Authorization: Bearer <accessToken>`. Sem JWT válido, a API responde `401`; sem a permissão exigida, responde `403`. Não há endpoints para gerir papéis nem promoção automática. Remova o antigo `OPERATIONS_TOKEN` do secret manager e o header `x-operations-token` dos clientes; eles não concedem acesso na API nova. Uma API anterior ao RBAC ainda usa o controle antigo, portanto não a mantenha acessível após concluir o rollout. JWT de operador roubado continua permitindo impersonação até expirar ou o papel ser revogado.

## Migrations, rollback e compensação

Não reverta migration aplicada com edição manual do histórico. Para código, volte para a imagem anterior somente se ela suportar o schema aditivo atual e preservar a autorização RBAC. Mudança incompatível requer migration compensatória revisada e janela de manutenção. Jobs persistem em `async_jobs` e outbox; não apague Redis como procedimento de rollback. Após correção, consulte `/api/operations/jobs` e reexecute somente falhas classificadas como seguras via endpoint de replay protegido por JWT e permissão `operations:replay`.

## Backup e restore

Use snapshots criptografados e retenção definida pela política da organização. Exemplo operacional com secret file/variáveis injetadas pelo gerenciador de secrets:

```bash
pg_dump --format=custom --no-owner "$DATABASE_URL" > backup.dump
createdb corretor_restore_check
pg_restore --no-owner --dbname "$DATABASE_URL_RESTORE" backup.dump
pnpm prisma:deploy
```

Teste restore periodicamente em banco isolado, valide contagens e integridade, depois remova o ambiente de teste. Registre horário, versão de migration e duração. Redis é transporte recuperável; a outbox PostgreSQL é a fonte durável para republicar jobs pendentes.

## Falha de dependência/incidente

- **Redis indisponível:** readiness falha; outbox permanece no PostgreSQL e dispatcher tenta novamente. Não remova registros para aliviar fila.
- **PostgreSQL indisponível:** readiness falha e API deve sair do balanceador. Restaure serviço/backup antes de reabrir tráfego.
- **LLM indisponível ou quota excedida:** usuário recebe fallback/handoff. Verifique `correlationId`, contagem de tokens e erros sanitizados; não copie conteúdo de cliente para issue/log.
- **Suspeita de exposição de segredo:** revogue/rotacione a credencial afetada, reduza privilégios, preserve logs sem ampliar coleta de payload, identifique janela e escopo e audite acessos.
- **Job com falha permanente:** leia código de falha sanitizado; corrija configuração/integração e faça replay idempotente. Mensagens de dead-letter nunca recebem payload bruto na telemetria.

## Rate limits e parâmetros

`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_IP_MAX`, `RATE_LIMIT_USER_MAX` e `RATE_LIMIT_AI_USER_MAX` controlam janela por IP/ator/rota. `HTTP_BODY_LIMIT`, `HTTP_REQUEST_TIMEOUT_MS` e `HTTP_HEADERS_TIMEOUT_MS` limitam HTTP. Limites LLM: `AI_TIMEOUT_MS`, `AI_MAX_ITERATIONS`, `AI_MAX_TOOL_CALLS`, `AI_MAX_CONTEXT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_TOTAL_TOKENS`, `AI_DAILY_TOKEN_LIMIT` e `AI_DAILY_REQUEST_LIMIT`. Ajustes devem ser acompanhados por avaliação de custo/latência e segurança.

A extração de preferências usa `AI_EXTRACTION_MAX_OUTPUT_TOKENS` (padrão: 3000), limitado pela reserva de tokens da execução. Para `gpt-6.1-sol`, o adapter usa `reasoning.effort=low`. Tokens de raciocínio também consomem o limite de saída; uma resposta truncada é registrada como `AI_OUTPUT_TOKEN_LIMIT`, com os tokens efetivamente consumidos. O SDK respeita o timeout da aplicação e não faz retries automáticos.

Falhas LLM geram o evento JSON `ai_operation_failed`. Ao investigar HTTP 400, consulte `providerCode`, `providerParam`, `providerRequestId` e `correlationId`; o código das métricas também distingue falhas do provedor e respostas incompletas. O log não inclui mensagens, prompts ou credenciais. Requisições rejeitadas pelo provedor liberam a reserva de tokens; timeout/falha de conexão com uso desconhecido mantém a reserva de forma conservadora. A contagem diária de requisições não é devolvida.

Providers aceitos: `mock`, `openai` e `gemini`. Gemini usa `GEMINI_API_KEY` e `GEMINI_MODEL` (padrão: `gemini-2.5-flash`), pelo endpoint `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, com o SDK já instalado. Para Gemini 2.5 Flash/Flash-Lite, o adapter desativa thinking; para 2.5 Pro e Gemini 3, usa esforço baixo. Chamadas de ferramentas são preservadas integralmente para reenviar eventuais thought signatures. Todos os providers compartilham os limites e a validação de argumentos da aplicação.

Para HTTP 503 do Gemini (`AI_PROVIDER_OVERLOADED`), o adapter faz até duas novas tentativas da chamada ao modelo, com espera de 1s e 2s mais jitter, respeitando `Retry-After` e o timeout total da operação. Essa política não reinicia a orquestração nem reexecuta ferramentas. Outros erros, incluindo quota HTTP 429, não são repetidos automaticamente. Se a indisponibilidade persistir, a extração retorna 503 e o assistente usa o fallback existente. O SDK permanece com seus retries automáticos desativados.
