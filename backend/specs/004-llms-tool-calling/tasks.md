# Tarefas — etapa 4

Status: backlog; depende das etapas 1 a 3.

## Incremento 1 — Extração e busca

- [ ] T401 Criar schemas versionados para preferências e casos de avaliação sem provedor externo. **CA-01, CA-09**.
- [ ] T402 Integrar Responses API por adapter com configuração segura, timeout, limite de tokens e tratamento de saída estruturada. **CA-01, CA-06**.
- [ ] T403 Implementar extração com perguntas de esclarecimento e validação; avaliar mensagens completas/incompletas. **CA-01, CA-09**.
- [ ] T404 Implementar busca por ferramenta determinística, resposta apoiada apenas em resultados reais e caso zero resultados. **CA-02, CA-09**.

## Incremento 2 — Registry e ferramentas de CRM

- [ ] T405 Implementar registry, schemas, autorização, identidade de backend, timeout, métricas e registro sanitizado. **CA-03**.
- [ ] T406 Implementar ferramentas de lead, preferências, imóveis e interesse com políticas por operação. **CA-04**.
- [ ] T407 Implementar horários, proposta/agendamento, tarefas e rascunho de follow-up. **CA-04, CA-07**.

## Incremento 3 — Orquestrador e controle

- [ ] T408 Implementar contexto autorizado, loop limitado, persistência de mensagens e resultados. **CA-05, CA-08**.
- [ ] T409 Implementar timeout, saída inválida, idempotência e fallback manual/determinístico. **CA-05, CA-06**.
- [ ] T410 Implementar proposta e confirmação humana atômica, vinculada a ator/conversa/argumentos/expiração. **CA-07**.
- [ ] T411 Criar testes adversariais de prompt injection e provar que ferramenta desconhecida, acesso cruzado ou confirmação pelo modelo falha fechada. **CA-03, CA-07, CA-08**.

## Incremento 4 — Avaliação

- [ ] T412 Versionar dataset e executar avaliações dos casos requeridos; registrar fundamentação, escolha/argumentos e custo. **CA-09**.
- [ ] T413 Verificar métricas, retenção, redaction e fallback sem provedor; registrar evidências CA-01 a CA-09. **CA-05, CA-06, CA-08**.

## Rastreabilidade

| Critério | Tarefas                |
| -------- | ---------------------- |
| CA-01/02 | T401–T404              |
| CA-03/04 | T405–T407, T411        |
| CA-05/06 | T408, T409, T413       |
| CA-07    | T407, T410, T411       |
| CA-08    | T408, T411, T413       |
| CA-09    | T401, T403, T404, T412 |
