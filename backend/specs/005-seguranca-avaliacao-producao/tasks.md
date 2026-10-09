# Tarefas — etapa 5

Status: implementação concluída; validação e2e de produção pendente.

Nota de validação: lint, build, testes unitários, schema Prisma e cobertura do dataset passaram. A execução e2e não pôde iniciar porque o ambiente negou acesso à API Docker/OrbStack; a avaliação real do candidato exige um arquivo de resultados emitido pelo modelo/prompt de release.

## Incremento 1 — Proteções

- [x] T501 Aplicar rate limit por rota/identidade, payload máximo, timeouts e configuração de privilégios mínimos. **CA-01**.
- [x] T502 Cobrir prompt injection em mensagens, imóveis, importação e ferramentas no dataset; reforçar limites de confiança no prompt e no registry. **CA-02, CA-09**.
- [x] T503 Aplicar quotas diárias atômicas de tokens/requisições, limites de duração/chamadas e fallback. **CA-03**.
- [x] T504 Implementar mascaramento, retenção/exclusão de conversas e auditoria de acesso ao conteúdo. **CA-04**.

## Incremento 2 — Telemetria e operação

- [x] T505 Propagar correlation ID por API, outbox, filas e worker; criar logs estruturados, métricas e health checks. **CA-05**.
- [x] T506 Criar runbooks de deploy, migração, rollback/compensação, backup/restore, secrets e incidentes; separar API e worker por papel. **CA-06**.

## Incremento 3 — Avaliação e threat model

- [x] T507 Criar threat model com ativos, atores, limites de confiança, ameaças, controles e riscos residuais. **CA-09**.
- [x] T508 Criar dataset versionado de 100 cenários cobrindo as categorias do CA-07. **CA-07**.
- [x] T509 Implementar pipeline/relatório de métricas, limiares e bloqueio de regressões críticas. **CA-08**.
- [x] T510 Testar que autorização e confirmação são impostas pelo backend, independentemente do LLM. **CA-02, CA-07, CA-09**.

## Incremento 4 — Portfólio e aceite

- [x] T511 Completar README, diagramas, exemplos, decisões, métricas, testes e demonstração sem segredos/dados pessoais. **CA-04, CA-06, CA-08**.
- [ ] T512 Executar testes de produção, recuperação e segurança; revisar todos os critérios e registrar limitações/risco residual. **CA-01 a CA-09**.

## Rastreabilidade

| Critério | Tarefas                |
| -------- | ---------------------- |
| CA-01    | T501, T512             |
| CA-02    | T502, T510, T512       |
| CA-03    | T503, T512             |
| CA-04    | T504, T511, T512       |
| CA-05/06 | T505, T506, T511, T512 |
| CA-07    | T508, T510, T512       |
| CA-08    | T509, T511, T512       |
| CA-09    | T502, T507, T510, T512 |
