# 012 — Encaixes, pré-reservas e canais simulados

Status: implementação integrada e validada; evidências e limites registrados em [tasks.md](tasks.md) e na [matriz dos protótipos](../../docs/prototype-matrix.md).

## Objetivo

Aproveitar horários liberados com convite transacional, pré-reserva e confirmação simulada explícita.

## Requisitos e critérios de aceite

**CA-01:** GET /api/scheduling/suggestions?startAt&endAt retorna leads/imóveis/visitas próprios; sugestões e deslocamentos são simulação identificada.

**CA-02:** POST /api/scheduling/reservations exige Idempotency-Key e leadId/propertyId/startAt/endAt/strategy. ADD_PROPERTY cria visita; RESCHEDULE exige visitId da mesma carteira/lead/imóvel e remarca a original ao confirmar.

**CA-03:** Reservation usa PENDING/CONFIRMED/CANCELED/EXPIRED. expiresAt=min(now+45min,startAt); rejeitar início passado. Expirar por worker e reconciliar antes de operações na agenda.

**CA-04:** Persistir convite, job/outbox e pré-reserva na mesma transação. POST :id/decision recebe confirmed; :id/simulate-response exige DEMO_MODE e recebe {confirmed} ou {event:'NO_RESPONSE'|'SEND_FAILED'}, sem combinar. Ausência de resposta expira a reserva; falha marca mensagem/job e mantém slot até cancelamento/expiração. Confirmar duas vezes não duplica visita.

**CA-05:** POST /api/scheduling/blocks recebe title/startAt/endAt e Idempotency-Key; DELETE blocks/:id libera ocupação. CalendarOccupancy usa exclusão PostgreSQL e triggers com backfill das visitas existentes.

**CA-06:** Não habilitar contingência automática para outro lead; identidade e isolamento são derivados da sessão. WhatsApp/calendário/portaria permanecem simulados.

## Defaults e limites comuns

Interface em português; BRL em centavos; horários de America/Sao_Paulo. Protótipos screen.png prevalecem para composição; code.html orienta medidas; design system define tokens. Backend aplica propriedade e permissões. Dossiês exigem sessão. Integrações externas, assinatura e pagamentos são simulações explícitas; não há publicação, links públicos ou captura/upload real de mídia nesta entrega.

## Cenários de verificação

- Reserva versus visita/bloqueio concorrentes, adjacência e expiração/reuso.
- Confirmação duplicada, rejeição, antecipação sem duplicar e convite/outbox atômicos.
- Simulação desabilitada retorna 403; reserva alheia retorna 404.

Rastreabilidade das telas: [matriz dos 27 protótipos](../../docs/prototype-matrix.md).
