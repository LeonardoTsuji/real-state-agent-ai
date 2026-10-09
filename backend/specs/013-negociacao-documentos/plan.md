# Plano técnico — 013 — Negociação, comissão e documentos

## Implementação

- Opportunity pertence ao broker e lead, com imóvel principal/alternativo distintos. stage comercial é FIRST_CONTACT/QUALIFICATION/VISIT_SCHEDULED/PROPOSAL_SENT/WON/LOST; manter separado de LeadStage.
- GET /api/commercial/pipeline retorna itens e métricas calculadas pelo servidor: VGV, comissão prevista, conversão e meta mensal. CRUD /opportunities mantém referências próprias.
- POST opportunities/:id/proposal exige chave e valueCents/validUntil/paymentTerms/sellerName, clauses e installments opcionais. Registrar histórico de contraproposta; parcelas devem totalizar comissão.
- POST :id/accept exige confirmed:true,simulated:true e chave. Apenas proposta ativa pode ser aceita; transição comercial/lead, comissão e parcelas são atômicas e idempotentes.
- Valores em centavos, comissão em pontos-base (padrão 600); arredondar comissão ao centavo. POST installments/:id/pay registra liquidação simulada; nenhuma assinatura/pagamento externo é executado.
- POST /api/commercial/documents gera snapshot DOSSIER/REPORT/VISIT_REPORT/DRAFT/ACCEPTANCE/RECEIPT. Recibo exige parcela paga e permanece único por parcela; GET documents/:id exige dono.
- Visualizar, imprimir e baixar PDF A4 com demonstração identificada. Snapshot preserva dados emitidos mesmo após edições; não anunciar homologação, certificação ou tributação real.

## Integração e migração

Manter backend NestJS em backend/ e frontend React em frontend/, com dependências e lockfiles próprios. Alterações de schema são aditivas em 20261008150000_frontend_journey. Reutilizar auditoria, outbox, jobs e chaves existentes. Nunca aplicar migrations ou resetar dados de desenvolvimento para rodar testes.

## Verificação

- Proposta inválida/expirada, parcelas divergentes, referências alheias e contraproposta.
- Aceite repetido, comissão de R$1,38milhão a 6%=R$82.800 e parcelas sem duplicidade.
- Recibo antes de pagamento rejeitado, recibo único, snapshot imutável e PDF sem cortes.

Verificar build, TypeScript, lint e testes pertinentes. Comparar telas com os PNGs em 390, 768 e 1440 px; evidências devem registrar comando, resultado e limitações.
