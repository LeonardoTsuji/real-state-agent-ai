# Plano técnico — 012 — Encaixes, pré-reservas e canais simulados

## Implementação

- GET /api/scheduling/suggestions?startAt&endAt retorna leads/imóveis/visitas próprios; sugestões e deslocamentos são simulação identificada.
- POST /api/scheduling/reservations exige Idempotency-Key e leadId/propertyId/startAt/endAt/strategy. ADD_PROPERTY cria visita; RESCHEDULE exige visitId da mesma carteira/lead/imóvel e remarca a original ao confirmar.
- Reservation usa PENDING/CONFIRMED/CANCELED/EXPIRED. expiresAt=min(now+45min,startAt); rejeitar início passado. Expirar por worker e reconciliar antes de operações na agenda.
- Persistir convite, job/outbox e pré-reserva na mesma transação. POST :id/decision recebe confirmed; :id/simulate-response exige DEMO_MODE e aceita confirmed ou event NO_RESPONSE/SEND_FAILED. Preservar falha simulada contra sucesso tardio do worker. Confirmar duas vezes não duplica visita.
- POST /api/scheduling/blocks recebe title/startAt/endAt e Idempotency-Key; DELETE blocks/:id libera ocupação. CalendarOccupancy usa exclusão PostgreSQL e triggers com backfill das visitas existentes.
- Não habilitar contingência automática para outro lead; identidade e isolamento são derivados da sessão. WhatsApp/calendário/portaria permanecem simulados.

## Integração e migração

Manter backend NestJS em backend/ e frontend React em frontend/, com dependências e lockfiles próprios. Alterações de schema são aditivas em 20261008150000_frontend_journey. Reutilizar auditoria, outbox, jobs e chaves existentes. Nunca aplicar migrations ou resetar dados de desenvolvimento para rodar testes.

## Verificação

- Reserva versus visita/bloqueio concorrentes, adjacência e expiração/reuso.
- Confirmação duplicada, rejeição, antecipação sem duplicar e convite/outbox atômicos.
- Simulação desabilitada retorna 403; reserva alheia retorna 404.

Verificar build, TypeScript, lint e testes pertinentes. Comparar telas com os PNGs em 390, 768 e 1440 px; evidências devem registrar comando, resultado e limitações.
