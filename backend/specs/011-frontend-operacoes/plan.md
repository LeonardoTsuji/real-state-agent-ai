# Plano técnico — 011 — Operações e permissões

## Implementação

- Reutilizar GET /api/operations/jobs, GET jobs/:id, POST jobs/:id/replay, GET metrics e GET metrics/ai; mostrar apenas campos sanitizados.
- Consultas operacionais são globais com operations:read; replay exige operations:replay e confirmação. Rotas de negócio continuam limitadas à carteira própria do operador.
- Atualizar consultas a cada 10 segundos somente enquanto área estiver visível e autorizada. Listagem usa até 50 jobs recentes.
- Replay não possui retry automático; reenfileiramento aceito não equivale a job concluído. Métricas usam apenas dados efetivamente retornados.
- 403 interrompe atualização, elimina cache operacional e revalida /auth/me. Sessão pessoal válida é mantida; 401 encerra sessão.

## Integração e migração

Manter backend NestJS em backend/ e frontend React em frontend/, com dependências e lockfiles próprios. Alterações de schema são aditivas em 20261008150000_frontend_journey. Reutilizar auditoria, outbox, jobs e chaves existentes. Nunca aplicar migrations ou resetar dados de desenvolvimento para rodar testes.

## Verificação

- Corretor recebe 403; operador lê/reexecuta somente com permissão.
- Revogação com mesmo JWT, cache limpo e identidade pessoal preservada.
- Replay duplicado não automático, payloads ausentes e métricas sem invenção.

Verificar build, TypeScript, lint e testes pertinentes. Comparar telas com os PNGs em 390, 768 e 1440 px; evidências devem registrar comando, resultado e limitações.
