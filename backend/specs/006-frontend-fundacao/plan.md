# Plano técnico — 006 — Fundação, sessão e perfis

## Implementação

- Cadastro e login seguem validações existentes, incluindo senha mínima de 12 caracteres. Após login consultar GET /api/auth/me para identidade, permissões, CRECI, meta e resumo da própria carteira.
- JWT, identidade e cache somente em memória. Logout, expiração e 401 cancelam consultas, descartam respostas tardias e exigem novo login; retorno pós-login aceita somente rotas internas.
- Rotas /login, /cadastro e /configuracoes; navegação compartilhada protege todas as páginas de negócio. Operações só aparecem com a permissão atual.
- Adotar Manrope/Inter e tokens lavanda/azul de design/. Usar screen.png para composição, code.html para medidas e componentes; controles têm estados vazio, erro, carregando e processando.
- Publicar OpenAPI e tipos públicos; proxy /api em desenvolvimento. Não colocar detalhes de infraestrutura nos fluxos do produto.

## Integração e migração

Manter backend NestJS em backend/ e frontend React em frontend/, com dependências e lockfiles próprios. Alterações de schema são aditivas em 20261008150000_frontend_journey. Reutilizar auditoria, outbox, jobs e chaves existentes. Nunca aplicar migrations ou resetar dados de desenvolvimento para rodar testes.

## Verificação

- Cadastro, login inválido, /auth/me, recarga, logout e troca de conta.
- Resposta tardia após logout, 401, retorno externo bloqueado e papel revogado com mesmo JWT.
- Teclado, formulários, menu móvel e telas em 390/768/1440 px.

Verificar build, TypeScript, lint e testes pertinentes. Comparar telas com os PNGs em 390, 768 e 1440 px; evidências devem registrar comando, resultado e limitações.
