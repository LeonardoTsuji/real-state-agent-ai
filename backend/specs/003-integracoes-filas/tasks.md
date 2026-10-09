# Tarefas — etapa 3

Status: implementação pronta; falta um teste de encerramento abrupto do processo worker para fechar CA-03.

## Incremento 1 — Infraestrutura assíncrona

- [x] T301 Adicionar BullMQ/Redis, producers e consumers com payload versionado e status consultável. **CA-01, CA-10**.
- [x] T302 Implementar classificação de erros, timeout, tentativas, backoff, jitter, concorrência, rate limit e falha permanente. **CA-02, CA-03**.
- [x] T303 Testar duplicação, reinício do worker, recuperação de jobs e replay controlado. **CA-01, CA-03**.

## Incremento 2 — Outbox

- [x] T304 Criar outbox e inserção transacional junto às mudanças de domínio. **CA-04**.
- [x] T305 Implementar dispatcher com lease, publicação idempotente e recuperação após Redis indisponível. **CA-04**.
- [x] T306 Implementar idempotência de consumidor dentro da transação do efeito. **CA-01, CA-03, CA-04**.

## Incremento 3 — Fluxos simulados

- [x] T307 Implementar lembretes de visita com substituição/invalidação em cancelamento e remarcação. **CA-05**.
- [x] T308 Implementar follow-up, timezone, janela comercial e cancelamento/conclusão. **CA-06**.
- [x] T309 Implementar importação de fixture com relatório por linha e reexecução idempotente. **CA-07**.
- [x] T310 Implementar adapter de calendário simulado e convergência sob retry. **CA-08**.
- [x] T311 Implementar processamento e estado de mensagens simuladas com deduplicação. **CA-09**.

## Incremento 4 — Visibilidade e fechamento

- [x] T312 Criar consulta operacional protegida, métricas e logs sanitizados. **CA-10**.
- [x] T313 Testar Redis indisponível, falha permanente, rate limit, retomada e redrive; documentar operação. **CA-01 a CA-10**.

## Rastreabilidade

| Critério          | Tarefas                      |
| ----------------- | ---------------------------- |
| CA-01/03          | T301, T302, T303, T306, T313 |
| CA-02             | T302, T313                   |
| CA-04             | T304, T305, T306, T313       |
| CA-05/06/07/08/09 | T307–T311, T313              |
| CA-10             | T301, T312, T313             |
