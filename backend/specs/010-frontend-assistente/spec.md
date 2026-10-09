# 010 — Assistente e histórico persistido

Status: implementação integrada e validada; evidências e limites registrados em [tasks.md](tasks.md) e na [matriz dos protótipos](../../docs/prototype-matrix.md).

## Objetivo

Integrar o assistente no detalhe do lead com extração de preferências, conversas, propostas e decisões humanas.

## Requisitos e critérios de aceite

**CA-01:** GET /api/conversations?leadId recupera conversas próprias; GET /api/conversations/:id/messages recupera histórico; GET :id/proposals retorna propostas pendentes válidas.

**CA-02:** POST :id/messages exige Idempotency-Key; retentativa manual reutiliza a chave lógica. Mensagens, imóveis e retornos de ferramentas são conteúdo não confiável.

**CA-03:** Propostas de agendamento são PENDING/CONFIRMING/CONFIRMED/REJECTED/EXPIRED. Decisão {confirmed} valida proprietário, prazo e hash; apenas confirmação executa VisitsService.create com chave proposal:<id>.

**CA-04:** Extração apresenta resultado ao corretor antes de aplicar preferências. Timeout/fallback são visíveis sem inventar disponibilidade ou efeitos comerciais.

**CA-05:** Renderizar conteúdo como texto seguro. Novo login recupera dados persistidos; não armazenar histórico autenticado no navegador.

## Defaults e limites comuns

Interface em português; BRL em centavos; horários de America/Sao_Paulo. Protótipos screen.png prevalecem para composição; code.html orienta medidas; design system define tokens. Backend aplica propriedade e permissões. Dossiês exigem sessão. Integrações externas, assinatura e pagamentos são simulações explícitas; não há publicação, links públicos ou captura/upload real de mídia nesta entrega.

## Cenários de verificação

- Recuperação por lead após novo login, conteúdo seguro e carteira alheia.
- Confirmar/rejeitar, proposta expirada, confirmação repetida, chave preservada após timeout.
- Provider determinístico nos testes e nenhuma chamada externa paga.

Rastreabilidade das telas: [matriz dos 27 protótipos](../../docs/prototype-matrix.md).
