# Plano técnico — 010 — Assistente e histórico persistido

## Implementação

- GET /api/conversations?leadId recupera conversas próprias; GET /api/conversations/:id/messages recupera histórico; GET :id/proposals retorna propostas pendentes válidas.
- POST :id/messages exige Idempotency-Key; retentativa manual reutiliza a chave lógica. Mensagens, imóveis e retornos de ferramentas são conteúdo não confiável.
- Propostas de agendamento são PENDING/CONFIRMING/CONFIRMED/REJECTED/EXPIRED. Decisão {confirmed} valida proprietário, prazo e hash; apenas confirmação executa VisitsService.create com chave proposal:<id>.
- Extração apresenta resultado ao corretor antes de aplicar preferências. Timeout/fallback são visíveis sem inventar disponibilidade ou efeitos comerciais.
- Renderizar conteúdo como texto seguro. Novo login recupera dados persistidos; não armazenar histórico autenticado no navegador.

## Integração e migração

Manter backend NestJS em backend/ e frontend React em frontend/, com dependências e lockfiles próprios. Alterações de schema são aditivas em 20261008150000_frontend_journey. Reutilizar auditoria, outbox, jobs e chaves existentes. Nunca aplicar migrations ou resetar dados de desenvolvimento para rodar testes.

## Verificação

- Recuperação por lead após novo login, conteúdo seguro e carteira alheia.
- Confirmar/rejeitar, proposta expirada, confirmação repetida, chave preservada após timeout.
- Provider determinístico nos testes e nenhuma chamada externa paga.

Verificar build, TypeScript, lint e testes pertinentes. Comparar telas com os PNGs em 390, 768 e 1440 px; evidências devem registrar comando, resultado e limitações.
