# Threat model — Corretor Copilot

Revisão: 2026-10-08. Escopo: API, PostgreSQL, Redis/BullMQ, workers, integrações simuladas e Responses API.

## Ativos e limites de confiança

| Ativo | Limite de confiança | Controle primário |
| --- | --- | --- |
| Credenciais e JWT | Cliente → API | Hash Argon2id, JWT HS256 e chave de assinatura somente no backend |
| Papéis e permissões operacionais | Usuário autenticado → operação global | Matriz RBAC no código, papel atual no banco e PermissionsGuard |
| Leads, imóveis, mensagens e agenda | Corretor/tenant → banco | Guard JWT, filtros `brokerId`, FKs compostas e validação DTO/Zod |
| Efeitos de visita e follow-up | LLM → registry → domínio | Allowlist de tools, identidade injetada pelo servidor, confirmação explícita e idempotência |
| Conteúdo enviado ao LLM | Cliente, importação ou tool → modelo | Tratado como dado não confiável; contexto limitado; tools sem acesso a SQL/segredos |
| Jobs e efeitos externos | PostgreSQL/outbox → Redis/worker → integração | Outbox durável, payload mínimo, retries limitados e chave idempotente |
| Telemetria e auditoria | Aplicação → operador | Logs sem corpo/header de autenticação; eventos de auditoria sem conteúdo da mensagem |

## Atores e abuso considerado

Atacantes incluem usuário anônimo tentando brute force ou abuso de payload, corretor autenticado tentando cruzar tenants ou obter privilégios operacionais, cliente tentando prompt injection, operador com JWT exposto e integração/LLM indisponível ou comprometido. Ameaças consideradas: enumeração de recursos, extração de PII, injeção por mensagem/descrição/importação, repetição de mutações, confirmação forjada pelo modelo, consumo excessivo de tokens, indisponibilidade de filas e vazamento por logs.

## Controles e evidências

- Toda rota de domínio exige JWT. O controller operacional também exige permissão explícita: consultas requerem `operations:read`, replay requer `operations:replay`; apenas `OPERATOR` possui essas permissões globais. Sem identidade válida, a resposta é 401; sem permissão ou declaração, o guard nega com 403. O papel vem do banco em cada chamada, nunca de claims de privilégio do JWT ou headers do cliente. Revogação vale na próxima chamada. `GET /api/health/live` e `GET /api/health/ready` são intencionalmente públicos e retornam apenas estado agregado.
- Cadastro público sempre cria `BROKER` e rejeita campos de privilégio. Promoção e revogação ocorrem somente por script administrativo com conexão PostgreSQL controlada. Operadores continuam limitados aos próprios dados fora do controller operacional.
- Limites por IP e por corretor/rota são configuráveis. Payload JSON e tempo de requisição também têm limite. O rate limiter atual é em memória por processo.
- Falhas de autorização em conversas retornam 404 e gravam `ACCESS_DENIED`; leitura e anonimização de conversa deixam eventos de auditoria. Busca e tool executam sempre com o corretor do JWT.
- O modelo recebe apenas as tools registradas. Schemas estritos são revalidados no backend; saídas de cliente, imóveis, importações e ferramentas são dados, nunca instruções. A confirmação é endpoint autenticado fora do modelo.
- Orquestração limita duração, iterações, tools, contexto e tokens por execução, além de reservar atomicamente tokens e requisições da quota diária por corretor no PostgreSQL. Timeout ou falha retorna handoff e grava status/correlation ID.
- Logs estruturados incluem rota, status, latência e correlation ID, nunca body, query, token, senha, chave de API ou argumentos de tool. Execuções de tool guardam apenas nome, duração e código sanitizado.
- `DELETE /api/conversations/:id/content` substitui corpos por marcador, remove propostas e mantém auditoria mínima. Uma rotina diária no processo API remove mensagens antigas e propostas expiradas; o acesso à conversa também aplica a retenção de forma oportunista.

## Risco residual

O roubo de um JWT de operador permite agir como ele enquanto o token for válido e o papel continuar autorizado. A proteção da conexão administrativa é essencial, pois permite alterar papéis. Instâncias antigas da API devem ser retiradas ao concluir o rollout do RBAC.

O rate limiter é local ao processo; em múltiplas réplicas o limite efetivo soma instâncias e reinicia no deploy. Produção horizontal deve movê-lo para gateway ou store compartilhado. A rotina diária de retenção roda nos processos API ativos, então sua frequência depende da disponibilidade de ao menos uma réplica API. A avaliação versionada é offline e só bloqueia release quando recebe o JSONL de resultados do candidato; ela não chama um modelo nem substitui revisão humana. Credenciais e limites de rede do provedor de LLM dependem da configuração do ambiente de produção.
