# Plano técnico — etapa 5

## Segurança

Definir threat model por fronteira: cliente/API, corretor/tenant, LLM/tools, fila/workers e integrações. Aplicar rate limit por identidade/IP conforme rota, limites de payload e timeouts. Credenciais têm escopo mínimo e rotação documentada. Prompt injection é tratado como entrada não confiável; controles de autorização são código de aplicação e constraints de dados.

Mascarar dados por padrão em logger/telemetria. Conversas têm política configurável de retenção e mecanismo para exclusão/anonimização sem apagar registros de auditoria obrigatórios. Evitar conteúdo integral em spans. Correlation ID é validado/gerado no ingresso e propagado em contexto assíncrono.

## Observabilidade e operação

Pino registra JSON com timestamp, nível, serviço, correlation ID e resultado. OpenTelemetry propaga trace API → banco/outbox → BullMQ → adapters. Health liveness não depende de terceiros; readiness testa dependências necessárias. Métricas incluem latência por percentil, erros, fila atrasada, retries, custo/tokens e falhas de integração.

Documentar migrações compatíveis, backup/restore validado, rollback ou migration compensatória, deploy coordenado de API e workers, gestão de segredos e alertas. Não registrar payloads sensíveis em dead-letter queue.

## Avaliação

Dataset JSONL/fixture versionado com ID, categoria, entradas, ator/fixture, resultado esperado, ferramentas permitidas, condição de confirmação e severidade. Casos críticos incluem autorização, confirmação e fundamentação. Pipeline separa avaliações determinísticas de julgamento assistido; resultados são repetíveis, guardam versão de modelo/prompt e têm orçamento de execução.

Definir limiares quantitativos antes de release usando baseline; violações críticas de autorização/confirmação têm tolerância zero. Publicar relatório de regressão com latência, tokens, custo e taxa de conclusão.

## Portfólio

Manter README, diagrama, setup, migrations/seeds seguros, API documentada, testes, exemplos de conversa, avaliações, threat model, decisões arquiteturais e demonstração. Nunca incluir dados pessoais ou chaves reais.
