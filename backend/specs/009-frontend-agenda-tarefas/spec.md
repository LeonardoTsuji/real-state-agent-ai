# 009 — Agenda, check-in, roteiro e feedback

Status: implementação integrada e validada; evidências e limites registrados em [tasks.md](tasks.md) e na [matriz dos protótipos](../../docs/prototype-matrix.md).

## Objetivo

Entregar agenda e visita guiada com motivos, check-in, checklist, rascunho e conclusão transacional, preservando os endpoints atuais.

## Requisitos e critérios de aceite

**CA-01:** GET /api/agenda?from&to retorna visits/reservations/blocks do período (máximo 93 dias). Datas são enviadas UTC com Z e exibidas em America/Sao_Paulo.

**CA-02:** POST /api/visits aceita leadId/propertyId/startAt/endAt/notes e Idempotency-Key. PATCH remarca com reason/notes; DELETE existente continua válido; POST :id/cancel recebe reason.

**CA-03:** POST :id/check-in recebe mode MANUAL ou SIMULATED_LOCATION; PATCH :id/checklist recebe items booleanos; PATCH :id/feedback-draft recebe feedback JSON. Recursos concluídos/cancelados não podem ser alterados.

**CA-04:** POST :id/complete recebe feedback opcional, nextStage opcional e task {title,dueAt} opcional. Persistir feedback, transição válida e tarefa na mesma transação; usar rascunho quando feedback não for reenviado.

**CA-05:** Status permanecem SCHEDULED/COMPLETED/CANCELED. Cancelar libera ocupação, cancela lembretes e registra motivo; motivo pessoal não altera afinidade nem marca perdido automaticamente.

**CA-06:** Calendário compartilhado garante conflito no PostgreSQL entre visitas, reservas e bloqueios e aceita intervalos adjacentes. Áudio, transcrição, localização e voucher são demonstrações identificadas.

## Defaults e limites comuns

Interface em português; BRL em centavos; horários de America/Sao_Paulo. Protótipos screen.png prevalecem para composição; code.html orienta medidas; design system define tokens. Backend aplica propriedade e permissões. Dossiês exigem sessão. Integrações externas, assinatura e pagamentos são simulações explícitas; não há publicação, links públicos ou captura/upload real de mídia nesta entrega.

## Cenários de verificação

- Conflito concorrente, repetição idempotente e intervalos adjacentes.
- Rascunho não conclui; conclusão salva feedback/estágio/tarefa atomicamente e falha reverte tudo.
- Check-in repetido, checklist inválido, motivo persistido, carteira alheia e cancelamento.

Rastreabilidade das telas: [matriz dos 27 protótipos](../../docs/prototype-matrix.md).
