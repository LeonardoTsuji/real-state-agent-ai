# Plano técnico — 008 — Catálogo, compatibilidade e dossiê

## Implementação

- Imóvel inclui código, endereço, subtipo, disponibilidade, área, suítes, banheiros, condomínio, IPTU, comodidades, mídias demonstrativas e acesso. Preservar PropertyType; studio/cobertura usam subtipo de APARTMENT.
- Filtros, busca e ordenação são aplicados no backend antes da paginação. Compatibilidade determinística considera preferências declaradas e retorna score e critérios; afinidade manual fica separada.
- Dossiê exige sessão autenticada, sem link público. Galeria e tour utilizam assets de demonstração; imagens quebradas devem ser substituídas.
- Simulador SAC permite ajustar entrada, prazo e taxa; apresenta estimativa em BRL, sem alegar aprovação de financiamento.
- Importação CSV reutiliza batches/jobs existentes, com prévia e relatório. Documento DOSSIER congela snapshot persistido para imprimir/baixar.

## Integração e migração

Manter backend NestJS em backend/ e frontend React em frontend/, com dependências e lockfiles próprios. Alterações de schema são aditivas em 20261008150000_frontend_journey. Reutilizar auditoria, outbox, jobs e chaves existentes. Nunca aplicar migrations ou resetar dados de desenvolvimento para rodar testes.

## Verificação

- Filtros globais, ordenação monetária/área e preferências incompletas.
- Associação única, imóvel alheio indisponível, SAC com entradas válidas e limites.
- Dossiê sem cortes, imagens presentes e snapshot imutável após edição.

Verificar build, TypeScript, lint e testes pertinentes. Comparar telas com os PNGs em 390, 768 e 1440 px; evidências devem registrar comando, resultado e limitações.
