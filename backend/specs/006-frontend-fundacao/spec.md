# 006 — Fundação, sessão e perfis

Status: implementação integrada e validada; evidências e limites registrados em [tasks.md](tasks.md) e na [matriz dos protótipos](../../docs/prototype-matrix.md).

## Objetivo

Entregar React + Vite + TypeScript em frontend/, shell responsivo, cadastro/login e configurações dos perfis corretor e operador. A referência visual é o conjunto design/ aprovado em 08/10/2026.

## Requisitos e critérios de aceite

**CA-01:** Cadastro e login seguem validações existentes, incluindo senha mínima de 12 caracteres. Após login consultar GET /api/auth/me para identidade, permissões, CRECI, meta e resumo da própria carteira.

**CA-02:** JWT, identidade e cache somente em memória. Logout, expiração e 401 cancelam consultas, descartam respostas tardias e exigem novo login; retorno pós-login aceita somente rotas internas.

**CA-03:** Rotas /login, /cadastro e /configuracoes; navegação compartilhada protege todas as páginas de negócio. Operações só aparecem com a permissão atual.

**CA-04:** Adotar Manrope/Inter e tokens lavanda/azul de design/. Usar screen.png para composição, code.html para medidas e componentes; controles têm estados vazio, erro, carregando e processando.

**CA-05:** Publicar OpenAPI e tipos públicos; proxy /api em desenvolvimento. Não colocar detalhes de infraestrutura nos fluxos do produto.

## Defaults e limites comuns

Interface em português; BRL em centavos; horários de America/Sao_Paulo. Protótipos screen.png prevalecem para composição; code.html orienta medidas; design system define tokens. Backend aplica propriedade e permissões. Dossiês exigem sessão. Integrações externas, assinatura e pagamentos são simulações explícitas; não há publicação, links públicos ou captura/upload real de mídia nesta entrega.

## Cenários de verificação

- Cadastro, login inválido, /auth/me, recarga, logout e troca de conta.
- Resposta tardia após logout, 401, retorno externo bloqueado e papel revogado com mesmo JWT.
- Teclado, formulários, menu móvel e telas em 390/768/1440 px.

Rastreabilidade das telas: [matriz dos 27 protótipos](../../docs/prototype-matrix.md).
