# Plano técnico — 009 — Agenda, check-in, roteiro e feedback

## Implementação

- GET /api/agenda?from&to retorna visits/reservations/blocks do período (máximo 93 dias). Datas são enviadas UTC com Z e exibidas em America/Sao_Paulo.
- POST /api/visits aceita leadId/propertyId/startAt/endAt/notes e Idempotency-Key. PATCH remarca com reason/notes; DELETE existente continua válido; POST :id/cancel recebe reason.
- POST :id/check-in recebe mode MANUAL ou SIMULATED_LOCATION; PATCH :id/checklist recebe items booleanos; PATCH :id/feedback-draft recebe feedback JSON. Recursos concluídos/cancelados não podem ser alterados.
- POST :id/complete recebe feedback opcional, nextStage opcional e task {title,dueAt} opcional. Persistir feedback, transição válida e tarefa na mesma transação; usar rascunho quando feedback não for reenviado.
- Status permanecem SCHEDULED/COMPLETED/CANCELED. Cancelar libera ocupação, cancela lembretes e registra motivo; motivo pessoal não altera afinidade nem marca perdido automaticamente.
- Calendário compartilhado garante conflito no PostgreSQL entre visitas, reservas e bloqueios e aceita intervalos adjacentes. Áudio, transcrição, localização e voucher são demonstrações identificadas.

## Integração e migração

Manter backend NestJS em backend/ e frontend React em frontend/, com dependências e lockfiles próprios. Alterações de schema são aditivas em 20261008150000_frontend_journey. Reutilizar auditoria, outbox, jobs e chaves existentes. Nunca aplicar migrations ou resetar dados de desenvolvimento para rodar testes.

## Verificação

- Conflito concorrente, repetição idempotente e intervalos adjacentes.
- Rascunho não conclui; conclusão salva feedback/estágio/tarefa atomicamente e falha reverte tudo.
- Check-in repetido, checklist inválido, motivo persistido, carteira alheia e cancelamento.

Verificar build, TypeScript, lint e testes pertinentes. Comparar telas com os PNGs em 390, 768 e 1440 px; evidências devem registrar comando, resultado e limitações.
