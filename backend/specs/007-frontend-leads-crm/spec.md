# 007 — Leads e CRM

Status: implementação integrada e validada; evidências e limites registrados em [tasks.md](tasks.md) e na [matriz dos protótipos](../../docs/prototype-matrix.md).

## Objetivo

Implementar listagem e detalhe de leads conforme os protótipos, com CRUD, preferências, associações, histórico e ligação com agenda/assistente.

## Requisitos e critérios de aceite

**CA-01:** GET /api/leads aplica busca textual, estágio, orçamento e período no servidor antes da paginação. Respostas incluem stage e resumos úteis; nunca filtrar apenas a página carregada.

**CA-02:** Criar/editar exige nome e pelo menos um contato; exclusão permanece lógica, confirmada pelo corretor. Campos omitidos são preservados; null somente onde permitido.

**CA-03:** Preferências, interações, tarefas e transições de qualificação seguem endpoints atuais e isolamento por broker, inclusive OPERATOR.

**CA-04:** Importação CSV possui prévia, validação e relatório por linha; POST /api/leads/import persiste idempotência em LeadImportBatch.

**CA-05:** O detalhe permite associação de imóvel, abertura contextual da agenda e conversas persistidas. Separar qualificação do lead da oportunidade comercial.

## Defaults e limites comuns

Interface em português; BRL em centavos; horários de America/Sao_Paulo. Protótipos screen.png prevalecem para composição; code.html orienta medidas; design system define tokens. Backend aplica propriedade e permissões. Dossiês exigem sessão. Integrações externas, assinatura e pagamentos são simulações explícitas; não há publicação, links públicos ou captura/upload real de mídia nesta entrega.

## Cenários de verificação

- Busca sobre mais de uma página, filtros combinados, contatos inválidos e exclusão lógica.
- Preferências parciais, transições inválidas, associação duplicada e importação repetida.
- 404 para carteira alheia e reconsulta após cada mutação.

Rastreabilidade das telas: [matriz dos 27 protótipos](../../docs/prototype-matrix.md).
