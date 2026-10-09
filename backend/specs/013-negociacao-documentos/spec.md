# 013 — Negociação, comissão e documentos

Status: implementação integrada e validada; evidências e limites registrados em [tasks.md](tasks.md) e na [matriz dos protótipos](../../docs/prototype-matrix.md).

## Objetivo

Entregar funil comercial, proposta comparativa, aceite simulado, honorários e documentos com snapshot.

## Requisitos e critérios de aceite

**CA-01:** Opportunity pertence ao broker e lead, com imóvel principal/alternativo distintos. stage comercial é FIRST_CONTACT/QUALIFICATION/VISIT_SCHEDULED/PROPOSAL_SENT/WON/LOST; manter separado de LeadStage.

**CA-02:** GET /api/commercial/pipeline retorna itens e métricas calculadas pelo servidor: VGV, comissão prevista, conversão e meta mensal. CRUD /opportunities mantém referências próprias.

**CA-03:** POST opportunities/:id/proposal exige chave e valueCents/validUntil/paymentTerms/sellerName, clauses e installments opcionais. Registrar histórico de contraproposta; parcelas devem totalizar comissão.

**CA-04:** POST :id/accept exige confirmed:true,simulated:true e chave. Apenas proposta ativa pode ser aceita; transição comercial/lead, comissão e parcelas são atômicas e idempotentes.

**CA-05:** Valores em centavos, comissão em pontos-base (padrão 600); arredondar comissão ao centavo. POST installments/:id/pay registra liquidação simulada; nenhuma assinatura/pagamento externo é executado.

**CA-06:** POST /api/commercial/documents gera snapshot DOSSIER/REPORT/VISIT_REPORT/DRAFT/ACCEPTANCE/RECEIPT. Recibo exige parcela paga e permanece único por parcela; GET documents/:id exige dono.

**CA-07:** Visualizar, imprimir e baixar PDF A4 com demonstração identificada. Snapshot preserva dados emitidos mesmo após edições; não anunciar homologação, certificação ou tributação real.

## Defaults e limites comuns

Interface em português; BRL em centavos; horários de America/Sao_Paulo. Protótipos screen.png prevalecem para composição; code.html orienta medidas; design system define tokens. Backend aplica propriedade e permissões. Dossiês exigem sessão. Integrações externas, assinatura e pagamentos são simulações explícitas; não há publicação, links públicos ou captura/upload real de mídia nesta entrega.

## Cenários de verificação

- Proposta inválida/expirada, parcelas divergentes, referências alheias e contraproposta.
- Aceite repetido, comissão de R$1,38milhão a 6%=R$82.800 e parcelas sem duplicidade.
- Recibo antes de pagamento rejeitado, recibo único, snapshot imutável e PDF sem cortes.

Rastreabilidade das telas: [matriz dos 27 protótipos](../../docs/prototype-matrix.md).
