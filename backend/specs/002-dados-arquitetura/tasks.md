# Tarefas — etapa 2

Status: implementado e verificado em 6 de outubro de 2026.

## Incremento 1 — Modelo e separação

- [x] T200 Atualizar Prisma para versão suportada, adotar ESM, adapter PostgreSQL, configuração e Jest. **CA-09, CA-10**
- [x] T201 Definir retenção: leads e imóveis são tombstones; FKs históricas usam `RESTRICT`. **CA-09, CA-10**
- [x] T202 Criar migrations aditivas para preferências, associações, visitas, interações, tarefas, estágio/histórico e auditoria; adicionar checks, FKs compostas, índices e constraint de agenda. **CA-09**
- [x] T203 Separar regra/caso de uso de mudança de estágio com `LeadStagePort` e adapter Prisma; testar use case sem infraestrutura e integração real. **CA-10**

## Incremento 2 — Preferências e compatibilidade

- [x] T204 Implementar preferências 1:1 com PATCH parcial, validação de faixas e atomicidade. **CA-01, CA-10**
- [x] T205 Implementar associação lead-imóvel, score, status, motivo, unicidade e isolamento. **CA-02, CA-09, CA-10**

## Incremento 3 — Visitas

- [x] T206 Implementar criação, consulta, listagem, remarcação, conclusão e cancelamento em UTC. **CA-03, CA-04**
- [x] T207 Garantir conflito no PostgreSQL por exclusion constraint e testar adjacência, cancelamento, conclusão, remarcação e duas reservas concorrentes. **CA-03, CA-09**
- [x] T208 Testar isolamento entre corretores e atomicidade das operações de agenda/auditoria. **CA-04, CA-10**

## Incremento 4 — Interações, tarefas e funil

- [x] T209 Implementar histórico append-only e cursor composto vinculado ao escopo/filtros. **CA-05, CA-09**
- [x] T210 Implementar tarefas, transições terminais e consultas ordenadas por vencimento. **CA-06, CA-09**
- [x] T211 Implementar transições de estágio, histórico com ator e funil por corretor. **CA-07**

## Incremento 5 — Auditoria e encerramento

- [x] T212 Registrar mutações na mesma transação; validar rollback com trigger de falha e redação de dados. **CA-08**
- [x] T213 Medir plano de consulta frequente; justificar índices e documentar upgrade/rollback. **CA-09**
- [x] T214 Executar testes unitários, lint, build, integração/e2e e registrar evidências dos critérios. **CA-01 a CA-10**

## Evidências de aceite

| Critério | Evidência |
| --- | --- |
| CA-01 | E2E comprova PATCH parcial e rejeição de faixa incompatível sem mudar o valor persistido; INSERT direto inválido também falha no check PostgreSQL. |
| CA-02 | E2E cobre score/status/motivo, par duplicado e lead/imóvel de corretores diferentes; FKs compostas também aplicam o escopo no banco. |
| CA-03/04 | E2E testa intervalos adjacentes, duas requisições simultâneas (uma `201`, uma `409`), remarcação em conflito, cancelamento/conclusão liberando horário e acesso cruzado `404`. |
| CA-05 | E2E percorre interações em ordem temporal, inclui inserção posterior ao primeiro cursor e rejeita cursor de outro escopo. Não há rota de update/delete. |
| CA-06 | E2E lista pendências, conclui e confirma que estado terminal não pode ser revertido. |
| CA-07 | Testes de domínio exercitam transições permitidas/proibidas; E2E verifica histórico inicial/de mudança e contagem do funil. |
| CA-08 | Trigger de teste faz auditoria falhar; a criação do lead é revertida integralmente. Eventos guardam nomes de campos, nunca os valores de contato/conteúdo. `x-request-id` é gerado pelo middleware. |
| CA-09 | Migration stage 1→2 aplicada em banco descartável com broker/lead/imóvel sintéticos: 1 lead e 1 imóvel permaneceram íntegros, estágio default `NEW`. Constraint GiST foi exercitada em concorrência. |
| CA-10 | `ChangeLeadStageUseCase` e domínio são testados sem Prisma; `PrismaLeadStageAdapter` e a API são exercitados contra PostgreSQL real. |

Plano medido em PostgreSQL 17 local com 50.000 tarefas sintéticas: a consulta `WHERE broker_id = ? AND status = 'PENDING' ORDER BY due_at,id LIMIT 25` usou `Index Only Scan` em `tasks_broker_id_status_due_at_id_idx`, 4 buffers compartilhados e 0,052 ms de execução nesse conjunto local. É uma evidência de correspondência do índice, não uma previsão de latência de produção.

Verificações: `pnpm build`, `pnpm lint`, `pnpm test --runInBand` (6 suítes/10 testes) e `pnpm test:e2e` (6 cenários). Banco e2e: `corretor_copilot_test`, validado por `scripts/test-e2e.sh` como loopback e nome exato.

## Rastreabilidade

| Critério | Tarefas |
| --- | --- |
| CA-01/02 | T202, T203, T204, T205 |
| CA-03/04 | T206, T207, T208 |
| CA-05/06/07 | T209, T210, T211 |
| CA-08 | T212 |
| CA-09 | T201, T202, T205, T207, T209, T210, T213 |
| CA-10 | T203, T204, T205, T208, T214 |
