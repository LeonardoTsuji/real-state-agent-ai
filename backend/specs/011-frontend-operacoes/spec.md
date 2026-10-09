# 011 — Operações e permissões

Status: implementação integrada e validada; evidências e limites registrados em [tasks.md](tasks.md) e na [matriz dos protótipos](../../docs/prototype-matrix.md).

## Objetivo

Entregar jobs recentes, detalhe/replay, métricas e acesso negado para operador.

## Requisitos e critérios de aceite

**CA-01:** Reutilizar GET /api/operations/jobs, GET jobs/:id, POST jobs/:id/replay, GET metrics e GET metrics/ai; mostrar apenas campos sanitizados.

**CA-02:** Consultas operacionais são globais com operations:read; replay exige operations:replay e confirmação. Rotas de negócio continuam limitadas à carteira própria do operador.

**CA-03:** Atualizar consultas a cada 10 segundos somente enquanto área estiver visível e autorizada. Listagem usa até 50 jobs recentes.

**CA-04:** Replay não possui retry automático; reenfileiramento aceito não equivale a job concluído. Métricas usam apenas dados efetivamente retornados.

**CA-05:** 403 interrompe atualização, elimina cache operacional e revalida /auth/me. Sessão pessoal válida é mantida; 401 encerra sessão.

## Defaults e limites comuns

Interface em português; BRL em centavos; horários de America/Sao_Paulo. Protótipos screen.png prevalecem para composição; code.html orienta medidas; design system define tokens. Backend aplica propriedade e permissões. Dossiês exigem sessão. Integrações externas, assinatura e pagamentos são simulações explícitas; não há publicação, links públicos ou captura/upload real de mídia nesta entrega.

## Cenários de verificação

- Corretor recebe 403; operador lê/reexecuta somente com permissão.
- Revogação com mesmo JWT, cache limpo e identidade pessoal preservada.
- Replay duplicado não automático, payloads ausentes e métricas sem invenção.

Rastreabilidade das telas: [matriz dos 27 protótipos](../../docs/prototype-matrix.md).
