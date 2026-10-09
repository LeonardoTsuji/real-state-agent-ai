# Plano técnico — 007 — Leads e CRM

## Implementação

- GET /api/leads aplica busca textual, estágio, orçamento e período no servidor antes da paginação. Respostas incluem stage e resumos úteis; nunca filtrar apenas a página carregada.
- Criar/editar exige nome e pelo menos um contato; exclusão permanece lógica, confirmada pelo corretor. Campos omitidos são preservados; null somente onde permitido.
- Preferências, interações, tarefas e transições de qualificação seguem endpoints atuais e isolamento por broker, inclusive OPERATOR.
- Importação CSV possui prévia, validação e relatório por linha; POST /api/leads/import persiste idempotência em LeadImportBatch.
- O detalhe permite associação de imóvel, abertura contextual da agenda e conversas persistidas. Separar qualificação do lead da oportunidade comercial.

## Integração e migração

Manter backend NestJS em backend/ e frontend React em frontend/, com dependências e lockfiles próprios. Alterações de schema são aditivas em 20261008150000_frontend_journey. Reutilizar auditoria, outbox, jobs e chaves existentes. Nunca aplicar migrations ou resetar dados de desenvolvimento para rodar testes.

## Verificação

- Busca sobre mais de uma página, filtros combinados, contatos inválidos e exclusão lógica.
- Preferências parciais, transições inválidas, associação duplicada e importação repetida.
- 404 para carteira alheia e reconsulta após cada mutação.

Verificar build, TypeScript, lint e testes pertinentes. Comparar telas com os PNGs em 390, 768 e 1440 px; evidências devem registrar comando, resultado e limitações.
