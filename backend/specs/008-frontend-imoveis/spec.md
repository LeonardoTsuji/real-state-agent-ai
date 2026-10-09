# 008 — Catálogo, compatibilidade e dossiê

Status: implementação integrada e validada; evidências e limites registrados em [tasks.md](tasks.md) e na [matriz dos protótipos](../../docs/prototype-matrix.md).

## Objetivo

Implementar catálogo filtrável, associação e dossiê interno com galeria, comparação e simulador SAC.

## Requisitos e critérios de aceite

**CA-01:** Imóvel inclui código, endereço, subtipo, disponibilidade, área, suítes, banheiros, condomínio, IPTU, comodidades, mídias demonstrativas e acesso. Preservar PropertyType; studio/cobertura usam subtipo de APARTMENT.

**CA-02:** Filtros, busca e ordenação são aplicados no backend antes da paginação. Compatibilidade determinística considera preferências declaradas e retorna score e critérios; afinidade manual fica separada.

**CA-03:** Dossiê exige sessão autenticada, sem link público. Galeria e tour utilizam assets de demonstração; imagens quebradas devem ser substituídas.

**CA-04:** Simulador SAC permite ajustar entrada, prazo e taxa; apresenta estimativa em BRL, sem alegar aprovação de financiamento.

**CA-05:** Importação CSV reutiliza batches/jobs existentes, com prévia e relatório. Documento DOSSIER congela snapshot persistido para imprimir/baixar.

## Defaults e limites comuns

Interface em português; BRL em centavos; horários de America/Sao_Paulo. Protótipos screen.png prevalecem para composição; code.html orienta medidas; design system define tokens. Backend aplica propriedade e permissões. Dossiês exigem sessão. Integrações externas, assinatura e pagamentos são simulações explícitas; não há publicação, links públicos ou captura/upload real de mídia nesta entrega.

## Cenários de verificação

- Filtros globais, ordenação monetária/área e preferências incompletas.
- Associação única, imóvel alheio indisponível, SAC com entradas válidas e limites.
- Dossiê sem cortes, imagens presentes e snapshot imutável após edição.

Rastreabilidade das telas: [matriz dos 27 protótipos](../../docs/prototype-matrix.md).
